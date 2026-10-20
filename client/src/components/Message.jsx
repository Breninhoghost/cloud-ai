import { useState } from 'react';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { copyText } from '../util.js';

function Attachments({ items }) {
  if (!items?.length) return null;
  return (
    <div className="msg-attachments">
      {items.map((a, i) =>
        a.kind === 'image' ? (
          <img key={i} src={a.data} alt={a.name} className="msg-thumb" />
        ) : (
          <span key={i} className="chip">
            <Icon name="file" size={14} /> {a.name}
          </span>
        )
      )}
    </div>
  );
}

export default function Message({ message, isLast, busy, onRegenerate, onRate }) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="bubble">
          <Attachments items={message.attachments} />
          {message.content && <p>{message.content}</p>}
        </div>
      </div>
    );
  }

  const streaming = !!message.streaming;
  const copy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="msg msg-ai">
      <div className="ai-body">
        {streaming && !message.content ? (
          <div className="typing" role="status" aria-label="A IA está respondendo">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className={streaming ? 'streaming' : ''}>
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {message.incomplete && !streaming && <p className="note">Resposta interrompida.</p>}

        {!streaming && message.content && (
          <div className="actions">
            <button type="button" className="icon-btn" onClick={copy} aria-label="Copiar resposta" title="Copiar">
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
            <button
              type="button"
              className={`icon-btn ${message.rating === 1 ? 'on' : ''}`}
              onClick={() => onRate(message, 1)}
              aria-label="Boa resposta"
              aria-pressed={message.rating === 1}
              title="Boa resposta"
            >
              <Icon name="thumb" size={16} />
            </button>
            <button
              type="button"
              className={`icon-btn ${message.rating === -1 ? 'on bad' : ''}`}
              onClick={() => onRate(message, -1)}
              aria-label="Resposta ruim"
              aria-pressed={message.rating === -1}
              title="Resposta ruim"
            >
              <Icon name="thumb" size={16} className="flip" />
            </button>
            {isLast && (
              <button type="button" className="icon-btn" onClick={onRegenerate} disabled={busy} aria-label="Gerar novamente" title="Gerar novamente">
                <Icon name="refresh" size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
