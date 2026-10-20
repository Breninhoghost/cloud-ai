import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function SettingsModal({ user, models, onClose, onSave, onLogout, onDeleteAllChats }) {
  const prefs = user.prefs || {};
  const [name, setName] = useState(user.name);
  const [theme, setTheme] = useState(prefs.theme || 'system');
  const [fontSize, setFontSize] = useState(prefs.fontSize || 'md');
  const [defaultModel, setDefaultModel] = useState(prefs.defaultModel || '');
  const [systemPrompt, setSystemPrompt] = useState(prefs.systemPrompt || '');
  const [learningEnabled, setLearningEnabled] = useState(prefs.learningEnabled !== false);
  const [sendWithEnter, setSendWithEnter] = useState(prefs.sendWithEnter !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ name: name.trim() || user.name, prefs: { theme, fontSize, defaultModel, systemPrompt, sendWithEnter, learningEnabled } });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <h2 id="settings-title">Configurações</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </header>

        <div className="modal-body">
          <section>
            <h3>Perfil</h3>
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </label>
            <label>
              E-mail
              <input value={user.email} disabled />
            </label>
          </section>

          <section>
            <h3>Aparência</h3>
            <div className="field">
              <span>Tema</span>
              <Segmented label="Tema" value={theme} onChange={setTheme} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']]} />
            </div>
            <div className="field">
              <span>Tamanho do texto</span>
              <Segmented label="Tamanho do texto" value={fontSize} onChange={setFontSize} options={[['sm', 'Pequeno'], ['md', 'Médio'], ['lg', 'Grande']]} />
            </div>
          </section>

          <section>
            <h3>Aprendizado</h3>
            <label className="check">
              <input type="checkbox" checked={learningEnabled} onChange={(e) => setLearningEnabled(e.target.checked)} />
              <span>Aprender automaticamente com meu feedback e minhas correções</span>
            </label>
            <small>
              Em outras conversas desta conta, a IA usa respostas que você avaliou positivamente e autocorreções explícitas nas suas
              mensagens. A memória é enviada apenas ao provedor escolhido e não altera o modelo.
            </small>
          </section>

          <section>
            <h3>Conversa</h3>
            <label>
              Modelo padrão
              <select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} disabled={!models.length}>
                <option value="">{models.length ? 'Padrão do servidor' : 'Nenhum modelo configurado'}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.providerLabel} · {m.model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Instruções personalizadas
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Ex.: Responda de forma objetiva e explique código passo a passo."
              />
              <small>{systemPrompt.length}/2000 · Enviadas à IA em todas as suas conversas.</small>
            </label>
            <label className="check">
              <input type="checkbox" checked={sendWithEnter} onChange={(e) => setSendWithEnter(e.target.checked)} />
              <span>Enviar mensagem com Enter (Shift+Enter quebra a linha)</span>
            </label>
          </section>

          <section>
            <h3>Dados e conta</h3>
            {confirmDelete ? (
              <div className="confirm-row">
                <span>Excluir todas as suas conversas? Isso não pode ser desfeito.</span>
                <button type="button" className="danger-btn" onClick={async () => { await onDeleteAllChats(); setConfirmDelete(false); }}>
                  Sim, excluir tudo
                </button>
                <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="btn-row">
                <button type="button" className="secondary" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={16} /> Excluir todas as conversas
                </button>
                <button type="button" className="secondary" onClick={onLogout}>
                  <Icon name="logout" size={16} /> Sair da conta
                </button>
              </div>
            )}
          </section>
        </div>

        <footer>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </form>
    </div>
  );
}
