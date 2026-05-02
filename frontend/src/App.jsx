import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Logo: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  Chat: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Grid: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  TrendUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  Star: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Send: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  { id: 'nlqa',      Icon: Icon.Chat,    label: 'Natural language Q&A',   prompt: 'What are the top 5 brands by BHI score in the latest period?' },
  { id: 'gap',       Icon: Icon.Search,  label: 'Research gap detection',  prompt: 'Which survey questions have the fewest responses in the last 90 days?' },
  { id: 'archetype', Icon: Icon.Grid,    label: 'Archetype clustering',    prompt: 'Build 4 respondent archetypes from the available user data' },
  { id: 'trend',     Icon: Icon.TrendUp, label: 'Trend detection',         prompt: 'Show the quarter over quarter trend for awareness and recommendation' },
  { id: 'predict',   Icon: Icon.Star,    label: 'Predictive modelling',    prompt: 'What variables best predict likelihood to recommend among Budtenders?' },
];

const SUGGESTIONS = [
  'Summarise the member demographics',
  'Which brands have the most responses?',
  'What are the top survey themes?',
  'Show emerging trends in the data',
];

const WELCOME = {
  role: 'assistant',
  content: 'Hello, I am BTA Intelligence — your AI analyst with live access to the research database.\n\nAsk me anything about members, brands, survey responses, or trends. Or pick a suggestion below to get started.',
  isWelcome: true,
};

function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^## /.test(line)) { elements.push(<h2 key={i}>{line.slice(3)}</h2>); i++; continue; }
    if (/^### /.test(line)) { elements.push(<h3 key={i}>{line.slice(4)}</h3>); i++; continue; }
    if (/^# /.test(line)) { elements.push(<h1 key={i}>{line.slice(2)}</h1>); i++; continue; }
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(<li key={i}>{fmt(lines[i].slice(2))}</li>); i++; }
      elements.push(<ul key={`ul-${i}`}>{items}</ul>); continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(<li key={i}>{fmt(lines[i].replace(/^\d+\. /, ''))}</li>); i++; }
      elements.push(<ol key={`ol-${i}`}>{items}</ol>); continue;
    }
    if (/^---+$/.test(line.trim())) { elements.push(<hr key={i} />); i++; continue; }
    if (line.trim() === '') { elements.push(<br key={i} />); i++; continue; }
    elements.push(<p key={i}>{fmt(line)}</p>); i++;
  }
  return elements;
}

function fmt(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2,-2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1,-1)}</code>;
    return part;
  });
}

export default function App() {
  const [messages,    setMessages]    = useState([WELCOME]);
  const [history,     setHistory]     = useState([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [active,      setActive]      = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }, [input]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    const newHistory = [...history, { role: 'user', content: msg }];
    try {
      const res = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || 'No response received.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setHistory([...newHistory, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please check the backend is running.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([WELCOME]);
    setHistory([]);
    setActive(null);
    setSidebarOpen(false);
  };

  const handleCapability = (cap) => {
    setActive(cap.id);
    setSidebarOpen(false);
    sendMessage(cap.prompt);
  };

  return (
    <div className="app">
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo"><Icon.Logo /></div>
            <div>
              <div className="sidebar-name">BTA Intelligence</div>
            </div>
            <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><Icon.Close /></button>
          </div>
          <div className="sidebar-sub">Research Platform</div>
        </div>

        <div className="sidebar-nav-wrapper">
          <div className="sidebar-section-label">Capabilities</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {CAPABILITIES.map(cap => (
              <button
                key={cap.id}
                className={`cap-btn${active === cap.id ? ' active' : ''}`}
                onClick={() => handleCapability(cap)}
                disabled={loading}
              >
                <span className="cap-icon"><cap.Icon /></span>
                {cap.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button className="clear-btn" onClick={clearChat}>
            <Icon.Refresh /> New conversation
          </button>
        </div>
      </aside>

      <main className="chat">
        <div className="mobile-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}><Icon.Menu /></button>
          <span className="mobile-title">BTA Intelligence</span>
        </div>

        <div className="chat-header">
          <div className="header-left">
            <div className="header-title">Research Assistant</div>
            <div className="header-sub">Budtenders Association Analytics</div>
          </div>
          <div className="header-status">
            <div className="status-dot" />
            Connected to live database
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="avatar"><Icon.Logo /></div>
              )}
              <div className="bubble">
                <div className="bubble-text">{renderMarkdown(msg.content)}</div>
                {msg.isWelcome && (
                  <div className="chips">
                    {SUGGESTIONS.map(s => (
                      <button key={s} className="chip" onClick={() => sendMessage(s)} disabled={loading}>{s}</button>
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
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="input-bar">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              className="input-field"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your research data..."
              rows={1}
              disabled={loading}
            />
          </div>
          <button className="send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
            <Icon.Send />
          </button>
        </div>
      </main>
    </div>
  );
}
