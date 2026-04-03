"""Folder management API routes.

Handles virtual folder organization for the file manager.
Folders are stored as JSON metadata — files remain flat on disk.
"""

import json
import logging
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
