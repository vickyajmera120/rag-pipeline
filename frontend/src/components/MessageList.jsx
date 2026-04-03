import React, { useEffect, useRef } from 'react';
import SourceCard from './SourceCard';

export default function MessageList({ messages, isLoading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  /**
   * Simple markdown-to-HTML renderer (handles bold, code, lists, paragraphs).
   */
  function renderContent(text) {
    if (!text) return null;

    // Process the text into HTML-safe segments
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeContent = '';
    let listItems = [];
    let listType = null;

    const flushList = () => {
      if (listItems.length > 0) {
        const Tag = listType === 'ol' ? 'ol' : 'ul';
        elements.push(
          <Tag key={elements.length}>
            {listItems.map((item, i) => (
              <li key={i}>{processInline(item)}</li>
            ))}
          </Tag>
        );
        listItems = [];
        listType = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={elements.length}>
              <code>{codeContent}</code>
            </pre>
          );
          codeContent = '';
          inCodeBlock = false;
        } else {
          flushList();
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent += (codeContent ? '\n' : '') + line;
        continue;
      }

      // Unordered list items
      if (/^[\s]*[-*]\s+/.test(line)) {
        if (listType === 'ol') flushList();
        listType = 'ul';
        listItems.push(line.replace(/^[\s]*[-*]\s+/, ''));
        continue;
      }

      // Ordered list items
      if (/^[\s]*\d+\.\s+/.test(line)) {
        if (listType === 'ul') flushList();
        listType = 'ol';
        listItems.push(line.replace(/^[\s]*\d+\.\s+/, ''));
        continue;
      }

      flushList();

      // Empty lines
      if (!line.trim()) continue;

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={elements.length} style={{ margin: '8px 0 4px', fontSize: '0.95rem', fontWeight: 600 }}>
            {processInline(line.slice(4))}
          </h4>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={elements.length} style={{ margin: '10px 0 4px', fontSize: '1.05rem', fontWeight: 600 }}>
            {processInline(line.slice(3))}
          </h3>
        );
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={elements.length} style={{ margin: '12px 0 6px', fontSize: '1.15rem', fontWeight: 700 }}>
            {processInline(line.slice(2))}
          </h2>
        );
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={elements.length}>{processInline(line)}</p>
      );
    }

    flushList();

    return elements;
  }

  /**
   * Process inline markdown (bold, code, italic).
   */
  function processInline(text) {
    if (!text) return text;

    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Inline code
      const codeMatch = remaining.match(/`([^`]+)`/);

      let firstMatch = null;
      let firstIndex = Infinity;

      if (boldMatch && boldMatch.index < firstIndex) {
        firstMatch = { type: 'bold', match: boldMatch };
        firstIndex = boldMatch.index;
      }
      if (codeMatch && codeMatch.index < firstIndex) {
        firstMatch = { type: 'code', match: codeMatch };
        firstIndex = codeMatch.index;
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      // Add text before the match
      if (firstIndex > 0) {
        parts.push(remaining.slice(0, firstIndex));
      }

      if (firstMatch.type === 'bold') {
        parts.push(<strong key={key++}>{firstMatch.match[1]}</strong>);
        remaining = remaining.slice(firstIndex + firstMatch.match[0].length);
      } else if (firstMatch.type === 'code') {
        parts.push(<code key={key++}>{firstMatch.match[1]}</code>);
        remaining = remaining.slice(firstIndex + firstMatch.match[0].length);
      }
    }

    return parts;
  }

  return (
    <div className="message-list">
      <div className="message-list-inner">
        {messages.map((msg, idx) => (
          <div key={idx} className="message">
            <div className={`message-avatar ${msg.role}`}>
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-body">
              <div className="message-role">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
              <div className="message-content">
                {msg.content ? renderContent(msg.content) : (
                  isLoading && idx === messages.length - 1 ? (
                    <div className="typing-indicator">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  ) : null
                )}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  <div className="sources-label">📚 Sources</div>
                  {msg.sources.map((source, sIdx) => (
                    <SourceCard key={sIdx} source={source} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
