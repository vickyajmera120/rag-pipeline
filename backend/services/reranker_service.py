"""Cross-encoder re-ranking service.

Uses a cross-encoder model to re-score query-document pairs
for high-precision relevance ranking.
"""

import logging
from typing import Optional

from sentence_transformers import CrossEncoder

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class RerankerService:
    """Cross-encoder based re-ranking for precision retrieval."""

    def __init__(self):
        self.model: Optional[CrossEncoder] = None
        self.model_name = settings.RERANKER_MODEL
        self.top_k = settings.TOP_K_RERANK

    def initialize(self):
        """Load the cross-encoder model."""
        if self.model is not None:
            return

        logger.info(f"Loading cross-encoder model: {self.model_name}")
        try:
            self.model = CrossEncoder(self.model_name)
            logger.info("Cross-encoder model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load cross-encoder: {e}")
            raise

    def rerank(
        self, query: str, candidates: list[dict], top_k: Optional[int] = None
    ) -> list[dict]:
        """Re-rank candidate chunks using the cross-encoder.

        The cross-encoder scores each (query, chunk_text) pair directly,
        providing much more accurate relevance scores than bi-encoder
        similarity alone.

        Args:
            query: User query string.
            candidates: List of chunk metadata dicts (must have 'text' key).
            top_k: Number of top results to return.

        Returns:
            List of chunk metadata dicts with 'rerank_score', sorted by relevance.
        """
        self.initialize()

        if not candidates:
            return []

        top_k = top_k or self.top_k

        # Prepare query-document pairs
        pairs = [(query, c.get("text", "")) for c in candidates]

        try:
            # Score all pairs
            scores = self.model.predict(pairs)

            # Attach scores and sort
            scored_candidates = []
            for candidate, score in zip(candidates, scores):
                candidate_copy = candidate.copy()
                candidate_copy["rerank_score"] = float(score)
                scored_candidates.append(candidate_copy)

            # Sort by rerank score descending
            scored_candidates.sort(key=lambda x: x["rerank_score"], reverse=True)

            # Return top-k
            result = scored_candidates[:top_k]

            logger.info(
                f"Reranked {len(candidates)} candidates → "
                f"top {len(result)} (best score: {result[0]['rerank_score']:.4f})"
            )

            return result

        except Exception as e:
            logger.error(f"Reranking error: {e}")
            # Fall back to returning candidates as-is
            return candidates[:top_k]
