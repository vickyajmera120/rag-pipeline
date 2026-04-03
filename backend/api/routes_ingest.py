"""Ingestion API routes.

Handles file upload, ZIP upload, folder upload, file move, and download endpoints.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse

from config import get_settings
from models.api_models import UploadResponse, IngestionStatusResponse

logger = logging.getLogger(__name__)

settings = get_settings()

router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])


def get_ingestion_service():
    """Dependency to get ingestion service from app state."""
    from main import app_state
    return app_state["ingestion_service"]


async def _run_ingestion_files(ingestion_service, files):
    """Background task to run file ingestion."""
    try:
        await ingestion_service.process_ingested_files(files)
    except Exception as e:
        logger.error(f"Background ingestion error: {e}")


async def _run_ingestion_zip(ingestion_service, zip_path):
    """Background task to run ZIP ingestion."""
    try:
        await ingestion_service.ingest_zip(zip_path)
    except Exception as e:
        logger.error(f"Background ZIP ingestion error: {e}")


@router.post("/files", response_model=UploadResponse)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    folder_path: str = Form(""),
    ingestion_service=Depends(get_ingestion_service),
):
    """Upload one or more files for ingestion.

    Accepts: .md, .txt, .pdf, .docx files.
    Optional folder_path to place files in a subfolder under uploads/.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    saved_paths: list[str] = []
    file_infos: list[dict] = []

    # Determine target directory
    if folder_path and folder_path.strip():
        target_dir = settings.UPLOAD_DIR / folder_path.strip().replace("\\", "/")
    else:
        target_dir = settings.UPLOAD_DIR

    target_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        # Validate extension
        ext = Path(file.filename).suffix.lower()
        if ext not in settings.SUPPORTED_EXTENSIONS:
            logger.info(f"Skipping unsupported file: {file.filename}")
            continue

        # Save file to target directory
        save_path = target_dir / Path(file.filename).name
        save_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            content = await file.read()
            with open(save_path, "wb") as f:
                f.write(content)

            saved_paths.append(str(save_path))
            file_infos.append({
                "name": Path(file.filename).name,
                "size": len(content),
                "type": ext,
            })
        except Exception as e:
            logger.error(f"Error saving {file.filename}: {e}")

    if not saved_paths:
        raise HTTPException(
            status_code=400,
            detail="No supported files found. Supported: .md, .txt, .pdf, .docx",
        )

    # Register files immediately so they appear in status as pending
    ingested_files = ingestion_service.register_files(saved_paths)

    # Run ingestion in background
    background_tasks.add_task(_run_ingestion_files, ingestion_service, ingested_files)

    return UploadResponse(
        message=f"Processing {len(saved_paths)} file(s)",
        files=file_infos,
        total_files=len(saved_paths),
    )


@router.post("/zip", response_model=UploadResponse)
async def upload_zip(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_path: str = Form(""),
    ingestion_service=Depends(get_ingestion_service),
):
    """Upload a ZIP file for extraction and ingestion."""
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip file")

    # Determine target directory
    if folder_path and folder_path.strip():
        target_dir = settings.UPLOAD_DIR / folder_path.strip().replace("\\", "/")
    else:
        target_dir = settings.UPLOAD_DIR

    target_dir.mkdir(parents=True, exist_ok=True)

    # Save ZIP
    zip_path = target_dir / file.filename
    try:
        content = await file.read()
        with open(zip_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving ZIP: {e}")

    # Run ingestion in background
    background_tasks.add_task(_run_ingestion_zip, ingestion_service, str(zip_path))

    return UploadResponse(
        message=f"Processing ZIP: {file.filename}",
        files=[{"name": file.filename, "size": len(content), "type": "zip"}],
        total_files=1,
    )


@router.post("/folder", response_model=UploadResponse)
async def upload_folder(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    folder_path: str = Form(""),
    ingestion_service=Depends(get_ingestion_service),
):
    """Upload multiple files preserving folder structure.

    The webkitRelativePath or file path metadata is used to
    maintain the directory hierarchy.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    saved_paths: list[str] = []
    file_infos: list[dict] = []

    # Determine base target directory
    if folder_path and folder_path.strip():
        base_target = settings.UPLOAD_DIR / folder_path.strip().replace("\\", "/")
    else:
        base_target = settings.UPLOAD_DIR

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in settings.SUPPORTED_EXTENSIONS:
            continue

        # Preserve relative path structure
        relative_path = file.filename.replace("\\", "/")
        save_path = base_target / relative_path
        save_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            content = await file.read()
            with open(save_path, "wb") as f:
                f.write(content)

            saved_paths.append(str(save_path))
            file_infos.append({
                "name": Path(file.filename).name,
                "path": relative_path,
                "size": len(content),
                "type": ext,
            })
        except Exception as e:
            logger.error(f"Error saving {file.filename}: {e}")

    if not saved_paths:
        raise HTTPException(
            status_code=400,
            detail="No supported files found in the uploaded folder.",
        )

    # Register files immediately so they appear in status
    ingested_files = ingestion_service.register_files(saved_paths)

    # Run ingestion in background
    background_tasks.add_task(_run_ingestion_files, ingestion_service, ingested_files)

    return UploadResponse(
        message=f"Processing {len(saved_paths)} file(s) from folder",
        files=file_infos,
        total_files=len(saved_paths),
    )


@router.get("/status", response_model=IngestionStatusResponse)
async def get_ingestion_status(
    ingestion_service=Depends(get_ingestion_service),
):
    """Get current ingestion processing status."""
    status = ingestion_service.get_status()
    return IngestionStatusResponse(**status)


@router.get("/files")
async def list_ingested_files(
    ingestion_service=Depends(get_ingestion_service),
):
    """List all ingested files."""
    return ingestion_service.get_files()


@router.delete("/file/{file_id}")
async def delete_file(
    file_id: str,
    ingestion_service=Depends(get_ingestion_service),
):
    """Remove an ingested file and its chunks from all indices."""
    deleted = await ingestion_service.delete_file(file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File deleted successfully", "file_id": file_id}


@router.patch("/file/{file_id}")
async def rename_file(
    file_id: str,
    body: dict,
    ingestion_service=Depends(get_ingestion_service),
):
    """Rename an ingested file."""
    new_name = body.get("name")
    if not new_name or not new_name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    renamed = ingestion_service.rename_file(file_id, new_name.strip())
    if not renamed:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File renamed", "file_id": file_id, "name": new_name.strip()}


@router.post("/move")
async def move_file(
    body: dict,
    ingestion_service=Depends(get_ingestion_service),
):
    """Move a file to a new folder on disk and update index paths.

    Body:
        file_id: ID of the file to move.
        dest_folder_path: Relative folder path under uploads/ (e.g. "Projects/Research").
    """
    file_id = body.get("file_id")
    dest_folder_path = body.get("dest_folder_path", "")

    if not file_id:
        raise HTTPException(status_code=400, detail="file_id is required")

    ingested = ingestion_service.get_file_by_id(file_id)
    if not ingested:
        raise HTTPException(status_code=404, detail="File not found")

    # Build destination path
    if dest_folder_path and dest_folder_path.strip():
        dest_dir = settings.UPLOAD_DIR / dest_folder_path.strip().replace("\\", "/")
    else:
        dest_dir = settings.UPLOAD_DIR

    dest_path = dest_dir / ingested.file_name

    moved = ingestion_service.move_file(file_id, str(dest_path))
    if not moved:
        raise HTTPException(status_code=500, detail="Failed to move file")

    return {
        "message": "File moved successfully",
        "file_id": file_id,
        "new_path": str(dest_path),
    }


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    ingestion_service=Depends(get_ingestion_service),
):
    """Download an ingested file."""
    ingested = ingestion_service.get_file_by_id(file_id)
    if not ingested:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(ingested.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(file_path),
        filename=ingested.file_name,
        media_type="application/octet-stream",
    )
