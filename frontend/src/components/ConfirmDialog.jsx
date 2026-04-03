import React, { useEffect, useRef } from 'react';
import './ConfirmDialog.css';

export default function ConfirmDialog({ title, message, items, confirmLabel, confirmDanger, onConfirm, onCancel }) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel]);

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">⚠️</div>
        <h3 className="confirm-title">{title || 'Are you sure?'}</h3>
        <p className="confirm-message">{message}</p>

        {items && items.length > 0 && (
          <div className="confirm-items">
            {items.map((item, i) => (
              <div key={i} className="confirm-item">
                <span className="confirm-item-icon">{item.icon || '📄'}</span>
                <span className="confirm-item-name">{item.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            className={`confirm-btn ${confirmDanger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
