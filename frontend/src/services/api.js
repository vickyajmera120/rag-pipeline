/**
 * API client for the RAG Pipeline backend.
 */

const API_BASE = '/api';

/**
 * Upload files for ingestion.
 */
export async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_BASE}/ingest/files`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }

  return res.json();
}

/**
 * Upload a ZIP file for ingestion.
 */
export async function uploadZip(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/ingest/zip`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'ZIP upload failed' }));
    throw new Error(err.detail || 'ZIP upload failed');
  }

  return res.json();
}

/**
 * Upload folder files for ingestion.
 */
export async function uploadFolder(files) {
  const formData = new FormData();
  for (const file of files) {
    // Use webkitRelativePath to preserve folder structure
    const path = file.webkitRelativePath || file.name;
    formData.append('files', file, path);
  }

  const res = await fetch(`${API_BASE}/ingest/folder`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Folder upload failed' }));
    throw new Error(err.detail || 'Folder upload failed');
  }

  return res.json();
}

/**
 * Get ingestion status.
 */
export async function getIngestionStatus() {
  const res = await fetch(`${API_BASE}/ingest/status`);
  if (!res.ok) throw new Error('Failed to get status');
  return res.json();
}

/**
 * Get list of ingested files.
 */
export async function getIngestedFiles() {
  const res = await fetch(`${API_BASE}/ingest/files`);
  if (!res.ok) throw new Error('Failed to get files');
  return res.json();
}

/**
 * Delete an ingested file.
 */
export async function deleteFile(fileId) {
  const res = await fetch(`${API_BASE}/ingest/file/${fileId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete file');
  return res.json();
}

/**
 * Rename an ingested file.
 */
export async function renameFile(fileId, newName) {
  const res = await fetch(`${API_BASE}/ingest/file/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error('Failed to rename file');
  return res.json();
}

/**
 * Get folder structure.
 */
export async function getFolders() {
  const res = await fetch(`${API_BASE}/folders`);
  if (!res.ok) throw new Error('Failed to get folders');
  return res.json();
}

/**
 * Save folder structure.
 */
export async function saveFolders(folderData) {
  const res = await fetch(`${API_BASE}/folders`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folderData),
  });
  if (!res.ok) throw new Error('Failed to save folders');
  return res.json();
}

/**
 * Send a query (non-streaming).
 */
export async function sendQuery(query, conversationId = null, topK = 5, fileIds = null) {
  const body = {
    query,
    conversation_id: conversationId,
    top_k: topK,
  };
  if (fileIds && fileIds.length > 0) {
    body.file_ids = fileIds;
  }

  const res = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Query failed' }));
    throw new Error(err.detail || 'Query failed');
  }

  return res.json();
}

/**
 * Send a query with streaming response via SSE.
 * Returns an async generator yielding parsed events.
 */
export async function* sendQueryStream(query, conversationId = null, topK = 5, fileIds = null) {
  const body = {
    query,
    conversation_id: conversationId,
    top_k: topK,
  };
  if (fileIds && fileIds.length > 0) {
    body.file_ids = fileIds;
  }

  const res = await fetch(`${API_BASE}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Stream failed' }));
    throw new Error(err.detail || 'Stream failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch (e) {
          // Skip malformed data
        }
      }
    }
  }
}

/**
 * Get conversation list.
 */
export async function getConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error('Failed to get conversations');
  return res.json();
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
  return res.json();
}

/**
 * Get system stats.
 */
export async function getSystemStats() {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Failed to get stats');
  return res.json();
}

/**
 * Health check.
 */
export async function healthCheck() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Backend unreachable');
  return res.json();
}
