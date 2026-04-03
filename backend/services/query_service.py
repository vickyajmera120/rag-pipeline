"""Query service for LLM-powered answer generation.

Constructs context-aware prompts using retrieved chunks
and manages conversation history.
"""

import json
import logging
import uuid
from typing import Optional, AsyncGenerator
from collections import OrderedDict

import tiktoken
from openai import OpenAI

from config import get_settings
from services.retrieval_service import RetrievalService
from services.reranker_service import RerankerService
from models.api_models import SourceReference

logger = logging.getLogger(__name__)

settings = get_settings()


class QueryService:
    """RAG query engine with conversation management."""

    SYSTEM_PROMPT = """You are a helpful, precise assistant that answers questions based ONLY on the provided context documents.

Rules:
1. Only use information from the provided context to answer questions.
2. If the answer cannot be found in the context, respond with: "I don't know based on the provided documents."
3. Be specific and cite which document/section the information comes from when possible.
4. If partial information is available, provide what you can and note what's missing.
5. Do not make up or hallucinate information beyond what's in the context.
6. Use clear, well-structured formatting (markdown) for readability."""

    def __init__(
        self,
        retrieval_service: RetrievalService,
        reranker_service: RerankerService,
        ingestion_service=None,
    ):
        self.retrieval_service = retrieval_service
        self.reranker_service = reranker_service
        self.ingestion_service = ingestion_service
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.LLM_MODEL
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.max_context_tokens = settings.MAX_CONTEXT_TOKENS
        self.max_history_turns = settings.MAX_CONVERSATION_TURNS

        # In-memory conversation store (keyed by conversation_id)
        self._conversations: OrderedDict[str, list[dict]] = OrderedDict()
        self._max_conversations = 100

    def query(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        top_k: int = 5,
        file_ids: Optional[list[str]] = None,
    ) -> dict:
        """Process a user query through the full RAG pipeline.

        Pipeline:
        1. Retrieve candidates (hybrid search)
        2. Rerank candidates (cross-encoder)
        3. Build context-aware prompt
        4. Generate answer via LLM
        5. Return answer with sources

        Args:
            query: User question.
            conversation_id: Optional conversation ID for follow-up.
            top_k: Number of top chunks to use as context.

        Returns:
            Dict with answer, sources, and conversation_id.
        """
        # Generate or reuse conversation ID
        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        logger.info(f"Processing query: '{query[:80]}...' (conv={conversation_id[:8]})")

        # Step 1: Resolve file scope
        file_paths = None
        if file_ids and self.ingestion_service:
            file_paths = self.ingestion_service.get_file_paths_for_ids(file_ids)
            logger.info(f"Scoped search to {len(file_paths)} file(s)")

        # Step 2: Retrieve candidates
        candidates = self.retrieval_service.retrieve(query, file_paths=file_paths)

        # Step 3: Rerank
        reranked = self.reranker_service.rerank(query, candidates, top_k=top_k)

        # Step 4: Build context
        context_chunks, sources = self._build_context(reranked)

        # Step 5: Build messages
        messages = self._build_messages(query, context_chunks, conversation_id)

        # Step 6: Generate answer
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
                max_tokens=1500,
            )
            answer = response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"LLM error: {e}")
            answer = "I encountered an error processing your question. Please try again."

        # Step 7: Update conversation history
        self._add_to_conversation(conversation_id, "user", query)
        self._add_to_conversation(conversation_id, "assistant", answer)

        return {
            "answer": answer,
            "sources": sources,
            "conversation_id": conversation_id,
            "query": query,
        }

    async def query_stream(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        top_k: int = 5,
        file_ids: Optional[list[str]] = None,
    ) -> AsyncGenerator:
        """Process a query and stream the response.

        Yields SSE-formatted chunks for real-time display.

        Args:
            query: User question.
            conversation_id: Optional conversation ID.
            top_k: Number of top chunks for context.

        Yields:
            SSE-formatted strings with response chunks.
        """
        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        logger.info(f"Streaming query: '{query[:80]}...'")

        # Resolve file scope
        file_paths = None
        if file_ids and self.ingestion_service:
            file_paths = self.ingestion_service.get_file_paths_for_ids(file_ids)

        # Retrieve and rerank
        candidates = self.retrieval_service.retrieve(query, file_paths=file_paths)
        reranked = self.reranker_service.rerank(query, candidates, top_k=top_k)

        # Build context
        context_chunks, sources = self._build_context(reranked)

        # Build messages
        messages = self._build_messages(query, context_chunks, conversation_id)

        # Stream response
        full_answer = ""
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
                max_tokens=1500,
                stream=True,
            )

            # Yield sources first
            sources_data = [s.model_dump() for s in sources]
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources_data, 'conversation_id': conversation_id})}\n\n"

            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_answer += content
                    yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            full_answer = "Error generating response."

        # Update conversation
        self._add_to_conversation(conversation_id, "user", query)
        self._add_to_conversation(conversation_id, "assistant", full_answer)

    def _build_context(
        self, chunks: list[dict]
    ) -> tuple[list[str], list[SourceReference]]:
        """Build context string from chunks, respecting token limits.

        Args:
            chunks: Reranked chunk metadata dicts.

        Returns:
            Tuple of (context_parts, source_references).
        """
        context_parts: list[str] = []
        sources: list[SourceReference] = []
        total_tokens = 0

        for i, chunk in enumerate(chunks):
            text = chunk.get("text", "")
            file_name = chunk.get("file_name", "Unknown")
            section_title = chunk.get("section_title", "")
            file_path = chunk.get("file_path", "")

            # Format context entry
            context_entry = (
                f"[Source {i + 1}: {file_name}"
                f"{' > ' + section_title if section_title else ''}]\n"
                f"{text}"
            )

            entry_tokens = len(self.tokenizer.encode(context_entry))

            if total_tokens + entry_tokens > self.max_context_tokens:
                logger.info(
                    f"Context token limit reached at chunk {i + 1}/{len(chunks)}"
                )
                break

            context_parts.append(context_entry)
            total_tokens += entry_tokens

            # Create source reference
            snippet = text[:200] + "..." if len(text) > 200 else text
            sources.append(
                SourceReference(
                    file_name=file_name,
                    file_path=file_path,
                    section_title=section_title,
                    snippet=snippet,
                    relevance_score=chunk.get("rerank_score", 0.0),
                )
            )

        logger.info(
            f"Context built: {len(context_parts)} chunks, {total_tokens} tokens"
        )
        return context_parts, sources

    def _build_messages(
        self,
        query: str,
        context_parts: list[str],
        conversation_id: str,
    ) -> list[dict]:
        """Build the message array for the LLM.

        Args:
            query: Current user query.
            context_parts: Formatted context strings.
            conversation_id: Conversation ID for history.

        Returns:
            List of message dicts for the API.
        """
        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]

        # Add context
        if context_parts:
            context_text = "\n\n".join(context_parts)
            messages.append(
                {
                    "role": "system",
                    "content": f"Context documents:\n\n{context_text}",
                }
            )
        else:
            messages.append(
                {
                    "role": "system",
                    "content": "No relevant documents were found for this query.",
                }
            )

        # Add conversation history (limited)
        history = self._get_conversation(conversation_id)
        if history:
            recent = history[-(self.max_history_turns * 2):]
            messages.extend(recent)

        # Add current query
        messages.append({"role": "user", "content": query})

        return messages

    def _add_to_conversation(
        self, conversation_id: str, role: str, content: str
    ):
        """Add a message to conversation history.

        Args:
            conversation_id: Conversation identifier.
            role: Message role ('user' or 'assistant').
            content: Message content.
        """
        if conversation_id not in self._conversations:
            if len(self._conversations) >= self._max_conversations:
                # Remove oldest
                self._conversations.popitem(last=False)
            self._conversations[conversation_id] = []

        self._conversations[conversation_id].append(
            {"role": role, "content": content}
        )

    def _get_conversation(self, conversation_id: str) -> list[dict]:
        """Get conversation history.

        Args:
            conversation_id: Conversation identifier.

        Returns:
            List of message dicts.
        """
        return self._conversations.get(conversation_id, [])

    def get_conversations(self) -> list[dict]:
        """Get all conversation summaries.

        Returns:
            List of conversation summary dicts.
        """
        summaries = []
        for conv_id, messages in self._conversations.items():
            if messages:
                # Use first user message as title
                title = "New Conversation"
                for msg in messages:
                    if msg["role"] == "user":
                        title = msg["content"][:60]
                        if len(msg["content"]) > 60:
                            title += "..."
                        break

                summaries.append(
                    {
                        "conversation_id": conv_id,
                        "title": title,
                        "message_count": len(messages),
                        "last_message": messages[-1]["content"][:100],
                    }
                )

        return list(reversed(summaries))

    def get_conversation_messages(self, conversation_id: str) -> list[dict]:
        """Get full conversation history.

        Args:
            conversation_id: Conversation identifier.

        Returns:
            List of message dicts.
        """
        return self._conversations.get(conversation_id, [])

    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation.

        Args:
            conversation_id: Conversation identifier.

        Returns:
            True if deleted, False if not found.
        """
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]
            return True
        return False
