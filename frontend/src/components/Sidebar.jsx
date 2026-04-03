import React from 'react';

export default function Sidebar({
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  stats,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🧠</div>
          <span className="sidebar-logo-text">RAG Pipeline</span>
        </div>
        <button className="new-chat-btn" onClick={onNewChat} id="new-chat-btn">
          <span>＋</span>
          <span>New Chat</span>
        </button>
      </div>

      <div className="sidebar-conversations">
        {conversations.length === 0 ? (
          <div className="empty-conversations">
            No conversations yet.<br />Start by asking a question!
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.conversation_id}
              className={`conversation-item ${
                conv.conversation_id === activeConversationId ? 'active' : ''
              }`}
              onClick={() => onSelectConversation(conv.conversation_id)}
            >
              <div className="conversation-item-content">
                <div className="conversation-item-title">{conv.title}</div>
                <div className="conversation-item-meta">
                  {conv.message_count} messages
                </div>
              </div>
              <button
                className="conversation-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDeleteConversation) onDeleteConversation(conv.conversation_id);
                }}
                title="Delete Conversation"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-stats">
          <div className="sidebar-stat-row">
            <span>Documents</span>
            <span>{stats?.total_documents ?? '—'}</span>
          </div>
          <div className="sidebar-stat-row">
            <span>Chunks</span>
            <span>{stats?.total_chunks ?? '—'}</span>
          </div>
          <div className="sidebar-stat-row">
            <span>Index Size</span>
            <span>{stats?.index_size_mb ? `${stats.index_size_mb} MB` : '—'}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
