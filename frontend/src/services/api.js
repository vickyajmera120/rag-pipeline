/**
 * API client for the RAG Pipeline backend.
 */

const API_BASE = '/api';

// ─── Upload with progress (XMLHttpRequest) ───

/**
 * Upload files with progress tracking.
 * @param {File[]} files
 * @param {string} folderPath - relative folder path under uploads/
 * @param {function} onProgress - callback({ loaded, total, percent })
 * @returns {Promise<object>}
 */
export function uploadFilesWithProgress(files, folderPath = '', onProgress = null) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('folder_path', folderPath);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/ingest/files`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) });
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

/**
 * Upload ZIP with progress tracking.
 */
export function uploadZipWithProgress(file, folderPath = '', onProgress = null) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder_path', folderPath);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/ingest/zip`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) });
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || 'ZIP upload failed'));
        } catch {
          reject(new Error('ZIP upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

/**
 * Upload folder files with progress tracking.
 */
export function uploadFolderWithProgress(files, folderPath = '', onProgress = null) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      formData.append('files', file, path);
    }
    formData.append('folder_path', folderPath);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/ingest/folder`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) });
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || 'Folder upload failed'));
        } catch {
          reject(new Error('Folder upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

// ─── Legacy upload functions (used by chat UploadPanel) ───

export async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  formData.append('folder_path', '');

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

export async function uploadZip(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder_path', '');

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

export async function uploadFolder(files) {
  const formData = new FormData();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    formData.append('files', file, path);
  }
  formData.append('folder_path', '');

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

// ─── File operations ───

export async function getIngestionStatus() {
  const res = await fetch(`${API_BASE}/ingest/status`);
  if (!res.ok) throw new Error('Failed to get status');
  return res.json();
}

export async function getIngestedFiles() {
  const res = await fetch(`${API_BASE}/ingest/files`);
  if (!res.ok) throw new Error('Failed to get files');
  return res.json();
}

export async function deleteFile(fileId) {
  const res = await fetch(`${API_BASE}/ingest/file/${fileId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete file');
  return res.json();
}

export async function renameFile(fileId, newName) {
  const res = await fetch(`${API_BASE}/ingest/file/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error('Failed to rename file');
  return res.json();
}

export async function moveFile(fileId, destFolderPath) {
  const res = await fetch(`${API_BASE}/ingest/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, dest_folder_path: destFolderPath }),
  });
  if (!res.ok) throw new Error('Failed to move file');
  return res.json();
}

export function downloadFile(fileId) {
  // Trigger browser download
  const a = document.createElement('a');
  a.href = `${API_BASE}/ingest/download/${fileId}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Folder operations ───

export async function getFolders() {
  const res = await fetch(`${API_BASE}/folders`);
  if (!res.ok) throw new Error('Failed to get folders');
  return res.json();
}

export async function saveFolders(folderData) {
  const res = await fetch(`${API_BASE}/folders`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folderData),
  });
  if (!res.ok) throw new Error('Failed to save folders');
  return res.json();
}

export async function createFolder(id, name, parentId) {
  const res = await fetch(`${API_BASE}/folders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, parentId }),
  });
  if (!res.ok) throw new Error('Failed to create folder');
  return res.json();
}

export async function renameFolder(id, newName) {
  const res = await fetch(`${API_BASE}/folders/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, newName }),
  });
  if (!res.ok) throw new Error('Failed to rename folder');
  return res.json();
}

export async function deleteFolderApi(id) {
  const res = await fetch(`${API_BASE}/folders/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Failed to delete folder');
  return res.json();
}

export async function resolveFolderPath(folderId) {
  const res = await fetch(`${API_BASE}/folders/resolve-path/${folderId}`);
  if (!res.ok) throw new Error('Failed to resolve folder path');
  return res.json();
}

// ─── Query ───

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

// ─── Conversations & System ───

export async function getConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error('Failed to get conversations');
  return res.json();
}

export async function getConversation(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`);
  if (!res.ok) throw new Error('Failed to get conversation');
  return res.json();
}


export async function deleteConversation(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
  return res.json();
}

export async function getSystemStats() {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Failed to get stats');
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Backend unreachable');
  return res.json();
}
