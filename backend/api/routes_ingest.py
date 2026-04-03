"""Ingestion API routes.

Handles file upload, ZIP upload, and folder upload endpoints.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks

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
        # ZIP extraction returns list of IngestedFiles
        await ingestion_service.ingest_zip(zip_path)
    except Exception as e:
        logger.error(f"Background ZIP ingestion error: {e}")


@router.post("/files", response_model=UploadResponse)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    ingestion_service=Depends(get_ingestion_service),
):
    """Upload one or more files for ingestion.

    Accepts: .md, .txt, .pdf, .docx files.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    saved_paths: list[str] = []
    file_infos: list[dict] = []

    for file in files:
        # Validate extension
        ext = Path(file.filename).suffix.lower()
        if ext not in settings.SUPPORTED_EXTENSIONS:
            logger.info(f"Skipping unsupported file: {file.filename}")
            continue

        # Save file to upload directory
        save_path = settings.UPLOAD_DIR / file.filename
        save_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            content = await file.read()
            with open(save_path, "wb") as f:
                f.write(content)

            saved_paths.append(str(save_path))
            file_infos.append({
                "name": file.filename,
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
    ingestion_service=Depends(get_ingestion_service),
):
    """Upload a ZIP file for extraction and ingestion."""
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip file")

    # Save ZIP
    zip_path = settings.UPLOAD_DIR / file.filename
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

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in settings.SUPPORTED_EXTENSIONS:
            continue

        # Preserve relative path structure
        relative_path = file.filename.replace("\\", "/")
        save_path = settings.UPLOAD_DIR / relative_path
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
