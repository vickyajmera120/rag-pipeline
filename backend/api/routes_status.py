"""Status and health API routes."""

import logging

from fastapi import APIRouter, Depends

from models.api_models import SystemStats

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Status"])


def get_services():
    """Dependency to get services from app state."""
    from main import app_state
    return app_state


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "RAG Pipeline"}


@router.get("/stats", response_model=SystemStats)
async def get_stats(services=Depends(get_services)):
    """Get system statistics about indexed documents."""
    vector_stats = services["vector_store"].get_stats()
    bm25_stats = services["bm25_store"].get_stats()

    # Estimate index size
    index_size_mb = 0.0
    try:
        faiss_path = services["vector_store"]._index_path
        if faiss_path.exists():
            index_size_mb = faiss_path.stat().st_size / (1024 * 1024)
    except Exception:
        pass

    return SystemStats(
        total_documents=vector_stats.get("unique_files", 0),
        total_chunks=vector_stats.get("total_chunks", 0),
        vector_dimensions=vector_stats.get("dimensions", 0),
        index_size_mb=round(index_size_mb, 2),
        bm25_indexed=bm25_stats.get("total_documents", 0),
    )
