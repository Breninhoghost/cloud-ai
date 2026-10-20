import http from 'node:http';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

/** Servidor HTTP local que imita a API de chat da OpenAI (/chat/completions) e a da Anthropic (/messages). */
export async function startFakeProvider() {
  const state = { calls: [], mode: {} };

  const openaiFrames = (words) => [
    `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`,
    ...words.map((w) => `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`),
    'data: [DONE]\n\n',
  ];
  const anthropicFrames = (words) => [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start' })}\n\n`,
    ...words.map((w) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: w } })}\n\n`),
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      state.calls.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : {} });
      if (state.mode.status) {
        res.writeHead(state.mode.status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'upstream says no' } }));
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const words = state.mode.words || ['Olá', ', ', 'mundo', '!'];
      const frames = req.url.endsWith('/messages') ? anthropicFrames(words) : openaiFrames(words);
      const delay = state.mode.delay || 0;
      let i = 0;
      let timer;
      const tick = () => {
        if (res.destroyed || res.writableEnded) return;
        if (i >= frames.length) return res.end();
        res.write(frames[i++]);
        timer = delay ? setTimeout(tick, delay) : setImmediate(tick);
      };
      res.on('close', () => clearTimeout(timer));
      tick();
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    state,
    reset() {
      state.calls.length = 0;
      state.mode = {};
    },
    close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(r))),
  };
}

export async function startApp({ env = {}, providers = [] } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 's'.repeat(48),
    DATABASE_PATH: ':memory:',
    BCRYPT_ROUNDS: '4',
    RATE_LIMIT_AUTH: '1000',
    RATE_LIMIT_CHAT: '1000',
    RATE_LIMIT_API: '100000',
    ...env,
  });
  config.providers = providers;
  const { app, db } = createApp(config);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    db,
    client: () => makeClient(base),
    close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => (db.close(), r())))),
  };
}

/** Cliente HTTP de teste com "cookie jar" simples. */
export function makeClient(base) {
  let cookie = '';

  async function raw(method, path, body, { headers = {}, signal } = {}) {
    const res = await fetch(base + path, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'cloud-ai',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    for (const sc of res.headers.getSetCookie?.() || []) {
      const pair = sc.split(';')[0];
      if (pair.startsWith('cloudai_session=')) cookie = pair.endsWith('=') ? '' : pair;
    }
    return res;
  }

  async function call(method, path, body, opts) {
    const res = await raw(method, path, body, opts);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* sem JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  return {
    raw,
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b ?? {}, o),
    patch: (p, b, o) => call('PATCH', p, b, o),
    del: (p, o) => call('DELETE', p, undefined, o),
    get cookie() {
      return cookie;
    },
    async register(email, name = 'Teste', password = 'senha-forte-123') {
      return call('POST', '/api/auth/register', { email, name, password });
    },
    /** Envia mensagem e devolve os eventos SSE já interpretados. */
    async send(chatId, body) {
      const res = await raw('POST', `/api/chats/${chatId}/messages`, body);
      if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
        return { status: res.status, json: await res.json(), events: [] };
      }
      return { status: res.status, events: parseSSE(await res.text()) };
    },
  };
}

export function parseSSE(text) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const ev = { event: 'message', data: '' };
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) ev.event = line.slice(7);
        else if (line.startsWith('data: ')) ev.data += line.slice(6);
      }
      return { event: ev.event, data: JSON.parse(ev.data) };
    });
}

export const waitFor = async (fn, { timeout = 3000, step = 25 } = {}) => {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, step));
  }
};
