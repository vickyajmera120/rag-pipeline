"""Hierarchical chunking service.

Implements two-tier chunking:
1. Split by headings/sections (from parsed document)
2. Split into token-sized sub-chunks with overlap

Uses tiktoken for accurate token counting.
"""

import re
import hashlib
import logging
from typing import Optional

import tiktoken

from config import get_settings
from models.document import DocumentChunk, DocumentSection, ParsedDocument

logger = logging.getLogger(__name__)

settings = get_settings()


class ChunkingService:
    """Hierarchical document chunking with token-aware splitting."""

    def __init__(self):
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.chunk_size = settings.CHUNK_SIZE
        self.chunk_overlap = settings.CHUNK_OVERLAP
        self.min_chunk_size = settings.MIN_CHUNK_SIZE
        self.max_chunk_size = settings.MAX_CHUNK_SIZE

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        return len(self.tokenizer.encode(text))

    def chunk_document(self, document: ParsedDocument) -> list[DocumentChunk]:
        """Chunk a parsed document into embedding-ready chunks.

        Two-tier approach:
        1. Process each section from the parser
        2. Sub-chunk sections that exceed the token limit

        Args:
            document: ParsedDocument with extracted sections.

        Returns:
            List of DocumentChunk objects with metadata.
        """
        all_chunks: list[DocumentChunk] = []

        # Build heading hierarchy for context
        heading_stack: list[str] = []

        for section in document.sections:
            # Update heading stack based on level
            while len(heading_stack) >= section.level:
                heading_stack.pop()
            heading_stack.append(section.title)

            # Build full section path
            section_path = " > ".join(heading_stack)

            # Sub-chunk the section content
            sub_chunks = self._split_into_chunks(section.content)

            for i, chunk_text in enumerate(sub_chunks):
                content_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
                token_count = self.count_tokens(chunk_text)

                chunk = DocumentChunk(
                    text=chunk_text,
                    file_name=document.file_name,
                    file_path=document.file_path,
                    document_type=document.document_type,
                    section_title=section_path,
                    chunk_index=len(all_chunks),
                    token_count=token_count,
                    content_hash=content_hash,
                )
                all_chunks.append(chunk)

        # Set total_chunks on all
        for chunk in all_chunks:
            chunk.total_chunks = len(all_chunks)

        logger.info(
            f"Chunked {document.file_name}: {len(document.sections)} sections → "
            f"{len(all_chunks)} chunks"
        )

        return all_chunks

    def _split_into_chunks(self, text: str) -> list[str]:
        """Split text into token-sized chunks with overlap.

        Strategy:
        1. Split into sentences
        2. Accumulate sentences until hitting chunk_size
        3. Keep overlap from previous chunk

        Args:
            text: Section text to split.

        Returns:
            List of chunk texts.
        """
        if not text.strip():
            return []

        # Check if entire text fits in one chunk
        total_tokens = self.count_tokens(text)
        if total_tokens <= self.max_chunk_size:
            if total_tokens >= self.min_chunk_size:
                return [text.strip()]
            elif text.strip():
                return [text.strip()]
            return []

        # Split into sentences
        sentences = self._split_sentences(text)
        if not sentences:
            return []

        chunks: list[str] = []
        current_sentences: list[str] = []
        current_tokens = 0

        for sentence in sentences:
            sentence_tokens = self.count_tokens(sentence)

            # Handle very long sentences (longer than max chunk)
            if sentence_tokens > self.max_chunk_size:
                # Save current accumulation
                if current_sentences:
                    chunks.append(" ".join(current_sentences).strip())
                    current_sentences = []
                    current_tokens = 0

                # Force-split long sentence by tokens
                chunks.extend(self._force_split(sentence))
                continue

            # Check if adding this sentence exceeds chunk size
            if current_tokens + sentence_tokens > self.chunk_size and current_sentences:
                # Save current chunk
                chunk_text = " ".join(current_sentences).strip()
                chunks.append(chunk_text)

                # Calculate overlap: keep last N tokens worth of sentences
                overlap_sentences: list[str] = []
                overlap_tokens = 0
                for s in reversed(current_sentences):
                    s_tokens = self.count_tokens(s)
                    if overlap_tokens + s_tokens > self.chunk_overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_tokens += s_tokens

                current_sentences = overlap_sentences
                current_tokens = overlap_tokens

            current_sentences.append(sentence)
            current_tokens += sentence_tokens

        # Save remaining sentences
        if current_sentences:
            chunk_text = " ".join(current_sentences).strip()
            if chunk_text:
                chunks.append(chunk_text)

        return chunks

    def _split_sentences(self, text: str) -> list[str]:
        """Split text into sentences while preserving structure.

        Handles:
        - Standard sentence endings (.!?)
        - Paragraph breaks (double newlines)
        - List items
        """
        # Normalize whitespace but preserve paragraph breaks
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Split on paragraph breaks first
        paragraphs = text.split("\n\n")

        sentences: list[str] = []
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # Split on sentence boundaries
            # This regex splits after .!? followed by whitespace or end of string
            parts = re.split(r"(?<=[.!?])\s+", para)
            for part in parts:
                part = part.strip()
                if part:
                    sentences.append(part)

        return sentences

    def _force_split(self, text: str) -> list[str]:
        """Force-split text that's too long for a single chunk.

        Splits by words, respecting token limits.
        """
        words = text.split()
        chunks: list[str] = []
        current_words: list[str] = []
        current_tokens = 0

        for word in words:
            word_tokens = self.count_tokens(word)
            if current_tokens + word_tokens > self.chunk_size and current_words:
                chunks.append(" ".join(current_words))
                # Simple overlap by keeping last few words
                overlap_count = max(1, len(current_words) // 5)
                current_words = current_words[-overlap_count:]
                current_tokens = self.count_tokens(" ".join(current_words))

            current_words.append(word)
            current_tokens += word_tokens

        if current_words:
            chunks.append(" ".join(current_words))

        return chunks
