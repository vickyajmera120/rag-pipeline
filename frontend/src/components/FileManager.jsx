import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getIngestedFiles,
  deleteFile,
  renameFile,
  moveFile,
  downloadFile,
  uploadFilesWithProgress,
  uploadZipWithProgress,
  uploadFolderWithProgress,
  getFolders,
  saveFolders,
  createFolder as createFolderApi,
  renameFolder as renameFolderApi,
  deleteFolderApi,
  resolveFolderPath,
} from '../services/api';
import FileContextMenu from './FileContextMenu';
import CreateFolderModal from './CreateFolderModal';
import MoveFileModal from './MoveFileModal';
import ConfirmDialog from './ConfirmDialog';

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
    case 'zip': return '🗜️';
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
  const [dragOverArea, setDragOverArea] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Upload progress
  const [uploadProgress, setUploadProgress] = useState(null);
  // { files: [{ name, size }], percent: 0, status: 'uploading' | 'done' | 'error', message: '' }

  // Drag-to-move state
  const [dragItem, setDragItem] = useState(null); // { id, type: 'file'|'folder' }
  const [dragOverTarget, setDragOverTarget] = useState(null); // folder id being hovered

  const editInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const uploadMenuRef = useRef(null);

  // Close upload menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target)) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  // Resolve current folder's disk path
  const resolveCurrentFolderPath = useCallback(async () => {
    if (!currentFolderId) return '';
    try {
      const result = await resolveFolderPath(currentFolderId);
      return result.path || '';
    } catch {
      return '';
    }
  }, [currentFolderId]);

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
      for (const [fileId, fId] of Object.entries(fileAssignments)) {
        if (fId === folderId) ids.push(fileId);
      }
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

  // ─── Context Menu ───

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
            onClick: () => confirmDeleteFolder(item),
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
          {
            icon: '⬇️',
            label: 'Download',
            onClick: () => downloadFile(item.file_id),
          },
          { divider: true },
          {
            icon: '🗑️',
            label: 'Delete',
            danger: true,
            onClick: () => confirmDeleteFile(item),
          },
        ];

    setContextMenu({ x: e.clientX, y: e.clientY, items: menuItems });
  };

  // ─── Delete with confirmation ───

  const confirmDeleteFile = (file) => {
    setDeleteConfirm({
      title: 'Delete File?',
      message: 'This file and all its indexed data will be permanently removed.',
      items: [{ icon: getFileIcon(file.file_name), name: file.file_name }],
      onConfirm: async () => {
        setDeleteConfirm(null);
        await handleDeleteFile(file.file_id);
      },
    });
  };

  const confirmDeleteFolder = (folder) => {
    const fileCount = getFolderItemCount(folder.id);
    setDeleteConfirm({
      title: 'Delete Folder?',
      message: `This folder${fileCount > 0 ? ` contains ${fileCount} file(s) that will be moved to the parent folder` : ' is empty'}. The folder will be removed.`,
      items: [{ icon: '📁', name: folder.name }],
      onConfirm: async () => {
        setDeleteConfirm(null);
        await handleDeleteFolder(folder.id);
      },
    });
  };

  const confirmBatchDelete = () => {
    const fileItems = [];
    const folderItems = [];

    for (const key of selectedItems) {
      if (key.startsWith('folder:')) {
        const fId = key.replace('folder:', '');
        const folder = folders.find((f) => f.id === fId);
        if (folder) folderItems.push({ icon: '📁', name: folder.name });
      } else {
        const file = files.find((f) => f.file_id === key);
        if (file) fileItems.push({ icon: getFileIcon(file.file_name), name: file.file_name });
      }
    }

    const allItems = [...folderItems, ...fileItems];
    const parts = [];
    if (fileItems.length > 0) parts.push(`${fileItems.length} file(s)`);
    if (folderItems.length > 0) parts.push(`${folderItems.length} folder(s)`);

    setDeleteConfirm({
      title: `Delete ${parts.join(' and ')}?`,
      message: 'This action cannot be undone. Files will be permanently removed.',
      items: allItems.slice(0, 10),
      onConfirm: async () => {
        setDeleteConfirm(null);
        await handleBatchDelete();
      },
    });
  };

  // ─── File/Folder Actions ───

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteFile(fileId);
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
      try {
        await renameFolderApi(folderId, trimmed);
        // Update local state
        const newFolders = folders.map((f) =>
          f.id === folderId ? { ...f, name: trimmed } : f
        );
        setFolders(newFolders);
      } catch (e) {
        console.error('Folder rename failed:', e);
      }
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
    const newFolderId = generateId();
    try {
      await createFolderApi(newFolderId, name, currentFolderId);
      const newFolders = [...folders, { id: newFolderId, name, parentId: currentFolderId }];
      setFolders(newFolders);
    } catch (e) {
      console.error('Create folder failed:', e);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await deleteFolderApi(folderId);
      // Update local state
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      const newAssignments = { ...fileAssignments };
      for (const [fileId, fId] of Object.entries(newAssignments)) {
        if (fId === folderId) newAssignments[fileId] = folder.parentId;
      }
      const newFolders = folders
        .filter((f) => f.id !== folderId)
        .map((f) => (f.parentId === folderId ? { ...f, parentId: folder.parentId } : f));
      setFolders(newFolders);
      setFileAssignments(newAssignments);
    } catch (e) {
      console.error('Delete folder failed:', e);
    }
  };

  const handleMoveFile = async (destinationFolderId) => {
    if (!showMoveModal) return;

    if (showMoveModal.type === 'file') {
      // Resolve destination folder path
      let destPath = '';
      if (destinationFolderId) {
        try {
          const result = await resolveFolderPath(destinationFolderId);
          destPath = result.path || '';
        } catch { /* use root */ }
      }

      // Move on server
      try {
        await moveFile(showMoveModal.id, destPath);
      } catch (e) {
        console.error('Server move failed:', e);
      }

      // Update folder assignments
      const newAssignments = { ...fileAssignments };
      newAssignments[showMoveModal.id] = destinationFolderId;
      setFileAssignments(newAssignments);
      await persistFolders(folders, newAssignments);
    }

    setShowMoveModal(null);
    refreshData();
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

  // ─── Upload ───

  const doUpload = async (uploadFn, files, label) => {
    setUploading(true);
    setUploadProgress({
      files: Array.from(files).map((f) => ({ name: f.name, size: f.size })),
      percent: 0,
      status: 'uploading',
      message: `Uploading ${label}...`,
    });

    try {
      const folderPath = await resolveCurrentFolderPath();
      await uploadFn(files, folderPath, (progress) => {
        setUploadProgress((prev) => prev ? { ...prev, percent: progress.percent } : null);
      });

      setUploadProgress((prev) => prev ? { ...prev, percent: 100, status: 'done', message: 'Upload complete! Processing...' } : null);

      // Refresh and assign to current folder
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

        // Auto-dismiss progress after 3s
        setTimeout(() => setUploadProgress(null), 3000);
      }, 1500);
    } catch (e) {
      console.error('Upload failed:', e);
      setUploadProgress((prev) => prev ? { ...prev, status: 'error', message: `Upload failed: ${e.message}` } : null);
      setTimeout(() => setUploadProgress(null), 5000);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length === 0) return;
    doUpload(uploadFilesWithProgress, selected, `${selected.length} file(s)`);
    e.target.value = '';
    setShowUploadMenu(false);
  };

  const handleZipUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    doUpload(
      (files, folderPath, onProgress) => uploadZipWithProgress(file, folderPath, onProgress),
      [file],
      file.name
    );
    e.target.value = '';
    setShowUploadMenu(false);
  };

  const handleFolderUpload = (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length === 0) return;
    doUpload(uploadFolderWithProgress, selected, `${selected.length} file(s) from folder`);
    e.target.value = '';
    setShowUploadMenu(false);
  };

  // Drop zone upload
  const handleDropUpload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverArea(false);

    // Ignore if this is a file-move drag
    if (dragItem) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    if (droppedFiles.length === 1 && droppedFiles[0].name.endsWith('.zip')) {
      doUpload(
        (files, folderPath, onProgress) => uploadZipWithProgress(droppedFiles[0], folderPath, onProgress),
        droppedFiles,
        droppedFiles[0].name
      );
    } else {
      doUpload(uploadFilesWithProgress, droppedFiles, `${droppedFiles.length} file(s)`);
    }
  };

  // ─── Drag-to-Move (files/folders between folders) ───

  const handleDragStart = (e, id, type) => {
    setDragItem({ id, type });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
    // Add dragging class after a tick
    requestAnimationFrame(() => {
      e.target.classList.add('dragging');
    });
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging');
    setDragItem(null);
    setDragOverTarget(null);
  };

  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragItem) return;
    // Don't allow dropping on self
    if (dragItem.type === 'folder' && dragItem.id === folderId) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(folderId);
  };

  const handleFolderDragLeave = (e) => {
    e.preventDefault();
    setDragOverTarget(null);
  };

  const handleFolderDrop = async (e, targetFolderId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);

    if (!dragItem) return;

    // Collect items to move — if dragged item is selected, move all selected
    const itemsToMove = [];
    const dragKey = dragItem.type === 'folder' ? `folder:${dragItem.id}` : dragItem.id;

    if (selectedItems.has(dragKey) && selectedItems.size > 1) {
      // Move all selected items
      for (const key of selectedItems) {
        if (key.startsWith('folder:')) {
          itemsToMove.push({ id: key.replace('folder:', ''), type: 'folder' });
        } else {
          itemsToMove.push({ id: key, type: 'file' });
        }
      }
    } else {
      itemsToMove.push(dragItem);
    }

    // Resolve destination path
    let destPath = '';
    if (targetFolderId) {
      try {
        const result = await resolveFolderPath(targetFolderId);
        destPath = result.path || '';
      } catch { /* root */ }
    }

    const newAssignments = { ...fileAssignments };
    const newFolders = [...folders];

    for (const item of itemsToMove) {
      if (item.type === 'file') {
        // Move file on server + update assignment
        try {
          await moveFile(item.id, destPath);
          newAssignments[item.id] = targetFolderId;
        } catch (e) {
          console.error('Move failed:', e);
        }
      } else {
        // Move folder — update parentId
        const idx = newFolders.findIndex((f) => f.id === item.id);
        if (idx >= 0) {
          newFolders[idx] = { ...newFolders[idx], parentId: targetFolderId };
        }
        // TODO: Also move folder on disk if needed
      }
    }

    setFolders(newFolders);
    setFileAssignments(newAssignments);
    await persistFolders(newFolders, newAssignments);
    setSelectedItems(new Set());
    setDragItem(null);
    refreshData();
  };

  // Breadcrumb drop (move to ancestor)
  const handleBreadcrumbDrop = async (e, targetFolderId) => {
    e.preventDefault();
    e.stopPropagation();
    await handleFolderDrop(e, targetFolderId);
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
      onDragOver={(e) => {
        if (!dragItem) { e.preventDefault(); setDragOverArea(true); }
      }}
      onDragLeave={(e) => {
        if (!dragItem) { e.preventDefault(); setDragOverArea(false); }
      }}
      onDrop={handleDropUpload}
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
          {/* Upload dropdown */}
          <div className="fm-upload-dropdown" ref={uploadMenuRef}>
            <button
              className="fm-btn primary"
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              disabled={uploading}
              id="fm-upload-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {uploading ? 'Uploading...' : 'Upload'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showUploadMenu && (
              <div className="fm-upload-menu">
                <button className="fm-upload-menu-item" onClick={() => fileInputRef.current?.click()}>
                  <span className="fm-upload-menu-icon">📄</span>
                  <div>
                    <div className="fm-upload-menu-label">Upload Files</div>
                    <div className="fm-upload-menu-hint">PDF, DOCX, MD, TXT</div>
                  </div>
                </button>
                <button className="fm-upload-menu-item" onClick={() => zipInputRef.current?.click()}>
                  <span className="fm-upload-menu-icon">🗜️</span>
                  <div>
                    <div className="fm-upload-menu-label">Upload ZIP</div>
                    <div className="fm-upload-menu-hint">Extract and process all files</div>
                  </div>
                </button>
                <button className="fm-upload-menu-item" onClick={() => folderInputRef.current?.click()}>
                  <span className="fm-upload-menu-icon">📂</span>
                  <div>
                    <div className="fm-upload-menu-label">Upload Folder</div>
                    <div className="fm-upload-menu-hint">Preserve folder structure</div>
                  </div>
                </button>
              </div>
            )}
          </div>

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

        {/* Hidden file inputs */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept=".pdf,.docx,.md,.txt"
          onChange={handleFileUpload}
        />
        <input
          type="file"
          ref={zipInputRef}
          style={{ display: 'none' }}
          accept=".zip"
          onChange={handleZipUpload}
        />
        <input
          type="file"
          ref={folderInputRef}
          style={{ display: 'none' }}
          webkitdirectory=""
          directory=""
          onChange={handleFolderUpload}
        />
      </div>

      {/* Toolbar */}
      <div className="fm-toolbar">
        <div className="fm-toolbar-left">
          <nav className="fm-breadcrumb">
            <button
              className={`fm-breadcrumb-item root ${dragOverTarget === null && dragItem ? 'drag-target' : ''}`}
              onClick={() => setCurrentFolderId(null)}
              onDragOver={(e) => { if (dragItem) { e.preventDefault(); setDragOverTarget(null); } }}
              onDrop={(e) => handleBreadcrumbDrop(e, null)}
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
                  className={`fm-breadcrumb-item ${i === breadcrumbPath.length - 1 ? 'active' : ''} ${dragOverTarget === folder.id && dragItem ? 'drag-target' : ''}`}
                  onClick={() => setCurrentFolderId(folder.id)}
                  onDragOver={(e) => { if (dragItem) { e.preventDefault(); setDragOverTarget(folder.id); } }}
                  onDrop={(e) => handleBreadcrumbDrop(e, folder.id)}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="fm-toolbar-right">
          {currentFolderId && (
            <button
              className="fm-btn scope-btn"
              onClick={handleAskAboutCurrentFolder}
              title="Ask questions about files in this folder"
            >
              💬 Ask
            </button>
          )}

          <div className="fm-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
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

          <div className="fm-view-toggle">
            <button
              className={`fm-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button
              className={`fm-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>

          {hasSelection && (
            <button className="fm-btn danger" onClick={confirmBatchDelete}>
              🗑️ Delete ({selectedItems.size})
            </button>
          )}
        </div>
      </div>

      {/* File Grid / List */}
      <div className={`fm-content ${dragOverArea && !dragItem ? 'drag-active' : ''}`}>
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
                className={`fm-card folder ${isSelected(folder.id, true) ? 'selected' : ''} ${dragOverTarget === folder.id ? 'drag-over' : ''}`}
                onClick={(e) => {
                  if (e.detail === 2) {
                    setCurrentFolderId(folder.id);
                  } else {
                    toggleSelect(folder.id, true);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, folder, true)}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, folder.id, 'folder')}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                onDragEnter={(e) => { e.preventDefault(); if (dragItem) setDragOverTarget(folder.id); }}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
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
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
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
                draggable="true"
                onDragStart={(e) => handleDragStart(e, file.file_id, 'file')}
                onDragEnd={handleDragEnd}
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

        {/* Drop overlay for file upload */}
        {dragOverArea && !dragItem && (
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

      {/* Upload Progress Panel */}
      {uploadProgress && (
        <div className={`fm-upload-progress ${uploadProgress.status}`}>
          <div className="fm-upload-progress-header">
            <span className="fm-upload-progress-title">
              {uploadProgress.status === 'uploading' && '⏳'}
              {uploadProgress.status === 'done' && '✅'}
              {uploadProgress.status === 'error' && '❌'}
              {' '}{uploadProgress.message}
            </span>
            <button className="fm-upload-progress-close" onClick={() => setUploadProgress(null)}>✕</button>
          </div>
          <div className="fm-upload-progress-bar-container">
            <div
              className="fm-upload-progress-bar"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
          <div className="fm-upload-progress-files">
            {uploadProgress.files.slice(0, 5).map((f, i) => (
              <div key={i} className="fm-upload-progress-file">
                <span className="fm-upload-progress-file-name">{f.name}</span>
                <span className="fm-upload-progress-file-size">{formatSize(f.size)}</span>
              </div>
            ))}
            {uploadProgress.files.length > 5 && (
              <div className="fm-upload-progress-more">
                +{uploadProgress.files.length - 5} more file(s)
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title={deleteConfirm.title}
          message={deleteConfirm.message}
          items={deleteConfirm.items}
          confirmLabel="Delete"
          confirmDanger={true}
          onConfirm={deleteConfirm.onConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
