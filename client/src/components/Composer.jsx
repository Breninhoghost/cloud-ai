import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { fileToAttachment, MAX_ATTACHMENTS } from '../util.js';

export default function Composer({ streaming, onSend, onStop, sendWithEnter, supportsImages, restore, disabledReason }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [problem, setProblem] = useState('');
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Restaura o rascunho quando o envio falha antes de a mensagem ser salva.
  useEffect(() => {
    if (restore) {
      setText(restore.content);
      setAttachments(restore.attachments);
    }
  }, [restore]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [text]);

  const hasImage = attachments.some((a) => a.kind === 'image');
  const imageBlocked = hasImage && !supportsImages;
  const canSend = !streaming && !disabledReason && (text.trim() || attachments.length) && !imageBlocked;

  const submit = () => {
    if (!canSend) return;
    onSend({ content: text.trim(), attachments });
    setText('');
    setAttachments([]);
    setProblem('');
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const wantsSend = sendWithEnter ? !e.shiftKey : e.ctrlKey || e.metaKey;
    if (wantsSend) {
      e.preventDefault();
      submit();
    }
  };

  const onFiles = async (fileList) => {
    setProblem('');
    const files = [...fileList];
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setProblem(`No máximo ${MAX_ATTACHMENTS} anexos por mensagem.`);
      return;
    }
    const added = [];
    for (const f of files) {
      try {
        added.push(await fileToAttachment(f));
      } catch (e) {
        setProblem(e.message);
      }
    }
    if (added.length) setAttachments((prev) => [...prev, ...added]);
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {attachments.length > 0 && (
          <div className="attach-row">
            {attachments.map((a, i) => (
              <span key={i} className="attach">
                {a.kind === 'image' ? <img src={a.data} alt="" /> : <Icon name="file" size={14} />}
                <span className="attach-name">{a.name}</span>
                <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} aria-label={`Remover ${a.name}`}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-row">
          <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo" title="Anexar imagem ou arquivo de texto" disabled={streaming}>
            <Icon name="clip" />
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,text/*,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.sh,.sql,.yml,.yaml,.xml,.html,.css,.log,.toml"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pergunte qualquer coisa ao Cloud AI…"
            rows={1}
            maxLength={32000}
            aria-label="Mensagem"
          />
          {streaming ? (
            <button type="button" className="send stop" onClick={onStop} aria-label="Parar resposta" title="Parar resposta">
              <Icon name="stop" size={18} />
            </button>
          ) : (
            <button type="button" className="send" onClick={submit} disabled={!canSend} aria-label="Enviar mensagem" title="Enviar">
              <Icon name="send" size={18} />
            </button>
          )}
        </div>
      </div>
      {(problem || imageBlocked || disabledReason) && (
        <p className="composer-warn" role="alert">
          <Icon name="alert" size={14} />
          {disabledReason || problem || 'O modelo selecionado não aceita imagens. Remova a imagem ou escolha outro modelo.'}
        </p>
      )}
      <p className="composer-hint">{sendWithEnter ? 'Enter envia · Shift+Enter quebra a linha' : 'Ctrl+Enter envia · Enter quebra a linha'}. A IA pode cometer erros; confira informações importantes.</p>
    </div>
  );
}
