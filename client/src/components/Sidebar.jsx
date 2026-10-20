import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

function ChatItem({ chat, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const t = title.trim();
    setEditing(false);
    if (t && t !== chat.title) onRename(chat.id, t);
    else setTitle(chat.title);
  };

  if (editing) {
    return (
      <li className="chat-item editing">
        <input
          ref={inputRef}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setTitle(chat.title);
              setEditing(false);
            }
          }}
          aria-label="Novo título da conversa"
        />
      </li>
    );
  }

  if (confirming) {
    return (
      <li className="chat-item confirm">
        <span>Excluir?</span>
        <button type="button" className="danger" onClick={() => onDelete(chat.id)}>
          Excluir
        </button>
        <button type="button" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
      </li>
    );
  }

  return (
    <li className={`chat-item ${active ? 'active' : ''}`}>
      <button type="button" className="chat-title" onClick={() => onSelect(chat.id)} title={chat.title}>
        {chat.title}
      </button>
      <span className="chat-actions">
        <button
          type="button"
          className="icon-btn sm"
          onClick={() => {
            setTitle(chat.title);
            setEditing(true);
          }}
          aria-label={`Renomear ${chat.title}`}
          title="Renomear"
        >
          <Icon name="edit" size={14} />
        </button>
        <button type="button" className="icon-btn sm" onClick={() => setConfirming(true)} aria-label={`Excluir ${chat.title}`} title="Excluir">
          <Icon name="trash" size={14} />
        </button>
      </span>
    </li>
  );
}

export default function Sidebar({ open, chats, activeId, search, onSearch, loading, onNew, onSelect, onRename, onDelete, onClose, user, onOpenSettings }) {
  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Histórico de conversas">
        <div className="side-head">
          <div className="brand">
            <Logo size={28} />
            <span>Cloud AI</span>
          </div>
          <button type="button" className="icon-btn side-close" onClick={onClose} aria-label="Fechar menu">
            <Icon name="x" />
          </button>
        </div>

        <button type="button" className="new-chat" onClick={onNew}>
          <Icon name="plus" size={18} /> Nova conversa
        </button>

        <div className="search">
          <Icon name="search" size={16} />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Pesquisar conversas" aria-label="Pesquisar conversas" maxLength={100} />
          {search && (
            <button type="button" className="icon-btn sm" onClick={() => onSearch('')} aria-label="Limpar pesquisa">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        <nav className="chat-list">
          {loading ? (
            <div className="skeletons" aria-hidden="true">
              <i /> <i /> <i /> <i />
            </div>
          ) : chats.length === 0 ? (
            <p className="empty-list">{search ? 'Nenhuma conversa encontrada.' : 'Suas conversas aparecerão aqui.'}</p>
          ) : (
            <ul>
              {chats.map((c) => (
                <ChatItem key={c.id} chat={c} active={c.id === activeId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
              ))}
            </ul>
          )}
        </nav>

        <button type="button" className="profile" onClick={onOpenSettings} aria-label="Abrir configurações e perfil">
          <span className="avatar">{(user.name || '?').trim().charAt(0).toUpperCase()}</span>
          <span className="profile-text">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
          <Icon name="settings" size={18} />
        </button>
      </aside>
    </>
  );
}
