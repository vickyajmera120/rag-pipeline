"""Data models for documents and chunks."""

from dataclasses import dataclass, field
from typing import Optional
import uuid


@dataclass
class DocumentSection:
    """Represents a section extracted from a document."""
    title: str
    content: str
    level: int  # heading level (1=H1, 2=H2, etc.)
    metadata: dict = field(default_factory=dict)


@dataclass
class DocumentChunk:
    """Represents a processed chunk ready for embedding."""
    chunk_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    text: str = ""
    file_name: str = ""
    file_path: str = ""
    document_type: str = ""
    section_title: str = ""
    chunk_index: int = 0
    total_chunks: int = 0
    token_count: int = 0
    content_hash: str = ""  # for deduplication

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "text": self.text,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "document_type": self.document_type,
            "section_title": self.section_title,
            "chunk_index": self.chunk_index,
            "total_chunks": self.total_chunks,
            "token_count": self.token_count,
            "content_hash": self.content_hash,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DocumentChunk":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class ParsedDocument:
    """Represents a fully parsed document."""
    file_name: str
    file_path: str
    document_type: str
    sections: list[DocumentSection] = field(default_factory=list)
    raw_text: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class IngestedFile:
    """Tracks an ingested file and its processing status."""
    file_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    file_name: str = ""
    file_path: str = ""
    file_size: int = 0
    document_type: str = ""
    status: str = "pending"  # pending, parsing, chunking, embedding, indexed, error
    chunk_count: int = 0
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "file_id": self.file_id,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "document_type": self.document_type,
            "status": self.status,
            "chunk_count": self.chunk_count,
            "error_message": self.error_message,
        }
