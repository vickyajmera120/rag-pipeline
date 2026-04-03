import React, { useState, useRef, useCallback } from 'react';
import { uploadFiles, uploadZip, uploadFolder } from '../services/api';

export default function UploadPanel({ onClose, onUploadComplete }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Check if it's a ZIP
    if (files.length === 1 && files[0].name.endsWith('.zip')) {
      await handleZipUpload(files[0]);
    } else {
      await handleFilesUpload(files);
    }
  }, []);

  const handleFilesUpload = async (files) => {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFiles(files);
      setUploadResult(result);
      onUploadComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleZipUpload = async (file) => {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadZip(file);
      setUploadResult(result);
      onUploadComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFolderUpload = async (files) => {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFolder(files);
      setUploadResult(result);
      onUploadComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="upload-overlay" onClick={onClose}>
      <div className="upload-panel" onClick={(e) => e.stopPropagation()}>
        <div className="upload-panel-header">
          <h2 className="upload-panel-title">Upload Documents</h2>
          <button className="close-btn" onClick={onClose} id="close-upload-btn">
            ✕
          </button>
        </div>

        {/* Drop Zone */}
        <div
          className={`dropzone ${dragOver ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          id="dropzone"
        >
          <div className="dropzone-icon">
            {uploading ? '⏳' : '📁'}
          </div>
          <div className="dropzone-text">
            {uploading
              ? 'Uploading...'
              : <>Drag & drop files here or <strong>click to browse</strong></>
            }
          </div>
          <div className="dropzone-hint">
            Supported: PDF, DOCX, Markdown, TXT, ZIP
          </div>
        </div>

        {/* Upload Options */}
        <div className="upload-options">
          <button
            className="upload-option-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            id="upload-files-btn"
          >
            📄 Upload Files
          </button>
          <button
            className="upload-option-btn"
            onClick={() => zipInputRef.current?.click()}
            disabled={uploading}
            id="upload-zip-btn"
          >
            🗜️ Upload ZIP
          </button>
          <button
            className="upload-option-btn"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
            id="upload-folder-btn"
            style={{ gridColumn: 'span 2' }}
          >
            📂 Upload Folder
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept=".pdf,.docx,.md,.txt"
          onChange={(e) => handleFilesUpload(Array.from(e.target.files))}
        />
        <input
          type="file"
          ref={zipInputRef}
          style={{ display: 'none' }}
          accept=".zip"
          onChange={(e) => e.target.files[0] && handleZipUpload(e.target.files[0])}
        />
        <input
          type="file"
          ref={folderInputRef}
          style={{ display: 'none' }}
          webkitdirectory=""
          directory=""
          onChange={(e) => handleFolderUpload(Array.from(e.target.files))}
        />

        {/* Status */}
        {error && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            borderRadius: '10px',
            color: '#f87171',
            fontSize: '0.8125rem',
          }}>
            ⚠️ {error}
          </div>
        )}

        {uploadResult && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(52, 211, 153, 0.1)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '10px',
            color: '#34d399',
            fontSize: '0.8125rem',
          }}>
            ✅ {uploadResult.message}
            <div className="file-list">
              {uploadResult.files?.map((f, i) => (
                <div key={i} className="file-item">
                  <span className="file-item-icon">📄</span>
                  <span className="file-item-name">{f.name || f.path}</span>
                  <span className="file-item-size">{formatSize(f.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
