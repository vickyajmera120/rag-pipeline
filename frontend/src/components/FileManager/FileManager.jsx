import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getIngestedFiles,
  deleteFile,
  renameFile,
  moveFile,
  uploadFilesWithProgress,
  uploadZipWithProgress,
  uploadFolderWithProgress,
  getFolders,
  saveFolders,
  createFolder as createFolderApi,
  renameFolder as renameFolderApi,
  deleteFolderApi,
  resolveFolderPath,
} from '../../services/api';
import FileContextMenu from '../FileContextMenu';
import CreateFolderModal from '../CreateFolderModal';
import ConfirmDialog from '../ConfirmDialog';

import FileManagerHeader from './FileManagerHeader';
import FileManagerToolbar from './FileManagerToolbar';
import FileGrid from './FileGrid';
import UploadProgressPanel from './UploadProgressPanel';
import './FileManager.css';

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
  const [dragOverArea, setDragOverArea] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Upload progress
  const [uploadProgress, setUploadProgress] = useState(null);

  // Drag-to-move state
  const [dragItem, setDragItem] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

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
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Polling for processing status
  useEffect(() => {
    const hasProcessing = files.some(
      (f) => !['indexed', 'error'].includes(f.status || 'indexed')
    );
    if (!hasProcessing) return;
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [files, refreshData]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingName && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingName]);

  // Clear selection on folder change
  useEffect(() => {
    setSelectedItems(new Set());
  }, [currentFolderId]);

  const getBreadcrumbPath = () => {
    const path = [];
    let id = currentFolderId;
    const visited = new Set();
    while (id && !visited.has(id)) {
      visited.add(id);
      const folder = folders.find((f) => f.id === id);
      if (!folder) break;
      path.unshift(folder);
      id = folder.parentId;
    }
    return path;
  };

  const getRecursiveFileIds = useCallback(
    (folderId, visited = new Set()) => {
      if (visited.has(folderId)) return [];
      visited.add(folderId);

      const ids = [];
      for (const [fileId, fId] of Object.entries(fileAssignments)) {
        if (fId === folderId) ids.push(fileId);
      }
      const subFolders = folders.filter((f) => f.parentId === folderId);
      for (const sub of subFolders) {
        ids.push(...getRecursiveFileIds(sub.id, visited));
      }
      return ids;
    },
    [folders, fileAssignments]
  );

  const getFolderItemCount = (folderId) => {
    return getRecursiveFileIds(folderId).length;
  };

  const currentFolders = folders.filter((f) => f.parentId === currentFolderId);
  const currentFiles = files.filter((f) => {
    const assignedFolder = fileAssignments[f.file_id] || null;
    return assignedFolder === currentFolderId;
  });

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
            label: 'Delete',
            danger: true,
            onClick: () => confirmDelete(item, true),
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
            icon: '🗑️',
            label: 'Delete',
            danger: true,
            onClick: () => confirmDelete(item, false),
          },
        ];

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: menuItems,
    });
  };

  const handleAskAboutCurrentFolder = () => {
    let fileIds;
    let label;

    if (currentFolderId) {
      fileIds = getRecursiveFileIds(currentFolderId);
      const current = folders.find((f) => f.id === currentFolderId);
      label = current?.name || 'Folder';
    } else {
      // Root: includes all files in the system
      fileIds = files.map((f) => f.file_id);
      label = 'All Files';
    }

    if (fileIds.length > 0) {
      onScopeChange(fileIds, label);
      onSwitchToChat();
    }
  };

  const persistFoldersLocal = async (flds, assignments) => {
    try {
      await saveFolders({ folders: flds, fileAssignments: assignments });
    } catch (e) {
      console.error('Failed to save folders logic', e);
    }
  };

  const doUpload = async (uploadThunk, filesToUpload, defaultName = 'files') => {
    setUploading(true);
    setUploadProgress({
      files: Array.from(filesToUpload).map(f => ({ name: f.name, size: f.size })),
      percent: 0,
      status: 'uploading',
      message: `Uploading ${defaultName}...`
    });

    try {
      let relativePath = '';
      if (currentFolderId) {
        try {
          const res = await resolveFolderPath(currentFolderId);
          relativePath = res.path || '';
        } catch { /* root */ }
      }

      const res = await uploadThunk(filesToUpload, relativePath, (percent) => {
        setUploadProgress(prev => prev ? { ...prev, percent } : null);
      });

      const newIds = res.files ? res.files.map((f) => f.file_id) : res.file_ids || [];
      const newAssignments = { ...fileAssignments };
      newIds.forEach((id) => {
        if (currentFolderId) newAssignments[id] = currentFolderId;
      });

      setFileAssignments(newAssignments);
      await persistFoldersLocal(folders, newAssignments);

      setUploadProgress(prev => prev ? { ...prev, percent: 100, status: 'done', message: 'Upload complete' } : null);
      setTimeout(() => setUploadProgress(null), 3000);
      refreshData();
    } catch (error) {
      setUploadProgress(prev => prev ? { ...prev, status: 'error', message: error.message } : null);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e) => {
    const selected = e.target.files;
    if (!selected.length) return;
    doUpload(
      (files, folderPath, onProgress) => uploadFilesWithProgress(files, folderPath, onProgress),
      selected,
      `${selected.length} file(s)`
    );
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
    const selected = e.target.files;
    if (!selected.length) return;
    doUpload(
      (files, folderPath, onProgress) => uploadFolderWithProgress(files, folderPath, onProgress),
      selected,
      'folder'
    );
    e.target.value = '';
    setShowUploadMenu(false);
  };

  const handleDropUpload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverArea(false);

    if (dragItem) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (!droppedFiles.length) return;
    doUpload(
      (files, folderPath, onProgress) => uploadFilesWithProgress(files, folderPath, onProgress),
      droppedFiles,
      `${droppedFiles.length} item(s)`
    );
  };

  const confirmDelete = (item, isFolder) => {
    setDeleteConfirm({
      items: [isFolder ? `folder:${item.id}` : item.file_id],
      isFolder,
      name: isFolder ? item.name : item.file_name,
      fileCount: isFolder ? getFolderItemCount(item.id) : 1
    });
  };

  const confirmBatchDelete = () => {
    let folderCount = 0;
    let fileCount = 0;
    for (const key of selectedItems) {
      if (key.startsWith('folder:')) folderCount++;
      else fileCount++;
    }
    setDeleteConfirm({
      items: Array.from(selectedItems),
      isFolder: false,
      name: `${selectedItems.size} items`,
      fileCount: fileCount + folderCount, 
      isBatch: true,
      batchDetails: `${folderCount} folder(s), ${fileCount} file(s)`
    });
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    
    const itemsToDelete = deleteConfirm.items;
    const newAssignments = { ...fileAssignments };
    
    for (const key of itemsToDelete) {
      if (key.startsWith('folder:')) {
        const id = key.replace('folder:', '');
        try {
          await deleteFolderApi(id);
          const idsToRemove = getRecursiveFileIds(id);
          for (const fid of idsToRemove) delete newAssignments[fid];
        } catch (e) {
          console.error('Folder delete failed', e);
        }
      } else {
        try {
          await deleteFile(key);
          delete newAssignments[key];
        } catch (e) {
          console.error('File delete failed', e);
        }
      }
    }

    const updatedFolders = folders.filter(f => !itemsToDelete.includes(`folder:${f.id}`));
    await persistFoldersLocal(updatedFolders, newAssignments);
    setDeleteConfirm(null);
    setSelectedItems(new Set());
    refreshData();
  };

  const handleRenameSubmit = async (key, isFolder) => {
    if (!editNameValue.trim()) {
      setEditingName(null);
      return;
    }
    
    if (isFolder) {
      const id = key.replace('folder:', '');
      const folder = folders.find(f => f.id === id);
      if (folder && folder.name !== editNameValue) {
        try {
          await renameFolderApi(id, editNameValue);
        } catch (e) {
          console.error('Rename failed', e);
        }
      }
    } else {
      const file = files.find(f => f.file_id === key);
      if (file && file.file_name !== editNameValue) {
        try {
          await renameFile(key, editNameValue);
        } catch (e) {
          console.error('Rename failed', e);
        }
      }
    }
    setEditingName(null);
    refreshData();
  };

  const handleCreateFolder = async (name) => {
    try {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
      await createFolderApi(id, name, currentFolderId);
      refreshData();
    } catch (e) {
      console.error('Failed to create folder', e);
    }
  };

  // Drag and drop for Move
  const handleDragStart = (e, id, type) => {
    setDragItem({ id, type });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
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
    
    if (dragItem.type === 'folder') {
      let isDescendant = false;
      let currentId = folderId;
      const visited = new Set();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        if (currentId === dragItem.id) {
          isDescendant = true;
          break;
        }
        const parentFolder = folders.find(f => f.id === currentId);
        currentId = parentFolder ? parentFolder.parentId : null;
      }
      if (isDescendant) return;
    }

    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(folderId);
  };

  const handleFolderDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
  };

  const handleFolderDrop = async (e, targetFolderId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);

    if (!dragItem) return;

    const itemsToMove = [];
    const dragKey = dragItem.type === 'folder' ? `folder:${dragItem.id}` : dragItem.id;

    if (selectedItems.has(dragKey) && selectedItems.size > 1) {
      for (const key of selectedItems) {
        if (key.startsWith('folder:')) {
          const fId = key.replace('folder:', '');
          let isDescendant = false;
          let currentId = targetFolderId;
          const visited = new Set();
          while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            if (currentId === fId) { isDescendant = true; break; }
            const pFolder = folders.find(f => f.id === currentId);
            currentId = pFolder ? pFolder.parentId : null;
          }
          if (!isDescendant) {
            itemsToMove.push({ id: fId, type: 'folder' });
          }
        } else {
          itemsToMove.push({ id: key, type: 'file' });
        }
      }
    } else {
      itemsToMove.push(dragItem);
    }

    let destPath = '';
    if (targetFolderId) {
      try {
        const result = await resolveFolderPath(targetFolderId);
        destPath = result.path || '';
      } catch { /* root */ }
    }

    const newAssignments = { ...fileAssignments };
    
    for (const item of itemsToMove) {
      if (item.type === 'file') {
        try {
          await moveFile(item.id, destPath);
          newAssignments[item.id] = targetFolderId;
        } catch (e) {
          console.error('Move failed:', e);
        }
      } else {
         // Folders are not movable via moveFile, handle backend logic if implemented for folder move
         // Currently only UI moves are tracked in assignments (this system allows visual move, but backend folder move needs implementation)
      }
    }

    setFileAssignments(newAssignments);
    await persistFoldersLocal(folders, newAssignments);
    setSelectedItems(new Set());
    setDragItem(null);
    refreshData();
  };

  const breadcrumbs = getBreadcrumbPath();
  const hasSelection = selectedItems.size > 0;
  const totalItems = currentFolders.length + currentFiles.length;

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
      <FileManagerHeader 
        filesCount={files.length}
        uploading={uploading}
        showUploadMenu={showUploadMenu}
        setShowUploadMenu={setShowUploadMenu}
        uploadMenuRef={uploadMenuRef}
        fileInputRef={fileInputRef}
        zipInputRef={zipInputRef}
        folderInputRef={folderInputRef}
        setShowCreateFolder={setShowCreateFolder}
      />
      
      {/* Hidden file inputs moved inside the wrapper */}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple accept=".pdf,.docx,.md,.txt" onChange={handleFileUpload} />
      <input type="file" ref={zipInputRef} style={{ display: 'none' }} accept=".zip" onChange={handleZipUpload} />
      <input type="file" ref={folderInputRef} style={{ display: 'none' }} webkitdirectory="" directory="" onChange={handleFolderUpload} />

      <FileManagerToolbar 
        breadcrumbPath={breadcrumbs}
        currentFolderId={currentFolderId}
        setCurrentFolderId={setCurrentFolderId}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        viewMode={viewMode}
        setViewMode={setViewMode}
        hasSelection={hasSelection}
        selectedCount={selectedItems.size}
        confirmBatchDelete={confirmBatchDelete}
        handleAskAboutCurrentFolder={handleAskAboutCurrentFolder}
        dragItem={dragItem}
        dragOverTarget={dragOverTarget}
        setDragOverTarget={setDragOverTarget}
        handleBreadcrumbDrop={handleFolderDrop}
      />

      <FileGrid 
        totalItems={totalItems}
        searchQuery={searchQuery}
        currentFolderId={currentFolderId}
        filteredFolders={filteredFolders}
        filteredFiles={filteredFiles}
        viewMode={viewMode}
        dragOverArea={dragOverArea}
        dragItem={dragItem}
        dragOverTarget={dragOverTarget}
        fileInputRef={fileInputRef}
        setCurrentFolderId={setCurrentFolderId}
        toggleSelect={toggleSelect}
        isSelected={isSelected}
        handleContextMenu={handleContextMenu}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        handleFolderDragOver={handleFolderDragOver}
        handleFolderDragLeave={handleFolderDragLeave}
        handleFolderDrop={handleFolderDrop}
        getFolderItemCount={getFolderItemCount}
        editingName={editingName}
        setEditingName={setEditingName}
        editNameValue={editNameValue}
        setEditNameValue={setEditNameValue}
        handleRenameSubmit={handleRenameSubmit}
        editInputRef={editInputRef}
        onScopeChange={onScopeChange}
        onSwitchToChat={onSwitchToChat}
      />

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

      <UploadProgressPanel uploadProgress={uploadProgress} setUploadProgress={setUploadProgress} />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreate={handleCreateFolder}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title={deleteConfirm.isBatch ? "Delete Items" : `Delete ${deleteConfirm.isFolder ? 'Folder' : 'File'}`}
          message={
            <div>
              <p>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?</p>
              {deleteConfirm.isBatch && <p style={{ fontSize: '12px', marginTop: '4px' }}>{deleteConfirm.batchDetails}</p>}
              {deleteConfirm.isFolder && <p style={{ color: 'var(--error)', marginTop: '8px' }}>⚠️ This will permanently delete this folder and all its contents (files and subfolders).</p>}
              <p style={{ marginTop: '8px', opacity: 0.8 }}>This action cannot be undone.</p>
            </div>
          }
          confirmLabel="Delete"
          confirmDanger={true}
          onConfirm={executeDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
