"""BM25 keyword search index.

Provides sparse retrieval for hybrid search alongside FAISS.
"""

import json
import pickle
import re
import logging
from pathlib import Path
from typing import Optional

from rank_bm25 import BM25Okapi

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class BM25Store:
    """BM25-based keyword search index."""

    def __init__(self):
        self.bm25: Optional[BM25Okapi] = None
        self.corpus: list[str] = []  # original texts
        self.tokenized_corpus: list[list[str]] = []  # tokenized for BM25
        self.metadata: list[dict] = []  # parallel metadata
        self._corpus_path = settings.BM25_DIR / "corpus.json"
        self._initialized = False

    def initialize(self):
        """Initialize or load existing BM25 index."""
        if self._initialized:
            return

        if self._corpus_path.exists():
            self._load()
        else:
            self.corpus = []
            self.tokenized_corpus = []
            self.metadata = []
            self.bm25 = None
            logger.info("Created new BM25 index")

        self._initialized = True

    def add_documents(self, texts: list[str], metadata_list: list[dict]):
        """Add documents to the BM25 index.

        Args:
            texts: List of text strings.
            metadata_list: List of metadata dicts (parallel to texts).
        """
        self.initialize()

        new_tokenized = [self._tokenize(text) for text in texts]

        self.corpus.extend(texts)
        self.tokenized_corpus.extend(new_tokenized)
        self.metadata.extend(metadata_list)

        # Rebuild BM25 with full corpus
        self._rebuild_index()

        logger.info(
            f"Added {len(texts)} documents to BM25. "
            f"Total: {len(self.corpus)} documents"
        )

        self._save()

    def search(self, query: str, top_k: int = 20) -> list[tuple[dict, float]]:
        """Search using BM25 scoring.

        Args:
            query: Search query string.
            top_k: Number of results to return.

        Returns:
            List of (metadata, score) tuples.
        """
        self.initialize()

        if not self.bm25 or not self.corpus:
            return []

        tokenized_query = self._tokenize(query)
        scores = self.bm25.get_scores(tokenized_query)

        # Get top-k indices
        top_indices = scores.argsort()[::-1][:top_k]

        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                meta = self.metadata[idx].copy()
                meta["text"] = self.corpus[idx]
                results.append((meta, float(scores[idx])))

        return results

    def delete_by_file(self, file_path: str) -> int:
        """Remove all documents from a specific file.

        Args:
            file_path: Path of the file to remove.

        Returns:
            Number of documents removed.
        """
        self.initialize()

        keep_indices = []
        removed = 0
        for i, meta in enumerate(self.metadata):
            if meta.get("file_path") == file_path:
                removed += 1
            else:
                keep_indices.append(i)

        if removed == 0:
            return 0

        self.corpus = [self.corpus[i] for i in keep_indices]
        self.tokenized_corpus = [self.tokenized_corpus[i] for i in keep_indices]
        self.metadata = [self.metadata[i] for i in keep_indices]

        self._rebuild_index()
        self._save()

        logger.info(f"Removed {removed} documents from BM25 for {file_path}")
        return removed

    def update_file_paths(self, old_path: str, new_path: str) -> int:
        """Update file paths in metadata when files/folders are moved.

        Matches by exact path or path prefix (for folder moves).

        Args:
            old_path: The original file/folder path.
            new_path: The new file/folder path.

        Returns:
            Number of documents updated.
        """
        self.initialize()

        updated = 0
        old_norm = old_path.replace("\\", "/")
        new_norm = new_path.replace("\\", "/")

        for meta in self.metadata:
            meta_path = meta.get("file_path", "").replace("\\", "/")
            if meta_path == old_norm:
                meta["file_path"] = new_path
                updated += 1
            elif meta_path.startswith(old_norm + "/"):
                meta["file_path"] = new_path + meta_path[len(old_norm):]
                updated += 1

        if updated > 0:
            self._save()
            logger.info(f"Updated {updated} BM25 paths: {old_path} → {new_path}")

        return updated

    def get_stats(self) -> dict:
        """Get index statistics."""
        self.initialize()
        return {
            "total_documents": len(self.corpus),
            "unique_files": len(
                set(m.get("file_name", "") for m in self.metadata)
            ),
        }

    def _tokenize(self, text: str) -> list[str]:
        """Tokenize text for BM25: lowercase, remove punctuation, split.

        Args:
            text: Text to tokenize.

        Returns:
            List of token strings.
        """
        text = text.lower()
        text = re.sub(r"[^\w\s]", " ", text)
        tokens = text.split()
        # Remove very short tokens
        tokens = [t for t in tokens if len(t) > 1]
        return tokens

    def _rebuild_index(self):
        """Rebuild the BM25 index from the tokenized corpus."""
        if self.tokenized_corpus:
            self.bm25 = BM25Okapi(self.tokenized_corpus)
        else:
            self.bm25 = None

    def _save(self):
        """Persist corpus and metadata to disk."""
        try:
            data = {
                "corpus": self.corpus,
                "tokenized_corpus": self.tokenized_corpus,
                "metadata": self.metadata,
            }
            with open(self._corpus_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            logger.debug("BM25 index saved to disk")
        except Exception as e:
            logger.error(f"Failed to save BM25 index: {e}")

    def _load(self):
        """Load corpus and metadata from disk."""
        try:
            with open(self._corpus_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            self.corpus = data.get("corpus", [])
            self.tokenized_corpus = data.get("tokenized_corpus", [])
            self.metadata = data.get("metadata", [])

            self._rebuild_index()

            logger.info(
                f"Loaded BM25 index: {len(self.corpus)} documents"
            )
        except Exception as e:
            logger.error(f"Failed to load BM25 index: {e}")
            self.corpus = []
            self.tokenized_corpus = []
            self.metadata = []
            self.bm25 = None
