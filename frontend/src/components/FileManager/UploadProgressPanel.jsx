import React from 'react';
import './UploadProgressPanel.css';

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadProgressPanel({ uploadProgress, setUploadProgress }) {
  if (!uploadProgress) return null;

  return (
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
  );
}
