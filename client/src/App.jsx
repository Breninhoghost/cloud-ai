import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setUnauthorizedHandler, streamMessage } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Logo from './components/Logo.jsx';
import LandingScreen from './components/LandingScreen.jsx';

const THEME_KEY = 'cloudai.theme'; // apenas a preferência visual; nenhum dado sensível fica no navegador

function useAppearance(prefs) {
  const theme = prefs?.theme || 'system';
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (!prefs) return; // antes do login mantém o tema aplicado em main.jsx
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.font = prefs?.fontSize || 'md';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* armazenamento indisponível */
    }
  }, [resolved, theme, prefs]);

  return resolved;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = verificando sessão, null = deslogado
  const [authMode, setAuthMode] = useState(null);
  const resolvedTheme = useAppearance(user?.prefs);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="boot" aria-busy="true">
        <Logo size={48} />
      </div>
    );
  }
  if (user === null) {
    if (!authMode) {
      return <LandingScreen onLogin={() => setAuthMode('login')} onRegister={() => setAuthMode('register')} />;
    }
    return <AuthScreen initialMode={authMode} onAuthed={setUser} onBack={() => setAuthMode(null)} />;
  }
  return <Workspace user={user} setUser={setUser} resolvedTheme={resolvedTheme} />;
}

function Workspace({ user, setUser, resolvedTheme }) {
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [modelInfo, setModelInfo] = useState({ configured: true, models: [], defaultModel: null });
  const [modelId, setModelId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const abortRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = activeId;
  const modelRef = useRef(null);
  modelRef.current = modelId;

  // ---- carga inicial ----
  useEffect(() => {
    api
      .models()
      .then((info) => {
        setModelInfo(info);
        setModelId(info.defaultModel);
      })
      .catch((e) => setError(e.message));
  }, [user.prefs?.defaultModel]);

  const loadChats = useCallback(async (q) => {
    try {
      const { chats: list } = await api.listChats(q);
      setChats(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadChats(search.trim()), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, loadChats]);

  // ---- ações de conversa ----
  const stop = useCallback(() => abortRef.current?.abort(), []);

  const selectChat = useCallback(
    async (id) => {
      stop();
      setSidebarOpen(false);
      setError('');
      setActiveId(id);
      setMessages([]);
      setThreadLoading(true);
      try {
        const data = await api.getChat(id);
        if (activeRef.current !== id) return;
        setMessages(data.messages);
        if (data.chat.model && modelInfo.models.some((m) => m.id === data.chat.model)) setModelId(data.chat.model);
      } catch (e) {
        if (activeRef.current === id) setError(e.message);
      } finally {
        if (activeRef.current === id) setThreadLoading(false);
      }
    },
    [stop, modelInfo.models]
  );

  const newChat = useCallback(() => {
    stop();
    setActiveId(null);
    setMessages([]);
    setError('');
    setSidebarOpen(false);
  }, [stop]);

  const renameChat = async (id, title) => {
    try {
      const { chat } = await api.renameChat(id, title);
      setChats((list) => list.map((c) => (c.id === id ? chat : c)));
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteChat = async (id) => {
    try {
      await api.deleteChat(id);
      setChats((list) => list.filter((c) => c.id !== id));
      if (activeRef.current === id) newChat();
    } catch (e) {
      setError(e.message);
    }
  };

  // ---- envio / regeneração com streaming ----
  const run = useCallback(
    async ({ content = '', attachments = [], regenerate = false }) => {
      if (streaming) return;
      setError('');
      setRestore(null);

      let chatId = activeRef.current;
      if (!chatId) {
        try {
          const { chat } = await api.createChat({ model: modelRef.current || undefined });
          chatId = chat.id;
          setActiveId(chatId);
          activeRef.current = chatId;
          setChats((list) => [chat, ...list]);
        } catch (e) {
          setError(e.message);
          if (!regenerate) setRestore({ content, attachments, n: Date.now() });
          return;
        }
      }

      const tmpAssistant = { id: 'tmp-a', role: 'assistant', content: '', streaming: true };
      setMessages((prev) => {
        if (regenerate) return [...(prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev), tmpAssistant];
        return [...prev, { id: 'tmp-u', role: 'user', content, attachments }, tmpAssistant];
      });

      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);

      try {
        await streamMessage(
          chatId,
          { content, attachments, model: modelRef.current || undefined, regenerate },
          {
            signal: ac.signal,
            onMeta: ({ chat, userMessage }) => {
              setChats((list) => [chat, ...list.filter((c) => c.id !== chat.id)]);
              setMessages((prev) => prev.map((m) => (m.id === 'tmp-u' ? userMessage : m)));
            },
            onDelta: ({ text }) => setMessages((prev) => prev.map((m) => (m.id === 'tmp-a' ? { ...m, content: m.content + text } : m))),
            onError: ({ message }) => setError(message),
          }
        );
      } catch (e) {
        if (e.name !== 'AbortError') {
          setError(e.message || 'Falha na conexão com o servidor.');
          if (!regenerate && e.name === 'ApiError') setRestore({ content, attachments, n: Date.now() });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        try {
          const data = await api.getChat(chatId); // sincroniza ids/ordem reais com o servidor
          if (activeRef.current === chatId) setMessages(data.messages);
        } catch {
          setMessages((prev) => prev.filter((m) => m.id !== 'tmp-a' || m.content));
        }
      }
    },
    [streaming]
  );

  const regenerate = useCallback(() => run({ regenerate: true }), [run]);

  const rate = async (message, value) => {
    const next = message.rating === value ? 0 : value;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, rating: next } : m)));
    try {
      await api.rate(activeRef.current, message.id, next);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, rating: message.rating } : m)));
      setError(e.message);
    }
  };

  // ---- configurações ----
  const saveSettings = async (patch) => {
    const { user: updated } = await api.updateMe(patch);
    setUser(updated);
  };

  const toggleTheme = () => saveSettings({ prefs: { theme: resolvedTheme === 'dark' ? 'light' : 'dark' } }).catch((e) => setError(e.message));

  const logout = async () => {
    stop();
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  const deleteAll = async () => {
    await api.deleteAllChats();
    setChats([]);
    newChat();
  };

  const activeChat = chats.find((c) => c.id === activeId);

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        chats={chats}
        activeId={activeId}
        search={search}
        onSearch={setSearch}
        loading={chatsLoading}
        onNew={newChat}
        onSelect={selectChat}
        onRename={renameChat}
        onDelete={deleteChat}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <ChatView
        user={user}
        title={activeChat?.title}
        messages={messages}
        loading={threadLoading}
        streaming={streaming}
        error={error}
        onDismissError={() => setError('')}
        configured={modelInfo.configured}
        models={modelInfo.models}
        modelId={modelId}
        onModelChange={setModelId}
        onSend={run}
        onStop={stop}
        onRegenerate={regenerate}
        onRate={rate}
        onOpenSidebar={() => setSidebarOpen(true)}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        restore={restore}
      />
      {settingsOpen && (
        <SettingsModal
          user={user}
          models={modelInfo.models}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          onLogout={logout}
          onDeleteAllChats={deleteAll}
        />
      )}
    </div>
  );
}
