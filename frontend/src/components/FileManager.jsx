import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getIngestedFiles,
  deleteFile,
  renameFile,
  uploadFiles,
  uploadZip,
  getFolders,
  saveFolders,
} from '../services/api';
import FileContextMenu from './FileContextMenu';
import CreateFolderModal from './CreateFolderModal';
import MoveFileModal from './MoveFileModal';

function generateId() {
  return 'f_' + Math.random().toString(36).slice(2, 11);
}

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return '📕';
    case 'docx': case 'doc': return '📘';
    case 'md': return '📗';
    case 'txt': return '📄';
    default: return '📄';
  }
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusBadge(status) {
  const labels = {
    indexed: 'Indexed',
    pending: 'Pending',
    parsing: 'Parsing',
    chunking: 'Chunking',
    embedding: 'Embedding',
    error: 'Error',
  };
  return labels[status] || status;
}

export default function FileManager({ onScopeChange, onSwitchToChat }) {
  // Data
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [fileAssignments, setFileAssignments] = useState({});

  // UI state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const editInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch data
  const refreshData = useCallback(async () => {
    try {
      const [filesRes, foldersRes] = await Promise.all([
        getIngestedFiles(),
        getFolders(),
      ]);
      setFiles(filesRes);
      setFolders(foldersRes.folders || []);
      setFileAssignments(foldersRes.fileAssignments || {});
    } catch (e) {
      // Backend may not be ready
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Save folder structure
  const persistFolders = useCallback(
    async (newFolders, newAssignments) => {
      try {
        await saveFolders({
          folders: newFolders,
          fileAssignments: newAssignments,
        });
      } catch (e) {
        console.error('Failed to save folders:', e);
      }
    },
    []
  );

  // Breadcrumb path
  const getBreadcrumbPath = () => {
    const path = [];
    let id = currentFolderId;
    while (id) {
      const folder = folders.find((f) => f.id === id);
      if (!folder) break;
      path.unshift(folder);
      id = folder.parentId;
    }
    return path;
  };

  // Get items in current folder
  const currentFolders = folders.filter((f) => f.parentId === currentFolderId);
  const currentFiles = files.filter((f) => {
    const assignedFolder = fileAssignments[f.file_id] || null;
    return assignedFolder === currentFolderId;
  });

  // Get all file IDs recursively in a folder
  const getRecursiveFileIds = useCallback(
    (folderId) => {
      const ids = [];
      // Direct files
      for (const [fileId, fId] of Object.entries(fileAssignments)) {
        if (fId === folderId) ids.push(fileId);
      }
      // Recurse into subfolders
      const subFolders = folders.filter((f) => f.parentId === folderId);
      for (const sub of subFolders) {
        ids.push(...getRecursiveFileIds(sub.id));
      }
      return ids;
    },
    [folders, fileAssignments]
  );

  // Folder item count
  const getFolderItemCount = (folderId) => {
    return getRecursiveFileIds(folderId).length;
  };

  // Filter and sort
  const filteredFolders = currentFolders
    .filter((f) => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredFiles = currentFiles
    .filter((f) => !searchQuery || f.file_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.file_name.localeCompare(b.file_name);
        case 'size': return (b.file_size || 0) - (a.file_size || 0);
        case 'status': return a.status.localeCompare(b.status);
        default: return 0;
      }
    });

  // Selection
  const toggleSelect = (id, isFolder = false) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      const key = isFolder ? `folder:${id}` : id;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSelected = (id, isFolder = false) => {
    const key = isFolder ? `folder:${id}` : id;
    return selectedItems.has(key);
  };

  // Context menu
  const handleContextMenu = (e, item, isFolder = false) => {
    e.preventDefault();
    e.stopPropagation();

    const menuItems = isFolder
      ? [
          {
            icon: '💬',
            label: 'Ask About This Folder',
            onClick: () => {
              const fileIds = getRecursiveFileIds(item.id);
              if (fileIds.length > 0) {
                onScopeChange(fileIds, item.name);
                onSwitchToChat();
              }
            },
          },
          { divider: true },
          {
            icon: '✏️',
            label: 'Rename',
            onClick: () => {
              setEditingName(`folder:${item.id}`);
              setEditNameValue(item.name);
            },
          },
          {
            icon: '🗑️',
            label: 'Delete Folder',
            danger: true,
            onClick: () => handleDeleteFolder(item.id),
          },
        ]
      : [
          {
            icon: '💬',
            label: 'Ask About This File',
            onClick: () => {
              onScopeChange([item.file_id], item.file_name);
              onSwitchToChat();
            },
          },
          { divider: true },
          {
            icon: '✏️',
            label: 'Rename',
            onClick: () => {
              setEditingName(item.file_id);
              setEditNameValue(item.file_name);
            },
          },
          {
            icon: '📂',
            label: 'Move to Folder',
            onClick: () => setShowMoveModal({ type: 'file', id: item.file_id }),
          },
          { divider: true },
          {
            icon: '🗑️',
            label: 'Delete',
            danger: true,
            onClick: () => handleDeleteFile(item.file_id),
          },
        ];

    setContextMenu({ x: e.clientX, y: e.clientY, items: menuItems });
  };

  // File actions
  const handleDeleteFile = async (fileId) => {
    try {
      await deleteFile(fileId);
      // Remove from assignments
      const newAssignments = { ...fileAssignments };
      delete newAssignments[fileId];
      setFileAssignments(newAssignments);
      await persistFolders(folders, newAssignments);
      refreshData();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleRenameSubmit = async (id, isFolder) => {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      setEditingName(null);
      return;
    }

    if (isFolder) {
      const folderId = id.replace('folder:', '');
      const newFolders = folders.map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f
      );
      setFolders(newFolders);
      await persistFolders(newFolders, fileAssignments);
    } else {
      try {
        await renameFile(id, trimmed);
        refreshData();
      } catch (e) {
        console.error('Rename failed:', e);
      }
    }
    setEditingName(null);
  };

  // Folder actions
  const handleCreateFolder = async (name) => {
    const newFolder = {
      id: generateId(),
      name,
      parentId: currentFolderId,
    };
    const newFolders = [...folders, newFolder];
    setFolders(newFolders);
    await persistFolders(newFolders, fileAssignments);
  };

  const handleDeleteFolder = async (folderId) => {
    // Delete folder and move its files to parent
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    const newAssignments = { ...fileAssignments };
    // Reassign files to parent
    for (const [fileId, fId] of Object.entries(newAssignments)) {
      if (fId === folderId) {
        newAssignments[fileId] = folder.parentId;
      }
    }
    // Move subfolders to parent
    const newFolders = folders
      .filter((f) => f.id !== folderId)
      .map((f) => (f.parentId === folderId ? { ...f, parentId: folder.parentId } : f));

    setFolders(newFolders);
    setFileAssignments(newAssignments);
    await persistFolders(newFolders, newAssignments);
  };

  const handleMoveFile = async (destinationFolderId) => {
    if (!showMoveModal) return;

    const newAssignments = { ...fileAssignments };

    if (showMoveModal.type === 'file') {
      newAssignments[showMoveModal.id] = destinationFolderId;
    }

    setFileAssignments(newAssignments);
    await persistFolders(folders, newAssignments);
    setShowMoveModal(null);
  };

  // Batch delete
  const handleBatchDelete = async () => {
    const filesToDelete = [];
    const foldersToDelete = [];

    for (const key of selectedItems) {
      if (key.startsWith('folder:')) {
        foldersToDelete.push(key.replace('folder:', ''));
      } else {
        filesToDelete.push(key);
      }
    }

    for (const fileId of filesToDelete) {
      await handleDeleteFile(fileId);
    }
    for (const folderId of foldersToDelete) {
      await handleDeleteFolder(folderId);
    }

    setSelectedItems(new Set());
  };

  // Upload
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    setUploading(true);
    try {
      let result;
      if (droppedFiles.length === 1 && droppedFiles[0].name.endsWith('.zip')) {
        result = await uploadZip(droppedFiles[0]);
      } else {
        result = await uploadFiles(droppedFiles);
      }

      // Assign uploaded files to current folder after a brief delay for indexing
      setTimeout(async () => {
        const freshFiles = await getIngestedFiles();
        setFiles(freshFiles);

        // Find newly added files and assign to current folder
        if (currentFolderId) {
          const existingIds = new Set(files.map((f) => f.file_id));
          const newAssignments = { ...fileAssignments };
          for (const f of freshFiles) {
            if (!existingIds.has(f.file_id) && !newAssignments[f.file_id]) {
              newAssignments[f.file_id] = currentFolderId;
            }
          }
          setFileAssignments(newAssignments);
          await persistFolders(folders, newAssignments);
        }
      }, 1500);
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    try {
      await uploadFiles(selectedFiles);
      setTimeout(async () => {
        const freshFiles = await getIngestedFiles();
        setFiles(freshFiles);
        if (currentFolderId) {
          const existingIds = new Set(files.map((f) => f.file_id));
          const newAssignments = { ...fileAssignments };
          for (const f of freshFiles) {
            if (!existingIds.has(f.file_id) && !newAssignments[f.file_id]) {
              newAssignments[f.file_id] = currentFolderId;
            }
          }
          setFileAssignments(newAssignments);
          await persistFolders(folders, newAssignments);
        }
      }, 1500);
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Scope: Ask about current folder
  const handleAskAboutCurrentFolder = () => {
    if (currentFolderId) {
      const fileIds = getRecursiveFileIds(currentFolderId);
      const folder = folders.find((f) => f.id === currentFolderId);
      if (fileIds.length > 0) {
        onScopeChange(fileIds, folder?.name || 'Folder');
        onSwitchToChat();
      }
    }
  };

  // Inline edit focus
  useEffect(() => {
    if (editingName && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingName]);

  const breadcrumbPath = getBreadcrumbPath();
  const hasSelection = selectedItems.size > 0;
  const totalItems = filteredFolders.length + filteredFiles.length;

  return (
    <div
      className="file-manager"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={handleDrop}
      onClick={() => setContextMenu(null)}
    >
      {/* Header */}
      <div className="fm-header">
        <div className="fm-header-left">
          <h2 className="fm-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Knowledge Base
          </h2>
          <span className="fm-file-count">{files.length} files</span>
        </div>
        <div className="fm-header-right">
          <button
            className="fm-btn primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            id="fm-upload-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <button
            className="fm-btn secondary"
            onClick={() => setShowCreateFolder(true)}
            id="fm-new-folder-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            New Folder
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept=".pdf,.docx,.md,.txt,.zip"
          onChange={handleFileInputChange}
        />
      </div>

      {/* Toolbar */}
      <div className="fm-toolbar">
        <div className="fm-toolbar-left">
          {/* Breadcrumb */}
          <nav className="fm-breadcrumb">
            <button
              className="fm-breadcrumb-item root"
              onClick={() => setCurrentFolderId(null)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              All Files
            </button>
            {breadcrumbPath.map((folder, i) => (
              <React.Fragment key={folder.id}>
                <span className="fm-breadcrumb-sep">›</span>
                <button
                  className={`fm-breadcrumb-item ${
                    i === breadcrumbPath.length - 1 ? 'active' : ''
                  }`}
                  onClick={() => setCurrentFolderId(folder.id)}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="fm-toolbar-right">
          {/* Scope button for current folder */}
          {currentFolderId && (
            <button
              className="fm-btn scope-btn"
              onClick={handleAskAboutCurrentFolder}
              title="Ask questions about files in this folder"
            >
              💬 Ask
            </button>
          )}

          {/* Search */}
          <div className="fm-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="fm-search-input"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="fm-search-input"
            />
          </div>

          {/* Sort */}
          <select
            className="fm-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            id="fm-sort-select"
          >
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="status">Status</option>
          </select>

          {/* View toggle */}
          <div className="fm-view-toggle">
            <button
              className={`fm-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button
              className={`fm-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Batch actions */}
          {hasSelection && (
            <button
              className="fm-btn danger"
              onClick={handleBatchDelete}
            >
              🗑️ Delete ({selectedItems.size})
            </button>
          )}
        </div>
      </div>

      {/* File Grid / List */}
      <div className={`fm-content ${dragOver ? 'drag-active' : ''}`}>
        {totalItems === 0 && !searchQuery ? (
          <div className="fm-empty">
            <div className="fm-empty-icon">
              {currentFolderId ? '📂' : '📁'}
            </div>
            <h3 className="fm-empty-title">
              {currentFolderId ? 'This folder is empty' : 'No files yet'}
            </h3>
            <p className="fm-empty-desc">
              {currentFolderId
                ? 'Upload files or move existing files here'
                : 'Upload documents to get started with your knowledge base'}
            </p>
            <button
              className="fm-btn primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Files
            </button>
          </div>
        ) : totalItems === 0 && searchQuery ? (
          <div className="fm-empty">
            <div className="fm-empty-icon">🔍</div>
            <h3 className="fm-empty-title">No results found</h3>
            <p className="fm-empty-desc">
              No files or folders match "{searchQuery}"
            </p>
          </div>
        ) : (
          <div className={`fm-items ${viewMode}`}>
            {/* Folders */}
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                className={`fm-card folder ${isSelected(folder.id, true) ? 'selected' : ''}`}
                onClick={(e) => {
                  if (e.detail === 2) {
                    setCurrentFolderId(folder.id);
                  } else {
                    toggleSelect(folder.id, true);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, folder, true)}
              >
                <div className="fm-card-check">
                  <input
                    type="checkbox"
                    checked={isSelected(folder.id, true)}
                    onChange={() => toggleSelect(folder.id, true)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="fm-card-icon folder-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none" >
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                  </svg>
                </div>
                {editingName === `folder:${folder.id}` ? (
                  <input
                    ref={editInputRef}
                    className="fm-card-edit-input"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(`folder:${folder.id}`, true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(`folder:${folder.id}`, true);
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="fm-card-name">{folder.name}</div>
                )}
                <div className="fm-card-meta">
                  {getFolderItemCount(folder.id)} file{getFolderItemCount(folder.id) !== 1 ? 's' : ''}
                </div>
                <button
                  className="fm-card-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, folder, true);
                  }}
                >
                  ⋮
                </button>
              </div>
            ))}

            {/* Files */}
            {filteredFiles.map((file) => (
              <div
                key={file.file_id}
                className={`fm-card file ${isSelected(file.file_id) ? 'selected' : ''}`}
                onClick={() => toggleSelect(file.file_id)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                onDoubleClick={() => {
                  onScopeChange([file.file_id], file.file_name);
                  onSwitchToChat();
                }}
              >
                <div className="fm-card-check">
                  <input
                    type="checkbox"
                    checked={isSelected(file.file_id)}
                    onChange={() => toggleSelect(file.file_id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="fm-card-icon file-icon">
                  <span className="fm-card-icon-emoji">{getFileIcon(file.file_name)}</span>
                </div>
                {editingName === file.file_id ? (
                  <input
                    ref={editInputRef}
                    className="fm-card-edit-input"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(file.file_id, false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(file.file_id, false);
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="fm-card-name">{file.file_name}</div>
                )}
                <div className="fm-card-details">
                  <span className="fm-card-size">{formatSize(file.file_size)}</span>
                  <span className={`fm-card-status ${file.status}`}>
                    {getStatusBadge(file.status)}
                  </span>
                </div>
                <button
                  className="fm-card-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, file);
                  }}
                >
                  ⋮
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drop overlay */}
        {dragOver && (
          <div className="fm-drop-overlay">
            <div className="fm-drop-content">
              <div className="fm-drop-icon">📁</div>
              <div className="fm-drop-text">
                Drop files here to upload
                {currentFolderId && (
                  <span className="fm-drop-folder">
                    to "{folders.find((f) => f.id === currentFolderId)?.name}"
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreate={handleCreateFolder}
          existingNames={currentFolders.map((f) => f.name.toLowerCase())}
        />
      )}

      {/* Move File Modal */}
      {showMoveModal && (
        <MoveFileModal
          onClose={() => setShowMoveModal(null)}
          onMove={handleMoveFile}
          folders={folders}
          currentFolderId={
            showMoveModal.type === 'file'
              ? fileAssignments[showMoveModal.id] || null
              : null
          }
        />
      )}
    </div>
  );
}
