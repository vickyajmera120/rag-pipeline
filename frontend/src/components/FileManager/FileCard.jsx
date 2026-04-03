import React from 'react';
import './FileCard.css';

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

export default function FileCard({
  file,
  isSelected,
  onSelect,
  onContextMenu,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  isEditing,
  editNameValue,
  onEditChange,
  onRenameSubmit,
  onCancelEdit,
  editInputRef,
}) {
  return (
    <div
      className={`fm-card file ${isSelected ? 'selected' : ''}`}
      onClick={(e) => onSelect(file.file_id)}
      onContextMenu={(e) => onContextMenu(e, file)}
      onDoubleClick={() => onDoubleClick(file)}
      draggable="true"
      onDragStart={(e) => onDragStart(e, file.file_id, 'file')}
      onDragEnd={onDragEnd}
    >
      <div className="fm-card-check">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(file.file_id)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="fm-card-icon file-icon">
        <span className="fm-card-icon-emoji">{getFileIcon(file.file_name)}</span>
      </div>
      {isEditing ? (
        <input
          ref={editInputRef}
          className="fm-card-edit-input"
          value={editNameValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={() => onRenameSubmit(file.file_id, false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameSubmit(file.file_id, false);
            if (e.key === 'Escape') onCancelEdit();
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
          onContextMenu(e, file);
        }}
      >
        ⋮
      </button>
    </div>
  );
}
