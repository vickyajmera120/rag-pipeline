import React from 'react';
import './FileGrid.css';
import FolderCard from './FolderCard';
import FileCard from './FileCard';

export default function FileGrid({
  totalItems,
  searchQuery,
  currentFolderId,
  filteredFolders,
  filteredFiles,
  viewMode,
  dragOverArea,
  dragItem,
  dragOverTarget,
  fileInputRef,
  setCurrentFolderId,
  toggleSelect,
  isSelected,
  handleContextMenu,
  handleDragStart,
  handleDragEnd,
  handleFolderDragOver,
  handleFolderDragLeave,
  handleFolderDrop,
  getFolderItemCount,
  editingName,
  setEditingName,
  editNameValue,
  setEditNameValue,
  handleRenameSubmit,
  editInputRef,
  onScopeChange,
  onSwitchToChat,
}) {
  return (
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
            <FolderCard
              key={folder.id}
              folder={folder}
              isSelected={isSelected(folder.id, true)}
              onSelect={toggleSelect}
              onDoubleClick={setCurrentFolderId}
              onContextMenu={handleContextMenu}
              isDragTarget={dragOverTarget === folder.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleFolderDragOver}
              onDragLeave={handleFolderDragLeave}
              onDrop={handleFolderDrop}
              itemCount={getFolderItemCount(folder.id)}
              isEditing={editingName === `folder:${folder.id}`}
              editNameValue={editNameValue}
              onEditChange={setEditNameValue}
              onRenameSubmit={handleRenameSubmit}
              onCancelEdit={() => setEditingName(null)}
              editInputRef={editInputRef}
            />
          ))}

          {/* Files */}
          {filteredFiles.map((file) => (
            <FileCard
              key={file.file_id}
              file={file}
              isSelected={isSelected(file.file_id)}
              onSelect={() => toggleSelect(file.file_id)}
              onContextMenu={(e, f) => handleContextMenu(e, f)}
              onDoubleClick={() => {
                onScopeChange([file.file_id], file.file_name);
                onSwitchToChat();
              }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isEditing={editingName === file.file_id}
              editNameValue={editNameValue}
              onEditChange={setEditNameValue}
              onRenameSubmit={handleRenameSubmit}
              onCancelEdit={() => setEditingName(null)}
              editInputRef={editInputRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}
