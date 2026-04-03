import React from 'react';

export default function StatusIndicator({ status }) {
  if (!status) return null;

  const { total_files, indexed, processing, errored, files } = status;

  const getStatusClass = () => {
    if (processing > 0) return 'processing';
    if (errored > 0) return 'error';
    return 'ready';
  };

  const getStatusText = () => {
    if (processing > 0) {
      // Find what's currently being processed
      const activeFile = files?.find(f =>
        ['parsing', 'chunking', 'embedding'].includes(f.status)
      );
      if (activeFile) {
        return `Processing: ${activeFile.file_name} (${activeFile.status})`;
      }
      return `Processing ${processing} file(s)...`;
    }
    if (errored > 0) {
      return `${errored} file(s) failed`;
    }
    return `${indexed} file(s) indexed and ready`;
  };

  const progressPercent = total_files > 0
    ? Math.round((indexed / total_files) * 100)
    : 0;

  return (
    <div className="status-bar">
      <div className={`status-dot ${getStatusClass()}`} />
      <span className="status-text">{getStatusText()}</span>
      {processing > 0 && (
        <div className="status-progress">
          <div
            className="status-progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
