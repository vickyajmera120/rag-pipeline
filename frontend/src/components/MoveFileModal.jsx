import React, { useState } from 'react';

export default function MoveFileModal({ onClose, onMove, folders, currentFolderId }) {
  const [selectedFolderId, setSelectedFolderId] = useState(null);

  // Build a tree from the flat folder list
  const buildTree = (parentId = null, depth = 0) => {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((folder) => ({
        ...folder,
        depth,
        children: buildTree(folder.id, depth + 1),
      }));
  };

  const tree = buildTree();

  const flattenTree = (nodes) => {
    const result = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...flattenTree(node.children));
      }
    }
    return result;
  };

  const flatList = flattenTree(tree);

  const handleMove = () => {
    onMove(selectedFolderId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Move to Folder</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="move-tree">
            {/* Root option */}
            <button
              className={`move-tree-item ${selectedFolderId === null ? 'selected' : ''}`}
              onClick={() => setSelectedFolderId(null)}
            >
              <span className="move-tree-icon">📁</span>
              <span className="move-tree-name">Root (No Folder)</span>
            </button>

            {flatList.map((folder) => (
              <button
                key={folder.id}
                className={`move-tree-item ${selectedFolderId === folder.id ? 'selected' : ''} ${
                  folder.id === currentFolderId ? 'current' : ''
                }`}
                onClick={() => setSelectedFolderId(folder.id)}
                style={{ paddingLeft: `${16 + folder.depth * 20}px` }}
                disabled={folder.id === currentFolderId}
              >
                <span className="move-tree-icon">📁</span>
                <span className="move-tree-name">{folder.name}</span>
                {folder.id === currentFolderId && (
                  <span className="move-tree-current">(current)</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            onClick={handleMove}
            id="move-file-submit"
          >
            Move Here
          </button>
        </div>
      </div>
    </div>
  );
}
