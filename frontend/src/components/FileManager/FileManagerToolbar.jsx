import React from 'react';
import './FileManagerToolbar.css';

export default function FileManagerToolbar({
  breadcrumbPath,
  currentFolderId,
  setCurrentFolderId,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  viewMode,
  setViewMode,
  hasSelection,
  selectedCount,
  confirmBatchDelete,
  handleAskAboutCurrentFolder,
  dragItem,
  dragOverTarget,
  setDragOverTarget,
  handleBreadcrumbDrop,
}) {
  return (
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
            🗑️ Delete ({selectedCount})
          </button>
        )}
      </div>
    </div>
  );
}
