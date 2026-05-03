import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// ── Robot Avatar ──────────────────────────────────────────────────────────────
function RobotAvatar({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#2563EB"/>
      <rect x="10" y="8" width="16" height="13" rx="3" fill="#EFF6FF"/>
      <circle cx="14.5" cy="13.5" r="2.2" fill="#2563EB"/>
      <circle cx="21.5" cy="13.5" r="2.2" fill="#2563EB"/>
      <rect x="15" y="17" width="6" height="2" rx="1" fill="#93C5FD"/>
      <rect x="17" y="21" width="2" height="3" fill="#EFF6FF"/>
      <rect x="10" y="24" width="16" height="6" rx="2" fill="#1D4ED8"/>
      <rect x="6" y="13" width="3" height="5" rx="1.5" fill="#EFF6FF"/>
      <rect x="27" y="13" width="3" height="5" rx="1.5" fill="#EFF6FF"/>
      <circle cx="14" cy="28" r="1.5" fill="#60A5FA"/>
      <circle cx="22" cy="28" r="1.5" fill="#60A5FA"/>
    </svg>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Chat: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>),
  Search: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>),
  Grid: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>),
  TrendUp: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>),
  Star: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>),
  Send: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>),
  Refresh: () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>),
  Menu: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>),
  Close: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>),
  Calendar: () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>),
  ChevronLeft: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>),
  ChevronRight: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>),
};

const CAPABILITIES = [
  { id: 'nlqa',      Icon: Icon.Chat,    label: 'NL Q&A',              prompt: 'What are the top 5 brands by BHI score in the latest period?' },
  { id: 'gap',       Icon: Icon.Search,  label: 'Gap detection',        prompt: 'Which survey questions have the fewest responses in the last 90 days?' },
  { id: 'archetype', Icon: Icon.Grid,    label: 'Clustering',           prompt: 'Build 4 respondent archetypes from the available user data' },
  { id: 'trend',     Icon: Icon.TrendUp, label: 'Trend detection',      prompt: 'Show the quarter over quarter trend for awareness and recommendation' },
  { id: 'predict',   Icon: Icon.Star,    label: 'Predictive modelling', prompt: 'What variables best predict likelihood to recommend among Budtenders?' },
];

const SUGGESTIONS = [
  { icon: Icon.Star,    text: 'Top brands by quality' },
  { icon: Icon.TrendUp, text: 'Recommendation drivers' },
  { icon: Icon.Search,  text: 'Province comparison' },
  { icon: Icon.Grid,    text: 'Survey gaps' },
];
const WELCOME = {
  role: 'assistant',
  content: 'Hello, I am BTA Intelligence — your AI analyst with live access to the research database.\n\nAsk me anything about members, brands, survey responses, or trends. Or pick a suggestion below to get started.',
  isWelcome: true,
};

// ── Chart component ───────────────────────────────────────────────────────────
function ChartBlock({ data }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data || !window.Chart) return;

    // Destroy old chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d');
    let config;

    if (data.type === 'bar_horizontal') {
      config = {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: data.color || '#2563EB',
            borderRadius: 4,
            borderSkipped: false,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            title: { display: true, text: data.title, font: { size: 12 }, color: '#374151', padding: { bottom: 10 } },
          },
          scales: {
            x: { grid: { color: '#F3F4F6' }, ticks: { color: '#6B7280', font: { size: 10 } } },
            y: { grid: { display: false }, ticks: { color: '#374151', font: { size: 10 } } },
          },
        },
      };
    } else if (data.type === 'line') {
      config = {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: data.datasets.map(d => ({
            label: d.label,
            data: d.values,
            borderColor: d.color,
            backgroundColor: d.color + '15',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: d.color,
            borderWidth: 2,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#374151', boxWidth: 12, padding: 12 } },
            title: { display: true, text: data.title, font: { size: 12 }, color: '#374151', padding: { bottom: 10 } },
          },
          scales: {
            x: { grid: { color: '#F3F4F6' }, ticks: { color: '#6B7280', font: { size: 10 } } },
            y: { grid: { color: '#F3F4F6' }, ticks: { color: '#6B7280', font: { size: 10 } } },
          },
        },
      };
    } else if (data.type === 'bar_grouped') {
      config = {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: data.datasets.map(d => ({
            label: d.label,
            data: d.values,
            backgroundColor: d.color,
            borderRadius: 4,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#374151', boxWidth: 12, padding: 12 } },
            title: { display: true, text: data.title, font: { size: 12 }, color: '#374151', padding: { bottom: 10 } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#374151', font: { size: 10 } } },
            y: { grid: { color: '#F3F4F6' }, ticks: { color: '#6B7280', font: { size: 10 } } },
          },
        },
      };
    }

    if (config) {
      chartRef.current = new window.Chart(ctx, config);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data]);

  if (!data) return null;

  return (
    <div style={{ marginTop: '14px', padding: '16px', background: '#F9FAFB', borderRadius: '10px', border: '1px solid #E5E7EB', width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100% !important', maxHeight: '280px' }} />
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
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
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function timeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages,     setMessages]     = useState([WELCOME]);
  const [history,      setHistory]      = useState([]);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [active,       setActive]       = useState(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Store real recent conversations: [{title, time, messages, history}]
  const [recentConvos, setRecentConvos] = useState([]);
  const [activeConvo,  setActiveConvo]  = useState(null);

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
   const res = await fetch('https://bta-intelligence.onrender.com chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || 'No response received.';
      const aiMsg = { role: 'assistant', content: reply, chart_data: data.chart_data || null };
      const updatedMessages = [...messages, userMsg, aiMsg];
      setMessages(prev => [...prev, aiMsg]);

      const updatedHistory = [...newHistory, { role: 'assistant', content: reply }];
      setHistory(updatedHistory);

      // Save to recent conversations
      const title = msg.length > 40 ? msg.slice(0, 40) + '…' : msg;
      const convoEntry = { id: Date.now(), title, time: new Date(), messages: updatedMessages, history: updatedHistory };
      setRecentConvos(prev => [convoEntry, ...prev.filter(c => c.id !== activeConvo)].slice(0, 10));
      setActiveConvo(convoEntry.id);

    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please check the backend is running.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startNewChat = () => {
    setMessages([WELCOME]);
    setHistory([]);
    setActive(null);
    setActiveConvo(null);
    setSidebarOpen(false);
  };

  const loadConvo = (convo) => {
    setMessages(convo.messages);
    setHistory(convo.history);
    setActiveConvo(convo.id);
    setSidebarOpen(false);
  };

  const handleCapability = (cap) => {
    setActive(cap.id);
    setSidebarOpen(false);
    sendMessage(cap.prompt);
  };

  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="logo-grid">
              {[...Array(9)].map((_, i) => <div key={i} className="logo-dot" />)}
            </div>
            {!sidebarCollapsed && <div className="sidebar-name">BTA Intelligence</div>}
            <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><Icon.Close /></button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="new-convo-btn" onClick={startNewChat}>
              <span className="new-convo-plus">+</span> New conversation
            </div>

            <div className="sidebar-nav-wrapper">
              {/* Real recent conversations */}
              {recentConvos.length > 0 && (
                <>
                  <div className="sidebar-section-label">Recent conversations</div>
                  {recentConvos.map(convo => (
                    <div
                      key={convo.id}
                      className={`convo-item${activeConvo === convo.id ? ' active' : ''}`}
                      onClick={() => loadConvo(convo)}
                    >
                      <div className={`convo-date${activeConvo === convo.id ? '' : ' muted'}`}>
                        <Icon.Calendar /> {timeAgo(convo.time)}
                      </div>
                      <div className="convo-title">{convo.title}</div>
                    </div>
                  ))}
                </>
              )}

              <div className="sidebar-section-label" style={{ marginTop: recentConvos.length > 0 ? '16px' : '0' }}>Capabilities</div>
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
          </>
        )}

        {/* Collapse button */}
        <div className="sidebar-footer">
          <button className="collapse-btn" onClick={() => setSidebarCollapsed(prev => !prev)}>
            {sidebarCollapsed ? <Icon.ChevronRight /> : <Icon.ChevronLeft />}
            {!sidebarCollapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* ── Chat ── */}
      <main className="chat">
        <div className="mobile-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}><Icon.Menu /></button>
          <span className="mobile-title">BTA Intelligence</span>
        </div>

        <div className="chat-header">
          <div className="header-title">BTA Intelligence</div>
          <div className="header-status">
            <div className="status-dot" />
            Connected to live database
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="avatar"><RobotAvatar size={36} /></div>
              )}
              <div className="bubble">
                <div className="bubble-text">{renderMarkdown(msg.content)}</div>
                {msg.chart_data && <ChartBlock data={msg.chart_data} />}
                {msg.isWelcome && (
                  <div className="chips">
                    {SUGGESTIONS.map((s, idx) => (
                      <button key={idx} className="chip" onClick={() => sendMessage(s.text)} disabled={loading}>
                        <span className="chip-icon-wrap"><s.icon /></span>
                        {s.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="msg-row assistant">
              <div className="avatar"><RobotAvatar size={36} /></div>
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
              placeholder="Ask a custom question..."
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
