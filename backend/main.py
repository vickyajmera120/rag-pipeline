"""FastAPI application entry point.

Initializes all services and registers API routes.
# Storage cleanup reload trigger.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

settings = get_settings()

# Global app state for service instances
app_state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, cleanup on shutdown."""
    logger.info("=" * 60)
    logger.info("  RAG Pipeline — Starting Up")
    logger.info("=" * 60)

    # Ensure directories exist
    settings.ensure_directories()

    # Initialize services
    from services.document_parser import DocumentParser
    from services.chunking_service import ChunkingService
    from services.embedding_service import EmbeddingService
    from services.vector_store import VectorStore
    from services.bm25_store import BM25Store
    from services.retrieval_service import RetrievalService
    from services.reranker_service import RerankerService
    from services.query_service import QueryService
    from services.ingestion_service import IngestionService

    # Create service instances
    parser = DocumentParser()
    chunker = ChunkingService()
    embedding_service = EmbeddingService()
    vector_store = VectorStore()
    bm25_store = BM25Store()

    # Initialize stores (load from disk)
    vector_store.initialize()
    bm25_store.initialize()

    # Load existing hashes for deduplication
    existing_hashes = vector_store.get_all_hashes()
    embedding_service.load_existing_hashes(existing_hashes)

    # Create retrieval pipeline
    retrieval_service = RetrievalService(
        vector_store=vector_store,
        bm25_store=bm25_store,
        embedding_service=embedding_service,
    )

    # Initialize reranker (loads model)
    reranker_service = RerankerService()
    logger.info("Loading cross-encoder model (first run may download ~80MB)...")
    reranker_service.initialize()

    # Create ingestion orchestrator
    ingestion_service = IngestionService(
        parser=parser,
        chunker=chunker,
        embedding_service=embedding_service,
        vector_store=vector_store,
        bm25_store=bm25_store,
    )

    # Create query engine
    query_service = QueryService(
        retrieval_service=retrieval_service,
        reranker_service=reranker_service,
        ingestion_service=ingestion_service,
    )

    # Store in app state
    app_state.update({
        "parser": parser,
        "chunker": chunker,
        "embedding_service": embedding_service,
        "vector_store": vector_store,
        "bm25_store": bm25_store,
        "retrieval_service": retrieval_service,
        "reranker_service": reranker_service,
        "query_service": query_service,
        "ingestion_service": ingestion_service,
    })

    logger.info("=" * 60)
    logger.info("  All services initialized — Ready!")
    logger.info(f"  Vector store: {vector_store.get_stats()['total_vectors']} vectors")
    logger.info(f"  BM25 store: {bm25_store.get_stats()['total_documents']} documents")
    logger.info("=" * 60)

    yield

    # Cleanup
    logger.info("Shutting down RAG Pipeline...")
    app_state.clear()


# Create FastAPI app
app = FastAPI(
    title="RAG Pipeline API",
    description="Production-grade Retrieval-Augmented Generation system",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
from api.routes_ingest import router as ingest_router
from api.routes_query import router as query_router
from api.routes_status import router as status_router
from api.routes_folders import router as folders_router

app.include_router(ingest_router)
app.include_router(query_router)
app.include_router(status_router)
app.include_router(folders_router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "RAG Pipeline",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }
