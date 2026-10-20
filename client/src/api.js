const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'cloud-ai' };

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: HEADERS,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(data?.error || `Erro inesperado (${res.status}).`, res.status);
  }
  return data;
}

export const api = {
  me: () => request('GET', '/auth/me'),
  login: (b) => request('POST', '/auth/login', b),
  register: (b) => request('POST', '/auth/register', b),
  logout: () => request('POST', '/auth/logout', {}),
  updateMe: (b) => request('PATCH', '/auth/me', b),
  models: () => request('GET', '/models'),
  listChats: (q) => request('GET', `/chats${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createChat: (b = {}) => request('POST', '/chats', b),
  getChat: (id) => request('GET', `/chats/${id}`),
  renameChat: (id, title) => request('PATCH', `/chats/${id}`, { title }),
  deleteChat: (id) => request('DELETE', `/chats/${id}`),
  deleteAllChats: () => request('DELETE', '/chats'),
  rate: (chatId, messageId, rating) => request('PATCH', `/chats/${chatId}/messages/${messageId}/rating`, { rating }),
};

/**
 * Envia uma mensagem e consome a resposta em streaming (SSE via fetch).
 * Lança ApiError se o servidor recusar antes de iniciar o stream (ex.: validação, 503).
 */
export async function streamMessage(chatId, payload, { signal, onMeta, onDelta, onDone, onError }) {
  let res;
  try {
    res = await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 0);
  }

  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = await res.json().catch(() => null);
    if (res.status === 401) onUnauthorized();
    throw new ApiError(data?.error || `Erro inesperado (${res.status}).`, res.status);
  }

  const handlers = { meta: onMeta, delta: onDelta, done: onDone, error: onError };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const dispatch = (block) => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    if (!data) return;
    try {
      handlers[event]?.(JSON.parse(data));
    } catch (e) {
      if (e instanceof SyntaxError) return;
      throw e;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      dispatch(buf.slice(0, i));
      buf = buf.slice(i + 2);
    }
  }
  if (buf.trim()) dispatch(buf);
}
