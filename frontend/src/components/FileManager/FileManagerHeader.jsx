import React from 'react';
import './FileManagerHeader.css';

export default function FileManagerHeader({
  filesCount,
  uploading,
  showUploadMenu,
  setShowUploadMenu,
  uploadMenuRef,
  fileInputRef,
  zipInputRef,
  folderInputRef,
  setShowCreateFolder,
}) {
  return (
    <div className="fm-header">
      <div className="fm-header-left">
        <h2 className="fm-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Knowledge Base
        </h2>
        <span className="fm-file-count">{filesCount} files</span>
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
    </div>
  );
}
