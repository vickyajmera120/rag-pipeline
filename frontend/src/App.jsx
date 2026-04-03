import React, { useState, useEffect, useCallback } from 'react';
import IconBar from './components/IconBar';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import FileManager from './components/FileManager';
import UploadPanel from './components/UploadPanel';
import StatusIndicator from './components/StatusIndicator';
import { getIngestionStatus, getSystemStats, getConversations } from './services/api';

export default function App() {
  const [activeView, setActiveView] = useState('chat');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Scoped Q&A state
  const [scopedFileIds, setScopedFileIds] = useState(null);
  const [scopeLabel, setScopeLabel] = useState('');

  // Poll ingestion status
  useEffect(() => {
    let interval;
    let hideTimeout;

    const pollStatus = async () => {
      try {
        const status = await getIngestionStatus();
        setIngestionStatus(status);
        const processing = status.processing > 0;

        if (processing) {
          setIsProcessing(true);
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
          if (!interval) {
            interval = setInterval(pollStatus, 2000);
          }
        } else {
          if (isProcessing) {
            hideTimeout = setTimeout(() => {
              setIsProcessing(false);
              hideTimeout = null;
            }, 5000);
          }
          
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      } catch (e) {
        // Backend might not be ready yet
      }
    };

    pollStatus();
    interval = setInterval(pollStatus, 5000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // Fetch stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const s = await getSystemStats();
        setStats(s);
      } catch (e) { /* ignore */ }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch conversations
  const refreshConversations = useCallback(async () => {
    try {
      const convs = await getConversations();
      setConversations(convs);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setScopedFileIds(null);
    setScopeLabel('');
  };

  const handleSelectConversation = (convId) => {
    setActiveConversationId(convId);
  };

  const handleConversationUpdate = (convId) => {
    setActiveConversationId(convId);
    refreshConversations();
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    setIsProcessing(true);
  };

  // File manager → Chat scoped Q&A
  const handleScopeChange = (fileIds, label) => {
    setScopedFileIds(fileIds);
    setScopeLabel(label);
    // Start a new chat when scoping changes
    setActiveConversationId(null);
    setMessages([]);
  };

  const handleClearScope = () => {
    setScopedFileIds(null);
    setScopeLabel('');
  };

  return (
    <div className="app-layout">
      <IconBar activeView={activeView} onViewChange={setActiveView} />

      {activeView === 'chat' && (
        <>
          <Sidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            stats={stats}
          />

          <div className="main-content">
            {isProcessing && ingestionStatus && (
              <StatusIndicator status={ingestionStatus} />
            )}

            <ChatInterface
              conversationId={activeConversationId}
              messages={messages}
              setMessages={setMessages}
              onConversationUpdate={handleConversationUpdate}
              onShowUpload={() => setShowUpload(true)}
              stats={stats}
              scopedFileIds={scopedFileIds}
              scopeLabel={scopeLabel}
              onClearScope={handleClearScope}
            />
          </div>
        </>
      )}

      {activeView === 'files' && (
        <div className="main-content files-view">
          {isProcessing && ingestionStatus && (
            <StatusIndicator status={ingestionStatus} />
          )}
          <FileManager
            onScopeChange={handleScopeChange}
            onSwitchToChat={() => setActiveView('chat')}
          />
        </div>
      )}

      {showUpload && (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </div>
  );
}
