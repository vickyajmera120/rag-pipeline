import React, { useEffect, useRef } from 'react';
import './FileContextMenu.css';

export default function FileContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (rect.right > vw) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > vh) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      className="fm-context-menu"
      ref={menuRef}
      style={{ left: x, top: y }}
      id="file-context-menu"
    >
      {items.map((item, idx) =>
        item.divider ? (
          <div key={idx} className="fm-context-menu-divider" />
        ) : (
          <button
            key={idx}
            className={`fm-context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            disabled={item.disabled}
          >
            <span className="fm-context-menu-icon">{item.icon}</span>
            <span className="fm-context-menu-label">{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}
