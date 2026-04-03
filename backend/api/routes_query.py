"""Query API routes.

Handles chat queries with streaming and conversation management.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from models.api_models import QueryRequest, QueryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Query"])


def get_query_service():
    """Dependency to get query service from app state."""
    from main import app_state
    return app_state["query_service"]


@router.post("/query", response_model=QueryResponse)
async def query(
    request: QueryRequest,
    query_service=Depends(get_query_service),
):
    """Send a query and get a complete response with sources."""
    try:
        result = query_service.query(
            query=request.query,
            conversation_id=request.conversation_id,
            top_k=request.top_k,
            file_ids=request.file_ids,
        )
        return QueryResponse(**result)
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query/stream")
async def query_stream(
    request: QueryRequest,
    query_service=Depends(get_query_service),
):
    """Send a query and get a streamed response via SSE.

    Events:
    - type=sources: Initial sources data
    - type=content: Streamed answer text chunks
    - type=done: Stream complete
    - type=error: Error occurred
    """
    async def event_generator():
        try:
            async for chunk in query_service.query_stream(
                query=request.query,
                conversation_id=request.conversation_id,
                top_k=request.top_k,
                file_ids=request.file_ids,
            ):
                yield chunk
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def list_conversations(
    query_service=Depends(get_query_service),
):
    """List all conversation sessions."""
    return query_service.get_conversations()


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    query_service=Depends(get_query_service),
):
    """Get full conversation history."""
    messages = query_service.get_conversation_messages(conversation_id)
    if not messages:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "conversation_id": conversation_id,
        "messages": messages,
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    query_service=Depends(get_query_service),
):
    """Delete a conversation."""
    deleted = query_service.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation deleted", "conversation_id": conversation_id}
