import React, { useState } from 'react';

export default function SourceCard({ source }) {
  const [expanded, setExpanded] = useState(false);

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return '📕';
      case 'docx': case 'doc': return '📘';
      case 'md': return '📗';
      case 'txt': return '📄';
      default: return '📄';
    }
  };

  // Cross-encoder outputs raw logits; sigmoid converts to probability
  const scorePercent = source.relevance_score != null
    ? Math.round(1 / (1 + Math.exp(-source.relevance_score)) * 100)
    : null;

  return (
    <div
      className={`source-card ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="source-card-header">
        <span className="source-card-icon">{getFileIcon(source.file_name)}</span>
        <span className="source-card-name">{source.file_name}</span>
        {source.section_title && (
          <span className="source-card-section">› {source.section_title}</span>
        )}
        {scorePercent !== null && (
          <span className="source-card-score" style={{ marginLeft: 'auto' }}>
            {scorePercent}% match
          </span>
        )}
      </div>
      <div className="source-card-snippet">
        {source.snippet}
      </div>
    </div>
  );
}
