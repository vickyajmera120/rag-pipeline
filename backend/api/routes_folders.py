"""Folder management API routes.

Handles virtual folder organization backed by disk directories.
Folder structure is stored as JSON metadata AND mirrored on disk.
"""

import json
import logging
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

router = APIRouter(prefix="/api/folders", tags=["Folders"])

# Path to folder structure JSON
FOLDERS_FILE = settings.STORAGE_DIR / "folders.json"


def _read_folders() -> dict:
    """Read folder structure from disk."""
    if FOLDERS_FILE.exists():
        try:
            with open(FOLDERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading folders.json: {e}")
    return {"folders": [], "fileAssignments": {}}


def _write_folders(data: dict):
    """Write folder structure to disk."""
    try:
        FOLDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(FOLDERS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error writing folders.json: {e}")
        raise HTTPException(status_code=500, detail="Failed to save folder structure")


def _resolve_folder_path(folder_id: str, folders: list) -> str:
    """Build the disk path for a folder by walking up the hierarchy.

    Args:
        folder_id: The folder ID to resolve.
        folders: List of all folder objects.

    Returns:
        Relative path string like "Projects/Research/2024".
    """
    path_parts = []
    current_id = folder_id
    visited = set()

    while current_id:
        if current_id in visited:
            break  # Prevent infinite loop
        visited.add(current_id)

        folder = next((f for f in folders if f["id"] == current_id), None)
        if not folder:
            break
        path_parts.insert(0, folder["name"])
        current_id = folder.get("parentId")

    return "/".join(path_parts)


@router.get("")
async def get_folders():
    """Get the folder structure.

    Returns a dict with:
    - folders: List of folder objects {id, name, parentId}
    - fileAssignments: Dict mapping file_id -> folder_id
    """
    return _read_folders()


@router.put("")
async def save_folders(body: dict):
    """Save the complete folder structure.

    Expects:
    - folders: List of folder objects {id, name, parentId}
    - fileAssignments: Dict mapping file_id -> folder_id
    """
    folders = body.get("folders", [])
    file_assignments = body.get("fileAssignments", {})

    data = {
        "folders": folders,
        "fileAssignments": file_assignments,
    }

    _write_folders(data)
    return {"message": "Folders saved", "folder_count": len(folders)}


@router.post("/create")
async def create_folder(body: dict):
    """Create a new folder — both in metadata and on disk.

    Body:
        id: Folder ID
        name: Folder name
        parentId: Parent folder ID (null for root)
    """
    folder_id = body.get("id")
    name = body.get("name", "").strip()
    parent_id = body.get("parentId")

    if not folder_id or not name:
        raise HTTPException(status_code=400, detail="id and name are required")

    data = _read_folders()
    folders = data.get("folders", [])

    # Add to metadata
    new_folder = {"id": folder_id, "name": name, "parentId": parent_id}
    folders.append(new_folder)
    data["folders"] = folders
    _write_folders(data)

    # Create directory on disk
    folder_path = _resolve_folder_path(folder_id, folders)
    disk_path = settings.UPLOAD_DIR / folder_path
    disk_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"Created folder on disk: {disk_path}")

    return {"message": "Folder created", "id": folder_id, "path": folder_path}


@router.post("/rename")
async def rename_folder(body: dict):
    """Rename a folder — both in metadata and on disk.

    Body:
        id: Folder ID
        newName: New folder name
    """
    folder_id = body.get("id")
    new_name = body.get("newName", "").strip()

    if not folder_id or not new_name:
        raise HTTPException(status_code=400, detail="id and newName are required")

    data = _read_folders()
    folders = data.get("folders", [])

    # Get old path before rename
    old_disk_path = settings.UPLOAD_DIR / _resolve_folder_path(folder_id, folders)

    # Update metadata
    for folder in folders:
        if folder["id"] == folder_id:
            folder["name"] = new_name
            break

    data["folders"] = folders
    _write_folders(data)

    # Rename directory on disk
    new_disk_path = settings.UPLOAD_DIR / _resolve_folder_path(folder_id, folders)
    if old_disk_path.exists() and old_disk_path != new_disk_path:
        try:
            old_disk_path.rename(new_disk_path)
            logger.info(f"Renamed folder on disk: {old_disk_path} → {new_disk_path}")

            # Update ingestion service paths
            try:
                from main import app_state
                ingestion_service = app_state.get("ingestion_service")
                if ingestion_service:
                    ingestion_service.vector_store.update_file_paths(
                        str(old_disk_path), str(new_disk_path)
                    )
                    ingestion_service.bm25_store.update_file_paths(
                        str(old_disk_path), str(new_disk_path)
                    )
                    # Update tracked file paths
                    old_prefix = str(old_disk_path).replace("\\", "/")
                    new_prefix = str(new_disk_path).replace("\\", "/")
                    for f in ingestion_service._files.values():
                        fp = f.file_path.replace("\\", "/")
                        if fp.startswith(old_prefix):
                            f.file_path = new_prefix + fp[len(old_prefix):]
            except Exception as e:
                logger.error(f"Error updating index paths after rename: {e}")

        except Exception as e:
            logger.error(f"Error renaming folder on disk: {e}")

    return {"message": "Folder renamed", "id": folder_id, "newName": new_name}


@router.post("/delete")
async def delete_folder(body: dict):
    """Delete a folder — remove metadata and clean up empty directory.

    Files are reassigned to parent before deletion.
    Body:
        id: Folder ID
    """
    folder_id = body.get("id")
    if not folder_id:
        raise HTTPException(status_code=400, detail="id is required")

    data = _read_folders()
    folders = data.get("folders", [])

    # Get folder path before removal
    folder_path = _resolve_folder_path(folder_id, folders)
    disk_path = settings.UPLOAD_DIR / folder_path

    # Find the folder to get parentId
    folder = next((f for f in folders if f["id"] == folder_id), None)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    parent_id = folder.get("parentId")

    # Reassign files to parent
    file_assignments = data.get("fileAssignments", {})
    for file_id, fid in list(file_assignments.items()):
        if fid == folder_id:
            file_assignments[file_id] = parent_id

    # Move subfolders to parent
    data["folders"] = [
        {**f, "parentId": parent_id} if f.get("parentId") == folder_id else f
        for f in folders
        if f["id"] != folder_id
    ]
    data["fileAssignments"] = file_assignments
    _write_folders(data)

    # Clean up empty directory on disk
    if disk_path.exists() and disk_path.is_dir():
        try:
            # Only remove if empty (files should have been moved)
            if not any(disk_path.iterdir()):
                disk_path.rmdir()
                logger.info(f"Removed empty folder from disk: {disk_path}")
        except Exception as e:
            logger.error(f"Error removing folder from disk: {e}")

    return {"message": "Folder deleted", "id": folder_id}


@router.get("/resolve-path/{folder_id}")
async def resolve_folder_path(folder_id: str):
    """Get the disk path for a folder by its ID."""
    data = _read_folders()
    folders = data.get("folders", [])
    path = _resolve_folder_path(folder_id, folders)
    return {"folder_id": folder_id, "path": path}
