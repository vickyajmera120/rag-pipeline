"""Embedding service using OpenAI API.

Handles batch embedding with rate limiting and deduplication.
"""

import logging
import hashlib
from typing import Optional

import numpy as np
from openai import OpenAI

from config import get_settings
from models.document import DocumentChunk

logger = logging.getLogger(__name__)

settings = get_settings()


class EmbeddingService:
    """Generates embeddings using OpenAI API with batch processing."""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.EMBEDDING_MODEL
        self.dimensions = settings.EMBEDDING_DIMENSIONS
        self.batch_size = settings.EMBEDDING_BATCH_SIZE
        self._hash_cache: set[str] = set()  # track embedded content hashes

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        """Embed a list of texts using OpenAI API.

        Args:
            texts: List of text strings to embed.

        Returns:
            numpy array of shape (len(texts), dimensions).
        """
        if not texts:
            return np.array([]).reshape(0, self.dimensions)

        all_embeddings: list[list[float]] = []

        # Process in batches
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            logger.info(
                f"Embedding batch {i // self.batch_size + 1}/"
                f"{(len(texts) - 1) // self.batch_size + 1} "
                f"({len(batch)} texts)"
            )

            try:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=batch,
                    dimensions=self.dimensions,
                )

                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)

            except Exception as e:
                logger.error(f"Embedding API error: {e}")
                raise

        embeddings = np.array(all_embeddings, dtype=np.float32)

        # Normalize for cosine similarity with FAISS IndexFlatIP
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1  # avoid division by zero
        embeddings = embeddings / norms

        return embeddings

    def embed_query(self, query: str) -> np.ndarray:
        """Embed a single query text.

        Args:
            query: Query text to embed.

        Returns:
            numpy array of shape (1, dimensions).
        """
        return self.embed_texts([query])

    def embed_chunks(
        self, chunks: list[DocumentChunk]
    ) -> tuple[list[DocumentChunk], np.ndarray]:
        """Embed chunks, skipping duplicates based on content hash.

        Args:
            chunks: List of DocumentChunk objects.

        Returns:
            Tuple of (new_chunks, embeddings) excluding duplicates.
        """
        new_chunks: list[DocumentChunk] = []
        texts_to_embed: list[str] = []

        for chunk in chunks:
            if chunk.content_hash not in self._hash_cache:
                new_chunks.append(chunk)
                texts_to_embed.append(chunk.text)
                self._hash_cache.add(chunk.content_hash)
            else:
                logger.debug(f"Skipping duplicate chunk: {chunk.content_hash[:12]}")

        if not texts_to_embed:
            logger.info("All chunks were duplicates, nothing to embed.")
            return [], np.array([]).reshape(0, self.dimensions)

        logger.info(
            f"Embedding {len(texts_to_embed)} new chunks "
            f"(skipped {len(chunks) - len(texts_to_embed)} duplicates)"
        )

        embeddings = self.embed_texts(texts_to_embed)
        return new_chunks, embeddings

    def load_existing_hashes(self, hashes: set[str]):
        """Load existing content hashes from persisted state.

        Args:
            hashes: Set of content hashes already embedded.
        """
        self._hash_cache = hashes
        logger.info(f"Loaded {len(hashes)} existing content hashes")
