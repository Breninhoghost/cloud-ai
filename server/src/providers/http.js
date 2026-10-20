import { ProviderError, messageForStatus } from './errors.js';

/**
 * Faz o fetch ao provedor com timeout apenas para a *conexão* (até receber os cabeçalhos),
 * propaga o cancelamento do cliente e converte falhas em ProviderError.
 * Retorna { res, dispose }. Chame dispose() quando terminar de ler o corpo.
 */
export async function upstreamFetch(url, init, { signal, timeoutMs, label }) {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort(signal.reason);
  if (signal.aborted) ctrl.abort(signal.reason);
  else signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  const dispose = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  };

  let res;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    dispose();
    if (signal.aborted) throw err; // cancelado pelo usuário
    if (timedOut) throw new ProviderError(`${label} demorou demais para responder. Tente novamente.`, 504);
    throw new ProviderError(`Não foi possível conectar a ${label}. Verifique a conexão e a URL configurada.`, 502);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = '';
    try {
      const text = (await res.text()).slice(0, 2000);
      const json = JSON.parse(text);
      const msg = json?.error?.message || json?.error || json?.message;
      if (typeof msg === 'string' && (res.status === 400 || res.status === 422)) detail = msg.slice(0, 200);
    } catch {
      /* corpo não é JSON — ignora */
    }
    dispose();
    throw new ProviderError(messageForStatus(res.status, label, detail), res.status === 401 || res.status === 403 ? 502 : res.status);
  }
  return { res, dispose };
}
