import React, { useState, useRef, useEffect } from 'react';

export default function CreateFolderModal({ onClose, onCreate, existingNames = [] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError('Folder name is required');
      return;
    }

    if (/[<>:"/\\|?*]/.test(trimmed)) {
      setError('Folder name contains invalid characters');
      return;
    }

    if (existingNames.includes(trimmed.toLowerCase())) {
      setError('A folder with this name already exists');
      return;
    }

    onCreate(trimmed);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create New Folder</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="modal-label">Folder Name</label>
            <input
              ref={inputRef}
              type="text"
              className="modal-input"
              placeholder="My Documents"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              maxLength={64}
              id="folder-name-input"
            />
            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" id="create-folder-submit">
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
