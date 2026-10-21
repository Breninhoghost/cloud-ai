import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import Message from './Message.jsx';
import Composer from './Composer.jsx';
import { greeting } from '../util.js';

const SUGGESTIONS = [
  { title: 'Explicar código', prompt: 'Explique de forma simples como funciona um closure em JavaScript, com um exemplo.' },
  { title: 'Resumir um texto', prompt: 'Resuma em 5 tópicos objetivos o seguinte texto:\n\n' },
  { title: 'Traduzir', prompt: 'Traduza para o inglês, mantendo o tom profissional:\n\n' },
  { title: 'Resolver um problema', prompt: 'Resolva passo a passo: 3x² − 12x + 9 = 0' },
];

function ModelSelect({ models, value, onChange, disabled }) {
  if (!models.length) return null;
  return (
    <label className="model-select">
      <span className="sr-only">Modelo de IA</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.providerLabel} · {m.model}
          </option>
        ))}
      </select>
      <Icon name="chevron" size={14} />
    </label>
  );
}

export default function ChatView({
  user, title, messages, loading, streaming, error, onDismissError, configured, models, modelId, onModelChange,
  onSend, onStop, onRegenerate, onRate, onOpenSidebar, resolvedTheme, onToggleTheme, restore,
}) {
  const scroller = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  useEffect(() => {
    stick.current = true;
  }, [title]);

  const onScroll = () => {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const model = models.find((m) => m.id === modelId);
  const empty = !loading && messages.length === 0;
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user';

  return (
    <section className="main">
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" onClick={onOpenSidebar} aria-label="Abrir menu">
          <Icon name="menu" />
        </button>
        <h2 className="topbar-title">{title || 'Nova conversa'}</h2>
        <ModelSelect models={models} value={modelId} onChange={onModelChange} disabled={streaming} />
        <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={resolvedTheme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'} title="Alternar tema">
          <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </header>

      <div className="scroll" ref={scroller} onScroll={onScroll}>
        <div className="thread">
          {!configured && (
            <div className="banner warn" role="alert">
              <Icon name="alert" size={18} />
              <div>
                <strong>Nenhum provedor de IA configurado.</strong> Defina ao menos uma chave de API no arquivo <code>.env</code> do servidor e reinicie. Veja o README.
              </div>
            </div>
          )}

          {loading && (
            <div className="loading-thread" aria-busy="true">
              <i /> <i /> <i />
            </div>
          )}

          {empty && (
            <div className="hero">
              <Logo size={56} />
              <h1>{greeting(user.name)}</h1>
              <p>Como posso ajudar hoje?</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.title} type="button" disabled={!configured || streaming} onClick={() => onSend({ content: s.prompt, attachments: [] })}>
                    <strong>{s.title}</strong>
                    <span>{s.prompt.trim().slice(0, 70)}{s.prompt.length > 70 ? '…' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={m.id} message={m} isLast={i === messages.length - 1} busy={streaming} onRegenerate={onRegenerate} onRate={onRate} />
          ))}

          {error && (
            <div className="banner error" role="alert">
              <Icon name="alert" size={18} />
              <div>{error}</div>
              {lastIsUser && !streaming && (
                <button type="button" className="secondary sm" onClick={onRegenerate}>
                  Tentar novamente
                </button>
              )}
              <button type="button" className="icon-btn sm" onClick={onDismissError} aria-label="Dispensar aviso">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <Composer
        streaming={streaming}
        onSend={onSend}
        onStop={onStop}
        sendWithEnter={user.prefs?.sendWithEnter !== false}
        supportsImages={!!model?.vision}
        restore={restore}
        disabledReason={configured ? '' : 'Configure um provedor de IA no servidor para enviar mensagens.'}
      />
    </section>
  );
}
