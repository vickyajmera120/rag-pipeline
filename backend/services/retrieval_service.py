"""Hybrid retrieval service with Reciprocal Rank Fusion.

Combines semantic search (FAISS) and keyword search (BM25)
using RRF for score-agnostic result merging.
"""

import logging
from typing import Optional

import numpy as np

from config import get_settings
from services.vector_store import VectorStore
from services.bm25_store import BM25Store
from services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

settings = get_settings()


class RetrievalService:
    """Hybrid retrieval combining semantic and keyword search."""

    def __init__(
        self,
        vector_store: VectorStore,
        bm25_store: BM25Store,
        embedding_service: EmbeddingService,
    ):
        self.vector_store = vector_store
        self.bm25_store = bm25_store
        self.embedding_service = embedding_service
        self.top_k = settings.TOP_K_RETRIEVAL
        self.rrf_k = settings.RRF_K

    def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        file_paths: Optional[list[str]] = None,
    ) -> list[dict]:
        """Retrieve relevant chunks using hybrid search + RRF.

        Pipeline:
        1. Semantic search via FAISS
        2. Keyword search via BM25
        3. Reciprocal Rank Fusion to merge results
        4. (Optional) Filter by file_paths for scoped search
        5. Return deduplicated, ranked results

        Args:
            query: User query string.
            top_k: Number of results to return (default: settings.TOP_K_RETRIEVAL).
            file_paths: Optional list of file paths to restrict results to.
                        When None, all results pass through (default).

        Returns:
            List of chunk metadata dicts sorted by relevance, with scores.
        """
        top_k = top_k or self.top_k

        # Stage 1: Semantic search
        semantic_results = self._semantic_search(query, top_k)
        logger.info(f"Semantic search returned {len(semantic_results)} results")

        # Stage 2: Keyword search
        keyword_results = self._keyword_search(query, top_k)
        logger.info(f"Keyword search returned {len(keyword_results)} results")

        # Stage 3: Reciprocal Rank Fusion
        fused_results = self._reciprocal_rank_fusion(
            semantic_results, keyword_results
        )

        # Stage 4: Apply file scope filter (if provided)
        if file_paths:
            path_set = set(file_paths)
            fused_results = [
                r for r in fused_results
                if r.get("file_path") in path_set
            ]
            logger.info(
                f"File scope filter applied: {len(fused_results)} results "
                f"from {len(path_set)} file(s)"
            )

        # Return top results
        final = fused_results[:top_k]
        logger.info(
            f"Hybrid retrieval: {len(final)} results after RRF "
            f"(semantic={len(semantic_results)}, keyword={len(keyword_results)})"
        )

        return final

    def _semantic_search(
        self, query: str, top_k: int
    ) -> list[tuple[dict, float]]:
        """Perform semantic search using FAISS.

        Args:
            query: Query text.
            top_k: Max results.

        Returns:
            List of (metadata, score) tuples.
        """
        try:
            query_embedding = self.embedding_service.embed_query(query)
            results = self.vector_store.search(query_embedding, top_k)
            return results
        except Exception as e:
            logger.error(f"Semantic search error: {e}")
            return []

    def _keyword_search(
        self, query: str, top_k: int
    ) -> list[tuple[dict, float]]:
        """Perform keyword search using BM25.

        Args:
            query: Query text.
            top_k: Max results.

        Returns:
            List of (metadata, score) tuples.
        """
        try:
            results = self.bm25_store.search(query, top_k)
            return results
        except Exception as e:
            logger.error(f"Keyword search error: {e}")
            return []

    def _reciprocal_rank_fusion(
        self,
        semantic_results: list[tuple[dict, float]],
        keyword_results: list[tuple[dict, float]],
    ) -> list[dict]:
        """Merge results using Reciprocal Rank Fusion.

        RRF formula: score(d) = Σ 1 / (k + rank(d, retriever))

        This is score-agnostic — it only uses rank positions,
        avoiding the need to normalize different score scales.

        Args:
            semantic_results: Results from semantic search.
            keyword_results: Results from keyword search.

        Returns:
            Merged and sorted list of chunk metadata with RRF scores.
        """
        rrf_scores: dict[str, float] = {}
        chunk_map: dict[str, dict] = {}
        k = self.rrf_k

        # Process semantic results
        for rank, (meta, score) in enumerate(semantic_results):
            chunk_id = meta.get("chunk_id", "")
            if not chunk_id:
                continue
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0) + 1.0 / (k + rank + 1)
            if chunk_id not in chunk_map:
                chunk_map[chunk_id] = meta.copy()
                chunk_map[chunk_id]["semantic_score"] = score

        # Process keyword results
        for rank, (meta, score) in enumerate(keyword_results):
            chunk_id = meta.get("chunk_id", "")
            if not chunk_id:
                continue
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0) + 1.0 / (k + rank + 1)
            if chunk_id not in chunk_map:
                chunk_map[chunk_id] = meta.copy()
            chunk_map[chunk_id]["bm25_score"] = score

        # Sort by RRF score
        sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)

        results = []
        for chunk_id in sorted_ids:
            meta = chunk_map[chunk_id]
            meta["rrf_score"] = rrf_scores[chunk_id]
            results.append(meta)

        return results
