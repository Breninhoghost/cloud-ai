import { useState } from 'react';
import { api } from '../api.js';
import Logo from './Logo.jsx';

export default function AuthScreen({ initialMode = 'login', onAuthed, onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } =
        mode === 'login'
          ? await api.login({ email: form.email, password: form.password })
          : await api.register({ name: form.name, email: form.email, password: form.password });
      onAuthed(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack}>
            <span aria-hidden="true">←</span> Início
          </button>
        )}
        <div className="auth-logo">
          <Logo size={52} />
          <h1>Cloud AI</h1>
          <p>{mode === 'login' ? 'Entre para continuar suas conversas.' : 'Crie sua conta para começar.'}</p>
        </div>

        <form onSubmit={submit} noValidate>
          {mode === 'register' && (
            <label>
              Nome
              <input value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} required />
            </label>
          )}
          <label>
            E-mail
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={254} required />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              maxLength={128}
              required
            />
            {mode === 'register' && <small>Mínimo de 8 caracteres.</small>}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="switch">
          {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
          </button>
        </p>
      </div>
    </main>
  );
}
