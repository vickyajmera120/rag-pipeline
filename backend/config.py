"""Configuration management for the RAG backend."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Keys — pydantic-settings reads these from environment automatically
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Model Configuration
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS: int = 3072
    LLM_MODEL: str = "gpt-4o"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # Chunking Configuration
    CHUNK_SIZE: int = 500  # target tokens per chunk
    CHUNK_OVERLAP: int = 75  # overlap tokens between chunks
    MIN_CHUNK_SIZE: int = 100  # minimum tokens for a chunk
    MAX_CHUNK_SIZE: int = 700  # maximum tokens for a chunk

    # Retrieval Configuration
    TOP_K_RETRIEVAL: int = 20  # candidates from each retriever
    TOP_K_RERANK: int = 5  # final results after reranking
    RRF_K: int = 60  # RRF constant

    # Embedding Batch Configuration
    EMBEDDING_BATCH_SIZE: int = 512  # texts per API call

    # Context Configuration
    MAX_CONTEXT_TOKENS: int = 6000  # max tokens for LLM context
    MAX_CONVERSATION_TURNS: int = 5  # conversation history to keep

    # Storage Paths
    BASE_DIR: Path = Path(__file__).parent
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOAD_DIR: Path = STORAGE_DIR / "uploads"
    FAISS_DIR: Path = STORAGE_DIR / "faiss_index"
    BM25_DIR: Path = STORAGE_DIR / "bm25_index"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

    # Supported file types
    SUPPORTED_EXTENSIONS: set[str] = {".md", ".txt", ".pdf", ".docx"}

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def ensure_directories(self):
        """Create required storage directories."""
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.FAISS_DIR.mkdir(parents=True, exist_ok=True)
        self.BM25_DIR.mkdir(parents=True, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    settings = Settings()
    settings.ensure_directories()
    return settings
