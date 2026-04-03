"""API request and response models."""

from pydantic import BaseModel, Field
from typing import Optional


# ── Ingestion Models ──

class UploadResponse(BaseModel):
    """Response after file upload."""
    message: str
    files: list[dict]
    total_files: int


class FileStatusResponse(BaseModel):
    """Status of a single ingested file."""
    file_id: str
    file_name: str
    file_path: str
    file_size: int
    document_type: str
    status: str
    chunk_count: int
    error_message: Optional[str] = None


class IngestionStatusResponse(BaseModel):
    """Overall ingestion status."""
    total_files: int
    indexed: int
    processing: int
    errored: int
    files: list[FileStatusResponse]


# ── Query Models ──

class QueryRequest(BaseModel):
    """Request for querying the RAG system."""
    query: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=10)
    file_ids: Optional[list[str]] = None  # Scope search to specific files


class SourceReference(BaseModel):
    """A source reference in a query response."""
    file_name: str
    file_path: str
    section_title: str
    snippet: str
    relevance_score: float


class QueryResponse(BaseModel):
    """Response from a query."""
    answer: str
    sources: list[SourceReference]
    conversation_id: str
    query: str


# ── Conversation Models ──

class ConversationMessage(BaseModel):
    """A single message in a conversation."""
    role: str  # "user" or "assistant"
    content: str
    sources: list[SourceReference] = []


class ConversationResponse(BaseModel):
    """Response with conversation details."""
    conversation_id: str
    messages: list[ConversationMessage]


class ConversationListItem(BaseModel):
    """Summary of a conversation for listing."""
    conversation_id: str
    title: str
    message_count: int
    last_message: str


# ── Stats Models ──

class SystemStats(BaseModel):
    """System statistics."""
    total_documents: int
    total_chunks: int
    vector_dimensions: int
    index_size_mb: float
    bm25_indexed: int
