import React, { useState, useRef, useEffect } from 'react';

export default function MessageInput({ onSend, isLoading, onShowUpload, hasDocuments, scopeLabel, onClearScope }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="message-input-container">
      <div className="message-input-inner">
        {/* Scope indicator */}
        {scopeLabel && (
          <div className="scope-indicator">
            <div className="scope-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Searching in: {scopeLabel}</span>
              <button
                className="scope-clear"
                onClick={onClearScope}
                title="Clear scope — search all files"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="message-input-wrapper">
          <button
            className="header-btn"
            onClick={onShowUpload}
            title="Upload documents"
            style={{ padding: '6px 10px', borderRadius: '8px' }}
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder={
              scopeLabel
                ? `Ask about "${scopeLabel}"...`
                : hasDocuments
                  ? 'Ask a question about your documents...'
                  : 'Upload documents first, then ask questions...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
            id="message-input"
          />
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            title="Send message"
            id="send-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div className="input-hint">
          Press Enter to send · Shift+Enter for new line
          {scopeLabel && <span> · Scoped to {scopeLabel}</span>}
        </div>
      </div>
    </div>
  );
}
