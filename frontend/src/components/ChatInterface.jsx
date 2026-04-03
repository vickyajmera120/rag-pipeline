import React, { useState, useRef, useCallback } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { sendQueryStream } from '../services/api';

export default function ChatInterface({
  conversationId,
  messages,
  setMessages,
  onConversationUpdate,
  onShowUpload,
  stats,
  scopedFileIds,
  scopeLabel,
  onClearScope,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentConvId, setCurrentConvId] = useState(conversationId);
  const abortRef = useRef(null);

  const handleSend = useCallback(async (query) => {
    if (!query.trim() || isLoading) return;

    // Add user message
    const userMessage = { role: 'user', content: query, sources: [] };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Add placeholder assistant message
    const assistantMessage = { role: 'assistant', content: '', sources: [] };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      let convId = currentConvId || conversationId;
      let fullContent = '';

      for await (const event of sendQueryStream(query, convId, 5, scopedFileIds)) {
        if (event.type === 'sources') {
          convId = event.conversation_id;
          setCurrentConvId(convId);

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              sources: event.sources || [],
            };
            return updated;
          });
        } else if (event.type === 'content') {
          fullContent += event.content;
          const contentSnapshot = fullContent;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: contentSnapshot,
            };
            return updated;
          });
        } else if (event.type === 'done') {
          if (convId) {
            onConversationUpdate(convId);
          }
        } else if (event.type === 'error') {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: `Error: ${event.message}`,
            };
            return updated;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `Error: ${err.message}. Make sure the backend is running and documents are indexed.`,
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, currentConvId, conversationId, setMessages, onConversationUpdate, scopedFileIds]);

  const hasMessages = messages.length > 0;
  const hasDocuments = stats && stats.total_documents > 0;

  return (
    <>
      {!hasMessages ? (
        <div className="welcome-screen">
          <div className="welcome-icon">🧠</div>
          <h1 className="welcome-title">RAG Pipeline</h1>
          <p className="welcome-subtitle">
            Upload your documents and ask questions. Get accurate, context-grounded
            answers with source references.
          </p>
          <div className="welcome-features">
            <div className="welcome-feature" onClick={onShowUpload}>
              <div className="welcome-feature-icon">📄</div>
              <div className="welcome-feature-title">Upload Documents</div>
              <div className="welcome-feature-desc">
                PDF, DOCX, MD, TXT, or ZIP
              </div>
            </div>
            <div className="welcome-feature">
              <div className="welcome-feature-icon">🔍</div>
              <div className="welcome-feature-title">Hybrid Search</div>
              <div className="welcome-feature-desc">
                Semantic + keyword retrieval
              </div>
            </div>
            <div className="welcome-feature">
              <div className="welcome-feature-icon">✨</div>
              <div className="welcome-feature-title">Accurate Answers</div>
              <div className="welcome-feature-desc">
                Cross-encoder reranked sources
              </div>
            </div>
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isLoading={isLoading} />
      )}

      <MessageInput
        onSend={handleSend}
        isLoading={isLoading}
        onShowUpload={onShowUpload}
        hasDocuments={hasDocuments}
        scopeLabel={scopeLabel}
        onClearScope={onClearScope}
      />
    </>
  );
}
