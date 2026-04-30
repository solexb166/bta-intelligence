import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

// ── Simple markdown renderer ─────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading 2
    if (/^## /.test(line)) {
      elements.push(<h2 key={i}>{line.slice(3)}</h2>);
      i++; continue;
    }
    // Heading 3
    if (/^### /.test(line)) {
      elements.push(<h3 key={i}>{line.slice(4)}</h3>);
      i++; continue;
    }
    // Heading 1
    if (/^# /.test(line)) {
      elements.push(<h1 key={i}>{line.slice(2)}</h1>);
      i++; continue;
    }
    // Bullet list item
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i}>{inlineFormat(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    }
    // Numbered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{inlineFormat(lines[i].replace(/^\d+\. /, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`}>{items}</ol>);
      continue;
    }
    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} />);
      i++; continue;
    }
    // Empty line
    if (line.trim() === '') {
      elements.push(<br key={i} />);
      i++; continue;
    }
    // Paragraph
    elements.push(<p key={i}>{inlineFormat(line)}</p>);
    i++;
  }
  return elements;
}

function inlineFormat(text) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

// ── SVG Icons ────────────────────────────────────────────────────────────
const Icon = {
  Chat: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Grid: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  TrendUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  Sparkle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Logo: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
      <line x1="12" y1="2" x2="12" y2="22"/>
      <line x1="2" y1="8.5" x2="22" y2="8.5"/>
      <line x1="2" y1="15.5" x2="22" y2="15.5"/>
    </svg>
  ),
  Send: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Menu: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  Close: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};

const CAPABILITIES = [
  {
    id: 'nlqa',
    Icon: Icon.Chat,
    label: 'Natural language Q&A',
    prompt: 'What insights can you give me from the current member and brand data?',
  },
  {
    id: 'gap',
    Icon: Icon.Search,
    label: 'Research gap detection',
    prompt: 'Identify any research gaps or under-represented segments in the survey data.',
  },
  {
    id: 'archetype',
    Icon: Icon.Grid,
    label: 'Archetype clustering',
    prompt: 'Cluster the members into distinct archetypes based on their behavioural patterns.',
  },
  {
    id: 'trend',
    Icon: Icon.TrendUp,
    label: 'Trend detection',
    prompt: 'Detect any notable trends or shifts across the trends and survey response tables.',
  },
  {
    id: 'predict',
    Icon: Icon.Sparkle,
    label: 'Predictive modeling',
    prompt: 'Based on the current data, what outcomes or behaviours can we predict?',
  },
];

const SUGGESTIONS = [
  'Summarise the member demographics',
  'Which brands have the most responses?',
  'What are the top survey themes?',
  'Show emerging trends in the data',
];

const WELCOME = {
  role: 'assistant',
  content:
    'Hello! I\'m BTA Intelligence — your AI analyst with live access to the research database.\n\nAsk me anything about members, brands, survey responses, or trends. Or pick a suggestion below to get started.',
  isWelcome: true,
};

export default function App() {
  const [messages,   setMessages]   = useState([WELCOME]);
  const [history,    setHistory]    = useState([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [active,     setActive]     = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef                   = useRef(null);
  const textareaRef                 = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  const sendMessage = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3000/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trimmed, history }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Server error');

      const assistantMsg = { role: 'assistant', content: data.reply };
      setMessages(prev => [...prev, assistantMsg]);
      setHistory(prev => [
        ...prev,
        { role: 'user',      content: trimmed     },
        { role: 'assistant', content: data.reply  },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCapability = (cap) => {
    setActive(cap.id);
    setSidebarOpen(false);
    sendMessage(cap.prompt);
  };

  const handleSuggestion = (text) => {
    setSidebarOpen(false);
    sendMessage(text);
  };

  const clearChat = () => {
    setMessages([WELCOME]);
    setHistory([]);
    setActive(null);
  };

  return (
    <div className="app">
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-logo"><Icon.Logo /></span>
          <span className="sidebar-title">BTA Intelligence</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><Icon.Close /></button>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Capabilities</p>
          {CAPABILITIES.map(cap => (
            <button
              key={cap.id}
              className={`cap-btn${active === cap.id ? ' active' : ''}`}
              onClick={() => handleCapability(cap)}
              disabled={loading}
            >
              <span className="cap-icon"><cap.Icon /></span>
              <span className="cap-label">{cap.label}</span>
            </button>
          ))}
        </nav>

        <button className="clear-btn" onClick={clearChat}>
          <Icon.Refresh /> New conversation
        </button>
      </aside>

      {/* ── Chat area ── */}
      <main className="chat">
        {/* Mobile header */}
        <div className="mobile-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}><Icon.Menu /></button>
          <span className="mobile-title">BTA Intelligence</span>
        </div>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="avatar"><Icon.Logo /></div>
              )}
              <div className="bubble">
                <div className="bubble-text">
                  {renderMarkdown(msg.content)}
                </div>
                {msg.isWelcome && (
                  <div className="chips">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        className="chip"
                        onClick={() => handleSuggestion(s)}
                        disabled={loading}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="msg-row assistant">
              <div className="avatar"><Icon.Logo /></div>
              <div className="bubble typing-bubble">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input bar ── */}
        <div className="input-bar">
          <textarea
            ref={textareaRef}
            className="input-field"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your research data…"
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
          >
            <Icon.Send />
          </button>
        </div>
      </main>
    </div>
  );
}
