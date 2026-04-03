import React from 'react';
import './FolderCard.css';

export default function FolderCard({
  folder,
  isSelected,
  onSelect,
  onDoubleClick,
  onContextMenu,
  isDragTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  itemCount,
  isEditing,
  editNameValue,
  onEditChange,
  onRenameSubmit,
  onCancelEdit,
  editInputRef,
}) {
  return (
    <div
      className={`fm-card folder ${isSelected ? 'selected' : ''} ${isDragTarget ? 'drag-over' : ''}`}
      onClick={(e) => {
        if (e.detail === 2) {
          onDoubleClick(folder.id);
        } else {
          onSelect(folder.id, true);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, folder, true)}
      draggable="true"
      onDragStart={(e) => onDragStart(e, folder.id, 'folder')}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, folder.id)}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragOver(e, folder.id);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, folder.id)}
    >
      <div className="fm-card-check">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(folder.id, true)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="fm-card-icon folder-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
      </div>
      {isEditing ? (
        <input
          ref={editInputRef}
          className="fm-card-edit-input"
          value={editNameValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={() => onRenameSubmit(`folder:${folder.id}`, true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameSubmit(`folder:${folder.id}`, true);
            if (e.key === 'Escape') onCancelEdit();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="fm-card-name">{folder.name}</div>
      )}
      <div className="fm-card-meta">
        {itemCount} file{itemCount !== 1 ? 's' : ''}
      </div>
      <button
        className="fm-card-menu"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, folder, true);
        }}
      >
        ⋮
      </button>
    </div>
  );
}
