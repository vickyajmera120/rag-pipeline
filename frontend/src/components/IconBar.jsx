import React from 'react';

export default function IconBar({ activeView, onViewChange }) {
  const items = [
    { id: 'chat', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ), label: 'Chat' },
    { id: 'files', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ), label: 'Files' },
  ];

  return (
    <nav className="icon-bar" id="icon-bar">
      <div className="icon-bar-top">
        <div className="icon-bar-logo">
          <div className="icon-bar-logo-glyph">🧠</div>
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            className={`icon-bar-btn ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            title={item.label}
            id={`icon-bar-${item.id}`}
          >
            <span className="icon-bar-indicator" />
            <span className="icon-bar-icon">{item.icon}</span>
            <span className="icon-bar-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
