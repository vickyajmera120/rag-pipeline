"""FAISS vector store for semantic search.

Manages FAISS index with metadata storage and persistence.
"""

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import faiss

from config import get_settings
from models.document import DocumentChunk

logger = logging.getLogger(__name__)

settings = get_settings()


class VectorStore:
    """FAISS-backed vector store with metadata management."""

    def __init__(self):
        self.dimensions = settings.EMBEDDING_DIMENSIONS
        self.index: Optional[faiss.IndexFlatIP] = None
        self.chunks: list[dict] = []  # parallel list of chunk metadata
        self._index_path = settings.FAISS_DIR / "index.faiss"
        self._metadata_path = settings.FAISS_DIR / "metadata.json"
        self._initialized = False

    def initialize(self):
        """Initialize or load existing FAISS index."""
        if self._initialized:
            return

        if self._index_path.exists() and self._metadata_path.exists():
            self._load()
        else:
            self.index = faiss.IndexFlatIP(self.dimensions)
            self.chunks = []
            logger.info(f"Created new FAISS index (dims={self.dimensions})")

        self._initialized = True

    def add_embeddings(
        self, embeddings: np.ndarray, chunks: list[DocumentChunk]
    ):
        """Add embeddings and their chunk metadata to the index.

        Args:
            embeddings: numpy array of shape (n, dimensions).
            chunks: List of DocumentChunk objects (parallel to embeddings).
        """
        self.initialize()

        if len(embeddings) == 0:
            return

        if len(embeddings) != len(chunks):
            raise ValueError(
                f"Embeddings ({len(embeddings)}) and chunks ({len(chunks)}) "
                f"length mismatch"
            )

        # Add to FAISS index
        self.index.add(embeddings)

        # Store metadata
        for chunk in chunks:
            self.chunks.append(chunk.to_dict())

        logger.info(
            f"Added {len(embeddings)} vectors. "
            f"Total: {self.index.ntotal} vectors"
        )

        # Persist
        self._save()

    def search(
        self, query_embedding: np.ndarray, top_k: int = 20
    ) -> list[tuple[dict, float]]:
        """Search for similar vectors.

        Args:
            query_embedding: numpy array of shape (1, dimensions).
            top_k: Number of results to return.

        Returns:
            List of (chunk_metadata, similarity_score) tuples.
        """
        self.initialize()

        if self.index.ntotal == 0:
            return []

        k = min(top_k, self.index.ntotal)
        scores, indices = self.index.search(query_embedding, k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.chunks):
                continue
            results.append((self.chunks[idx], float(score)))

        return results

    def delete_by_file(self, file_path: str) -> int:
        """Delete all chunks from a specific file.

        Note: FAISS doesn't support deletion natively, so we rebuild.

        Args:
            file_path: Path of the file whose chunks should be removed.

        Returns:
            Number of chunks removed.
        """
        self.initialize()

        if not self.chunks:
            return 0

        # Find indices to keep
        keep_indices = []
        removed = 0
        for i, chunk in enumerate(self.chunks):
            if chunk.get("file_path") == file_path:
                removed += 1
            else:
                keep_indices.append(i)

        if removed == 0:
            return 0

        # Rebuild index with remaining vectors
        if keep_indices:
            # Reconstruct vectors for kept indices
            all_vectors = np.array(
                [self.index.reconstruct(i) for i in keep_indices],
                dtype=np.float32,
            )
            new_chunks = [self.chunks[i] for i in keep_indices]

            self.index = faiss.IndexFlatIP(self.dimensions)
            self.index.add(all_vectors)
            self.chunks = new_chunks
        else:
            self.index = faiss.IndexFlatIP(self.dimensions)
            self.chunks = []

        self._save()
        logger.info(f"Removed {removed} chunks for {file_path}")
        return removed

    def get_stats(self) -> dict:
        """Get index statistics."""
        self.initialize()
        return {
            "total_vectors": self.index.ntotal,
            "dimensions": self.dimensions,
            "total_chunks": len(self.chunks),
            "unique_files": len(
                set(c.get("file_name", "") for c in self.chunks)
            ),
        }

    def get_all_hashes(self) -> set[str]:
        """Get all content hashes in the store."""
        self.initialize()
        return {c.get("content_hash", "") for c in self.chunks if c.get("content_hash")}

    def _save(self):
        """Persist index and metadata to disk."""
        try:
            faiss.write_index(self.index, str(self._index_path))
            with open(self._metadata_path, "w", encoding="utf-8") as f:
                json.dump(self.chunks, f, ensure_ascii=False)
            logger.debug("FAISS index saved to disk")
        except Exception as e:
            logger.error(f"Failed to save FAISS index: {e}")

    def _load(self):
        """Load index and metadata from disk."""
        try:
            self.index = faiss.read_index(str(self._index_path))
            with open(self._metadata_path, "r", encoding="utf-8") as f:
                self.chunks = json.load(f)
            logger.info(
                f"Loaded FAISS index: {self.index.ntotal} vectors, "
                f"{len(self.chunks)} chunks"
            )
        except Exception as e:
            logger.error(f"Failed to load FAISS index: {e}")
            self.index = faiss.IndexFlatIP(self.dimensions)
            self.chunks = []
