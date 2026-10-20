import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSSE, startApp, startFakeProvider, waitFor } from './helpers.js';

const API_KEY = 'sk-test-chave-super-secreta';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let fake;
let srv;

before(async () => {
  fake = await startFakeProvider();
  srv = await startApp({
    providers: [
      { id: 'fake', label: 'Fake', type: 'openai', baseUrl: fake.url, apiKey: API_KEY, models: ['m1', 'm2'], vision: true },
      { id: 'texto', label: 'SóTexto', type: 'openai', baseUrl: fake.url, apiKey: '', models: ['t1'], vision: false },
      { id: 'claude', label: 'Anthropic Fake', type: 'anthropic', baseUrl: fake.url, apiKey: 'ant-key', models: ['c1'], vision: true },
    ],
  });
});

after(async () => {
  await srv.close();
  await fake.close();
});

const newUser = async (name) => {
  const c = srv.client();
  const email = `${name}-${Math.random().toString(36).slice(2)}@exemplo.com`;
  const r = await c.register(email, name);
  assert.equal(r.status, 201);
  return c;
};

const newChat = async (c, model) => (await c.post('/api/chats', model ? { model } : {})).json.chat;

describe('autenticação e sessão', () => {
  it('cadastra, mantém sessão por cookie httpOnly e permite logout', async () => {
    const c = srv.client();
    const r = await c.register('ana@exemplo.com', 'Ana');
    assert.equal(r.status, 201);
    assert.equal(r.json.user.email, 'ana@exemplo.com');
    assert.equal(r.json.user.password_hash, undefined);
    const setCookie = r.headers.getSetCookie().join(';');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);

    assert.equal((await c.get('/api/auth/me')).json.user.name, 'Ana');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  it('faz login e rejeita senha errada com mensagem genérica', async () => {
    const c = srv.client();
    await c.register('bia@exemplo.com', 'Bia');
    const bad = srv.client();
    const r1 = await bad.post('/api/auth/login', { email: 'bia@exemplo.com', password: 'errada-errada' });
    const r2 = await bad.post('/api/auth/login', { email: 'ninguem@exemplo.com', password: 'qualquer-coisa' });
    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
    assert.equal(r1.json.error, r2.json.error);
    const ok = await bad.post('/api/auth/login', { email: 'BIA@exemplo.com', password: 'senha-forte-123' });
    assert.equal(ok.status, 200);
  });

  it('rejeita e-mail duplicado, senha curta e e-mail inválido', async () => {
    const c = srv.client();
    await c.register('dup@exemplo.com');
    assert.equal((await srv.client().register('dup@exemplo.com')).status, 409);
    assert.equal((await srv.client().register('x@exemplo.com', 'X', '123')).status, 400);
    assert.equal((await srv.client().register('nao-e-email')).status, 400);
  });

  it('exige login nas rotas protegidas e o cabeçalho anti-CSRF nas escritas', async () => {
    const anon = srv.client();
    assert.equal((await anon.get('/api/chats')).status, 401);
    assert.equal((await anon.get('/api/models')).status, 401);
    const res = await fetch(srv.base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'xxxxxxxx' }),
    });
    assert.equal(res.status, 403);
  });

  it('atualiza nome e preferências com validação', async () => {
    const c = await newUser('prefs');
    const ok = await c.patch('/api/auth/me', { name: 'Novo Nome', prefs: { theme: 'dark', fontSize: 'lg', sendWithEnter: false } });
    assert.equal(ok.json.user.name, 'Novo Nome');
    assert.equal(ok.json.user.prefs.theme, 'dark');
    assert.equal((await c.patch('/api/auth/me', { prefs: { theme: 'neon' } })).status, 400);
    assert.equal((await c.patch('/api/auth/me', { prefs: { learningEnabled: 'yes' } })).status, 400);
    assert.equal((await c.patch('/api/auth/me', { prefs: { hack: true } })).status, 400);
    assert.equal((await c.get('/api/auth/me')).json.user.prefs.fontSize, 'lg');
    assert.equal((await c.patch('/api/auth/me', { prefs: { learningEnabled: false } })).json.user.prefs.learningEnabled, false);
  });
});

describe('conversas', () => {
  it('cria, lista, renomeia e exclui', async () => {
    const c = await newUser('crud');
    const chat = await newChat(c);
    assert.equal(chat.title, 'Nova conversa');
    assert.equal((await c.get('/api/chats')).json.chats.length, 1);

    const ren = await c.patch(`/api/chats/${chat.id}`, { title: '  Meu título  ' });
    assert.equal(ren.json.chat.title, 'Meu título');
    assert.equal((await c.patch(`/api/chats/${chat.id}`, { title: '   ' })).status, 400);

    assert.equal((await c.del(`/api/chats/${chat.id}`)).status, 200);
    assert.equal((await c.get(`/api/chats/${chat.id}`)).status, 404);
    assert.equal((await c.get('/api/chats')).json.chats.length, 0);
  });

  it('exclui todas as conversas do usuário', async () => {
    const c = await newUser('todas');
    await newChat(c);
    await newChat(c);
    assert.equal((await c.del('/api/chats')).json.deleted, 2);
  });

  it('impede acesso a conversas de outras contas', async () => {
    const a = await newUser('alice');
    const b = await newUser('bob');
    const chat = await newChat(a);
    await a.send(chat.id, { content: 'segredo da alice', model: 'fake:m1' });
    const msgs = (await a.get(`/api/chats/${chat.id}`)).json.messages;

    assert.equal((await b.get(`/api/chats/${chat.id}`)).status, 404);
    assert.equal((await b.patch(`/api/chats/${chat.id}`, { title: 'invadida' })).status, 404);
    assert.equal((await b.del(`/api/chats/${chat.id}`)).status, 404);
    assert.equal((await b.send(chat.id, { content: 'oi' })).status, 404);
    assert.equal((await b.patch(`/api/chats/${chat.id}/messages/${msgs[1].id}/rating`, { rating: 1 })).status, 404);
    assert.equal((await b.get('/api/chats')).json.chats.length, 0);
    assert.equal((await b.get('/api/chats?q=segredo')).json.chats.length, 0);
    // a conversa continua intacta
    assert.equal((await a.get(`/api/chats/${chat.id}`)).json.chat.title.startsWith('segredo'), true);
  });

  it('pesquisa por título e por conteúdo das mensagens (sem tratar % e _ como curingas)', async () => {
    const c = await newUser('busca');
    const c1 = await newChat(c);
    const c2 = await newChat(c);
    await c.send(c1.id, { content: 'Explique recursão em Python', model: 'fake:m1' });
    await c.send(c2.id, { content: 'Receita de bolo', model: 'fake:m1' });
    assert.deepEqual((await c.get('/api/chats?q=recurs')).json.chats.map((x) => x.id), [c1.id]);
    assert.deepEqual((await c.get('/api/chats?q=bolo')).json.chats.map((x) => x.id), [c2.id]);
    assert.equal((await c.get('/api/chats?q=%25')).json.chats.length, 0);
    assert.equal((await c.get('/api/chats')).json.chats.length, 2);
  });
});

describe('modelos', () => {
  it('lista modelos sem expor chaves de API', async () => {
    const c = await newUser('modelos');
    const r = await c.get('/api/models');
    assert.equal(r.json.configured, true);
    assert.deepEqual(r.json.models.map((m) => m.id), ['fake:m1', 'fake:m2', 'texto:t1', 'claude:c1']);
    assert.equal(r.json.defaultModel, 'fake:m1');
    assert.ok(!r.text.includes(API_KEY));
    assert.ok(!r.text.includes('ant-key'));
    assert.ok(!r.text.includes('apiKey'));
  });
});

describe('streaming de respostas', () => {
  it('transmite a resposta, salva o histórico e dá título à conversa', async () => {
    fake.reset();
    const c = await newUser('stream');
    const chat = await newChat(c);
    const r = await c.send(chat.id, { content: 'Olá, tudo bem?', model: 'fake:m2' });

    assert.equal(r.status, 200);
    const kinds = r.events.map((e) => e.event);
    assert.equal(kinds[0], 'meta');
    assert.equal(kinds.at(-1), 'done');
    const text = r.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    assert.equal(text, 'Olá, mundo!');
    assert.equal(r.events[0].data.chat.title, 'Olá, tudo bem?');

    const saved = (await c.get(`/api/chats/${chat.id}`)).json;
    assert.deepEqual(saved.messages.map((m) => [m.role, m.content]), [
      ['user', 'Olá, tudo bem?'],
      ['assistant', 'Olá, mundo!'],
    ]);
    assert.equal(saved.chat.model, 'fake:m2');

    // O backend chamou o provedor com a chave, o modelo e o prompt de sistema corretos.
    const call = fake.state.calls.at(-1);
    assert.equal(call.url, '/chat/completions');
    assert.equal(call.headers.authorization, `Bearer ${API_KEY}`);
    assert.equal(call.body.model, 'm2');
    assert.equal(call.body.stream, true);
    assert.equal(call.body.messages[0].role, 'system');
    assert.deepEqual(call.body.messages.at(-1), { role: 'user', content: 'Olá, tudo bem?' });
    assert.ok(!r.events.some((e) => JSON.stringify(e).includes(API_KEY)));
  });

  it('envia instruções personalizadas do usuário no prompt de sistema', async () => {
    fake.reset();
    const c = await newUser('instrucoes');
    await c.patch('/api/auth/me', { prefs: { systemPrompt: 'Responda sempre como um pirata.' } });
    const chat = await newChat(c);
    await c.send(chat.id, { content: 'oi', model: 'fake:m1' });
    assert.match(fake.state.calls.at(-1).body.messages[0].content, /pirata/);
  });

  it('aprende entre conversas a partir de respostas bem avaliadas, isolado por conta', async () => {
    fake.reset();
    fake.state.mode = { words: ['Explicação útil'] };
    const c = await newUser('aprendizado');
    const firstChat = await newChat(c);
    await c.send(firstChat.id, { content: 'Explique closures em JavaScript', model: 'fake:m1' });
    const answer = (await c.get(`/api/chats/${firstChat.id}`)).json.messages[1];
    await c.patch(`/api/chats/${firstChat.id}/messages/${answer.id}/rating`, { rating: 1 });

    const nextChat = await newChat(c);
    await c.send(nextChat.id, { content: 'Explique closures novamente', model: 'fake:m1' });
    const system = fake.state.calls.at(-1).body.messages[0].content;
    assert.match(system, /Resposta bem avaliada pelo usuário/);
    assert.match(system, /Explique closures em JavaScript/);
    assert.match(system, /Explicação útil/);

    const other = await newUser('sem-memoria-alheia');
    const otherChat = await newChat(other);
    await other.send(otherChat.id, { content: 'Explique closures', model: 'fake:m1' });
    assert.doesNotMatch(fake.state.calls.at(-1).body.messages[0].content, /Memória de aprendizado/);
  });

  it('aprende correções explícitas do usuário e permite desativar o aprendizado', async () => {
    fake.reset();
    fake.state.mode = { words: ['A resposta é 5.'] };
    const c = await newUser('correcao');
    const firstChat = await newChat(c);
    await c.send(firstChat.id, { content: 'Quanto é 2 + 2?', model: 'fake:m1' });
    const rejected = (await c.get(`/api/chats/${firstChat.id}`)).json.messages[1];
    await c.patch(`/api/chats/${firstChat.id}/messages/${rejected.id}/rating`, { rating: -1 });

    fake.state.mode = { words: ['Obrigado pela correção.'] };
    await c.send(firstChat.id, { content: 'Na verdade, eu errei: o correto é 4.', model: 'fake:m1' });

    const nextChat = await newChat(c);
    await c.send(nextChat.id, { content: 'Resolva novamente', model: 'fake:m1' });
    const learnedSystem = fake.state.calls.at(-1).body.messages[0].content;
    assert.match(learnedSystem, /Correção do usuário: Na verdade, eu errei: o correto é 4/);
    assert.match(learnedSystem, /Resposta anterior: A resposta é 5/);

    await c.patch('/api/auth/me', { prefs: { learningEnabled: false } });
    const disabledChat = await newChat(c);
    await c.send(disabledChat.id, { content: 'Outra pergunta', model: 'fake:m1' });
    assert.doesNotMatch(fake.state.calls.at(-1).body.messages[0].content, /Memória de aprendizado/);
  });

  it('mantém o contexto das mensagens anteriores', async () => {
    fake.reset();
    const c = await newUser('contexto');
    const chat = await newChat(c);
    await c.send(chat.id, { content: 'primeira', model: 'fake:m1' });
    await c.send(chat.id, { content: 'segunda' });
    const msgs = fake.state.calls.at(-1).body.messages.filter((m) => m.role !== 'system');
    assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user']);
  });

  it('regenera a última resposta substituindo a anterior', async () => {
    fake.reset();
    const c = await newUser('regen');
    const chat = await newChat(c);
    await c.send(chat.id, { content: 'pergunta', model: 'fake:m1' });
    fake.state.mode = { words: ['Nova', ' resposta'] };
    const r = await c.send(chat.id, { regenerate: true });
    assert.equal(r.events.at(-1).event, 'done');

    const msgs = (await c.get(`/api/chats/${chat.id}`)).json.messages;
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].content, 'Nova resposta');
    const sent = fake.state.calls.at(-1).body.messages.filter((m) => m.role !== 'system');
    assert.deepEqual(sent, [{ role: 'user', content: 'pergunta' }]);
  });

  it('avalia respostas (positiva, negativa, limpar) e valida o valor', async () => {
    const c = await newUser('rating');
    const chat = await newChat(c);
    await c.send(chat.id, { content: 'oi', model: 'fake:m1' });
    const answer = (await c.get(`/api/chats/${chat.id}`)).json.messages[1];
    const url = `/api/chats/${chat.id}/messages/${answer.id}/rating`;

    assert.equal((await c.patch(url, { rating: 1 })).status, 200);
    assert.equal((await c.get(`/api/chats/${chat.id}`)).json.messages[1].rating, 1);
    await c.patch(url, { rating: -1 });
    assert.equal((await c.get(`/api/chats/${chat.id}`)).json.messages[1].rating, -1);
    await c.patch(url, { rating: 0 });
    assert.equal((await c.get(`/api/chats/${chat.id}`)).json.messages[1].rating, 0);
    assert.equal((await c.patch(url, { rating: 5 })).status, 400);

    // não é possível avaliar mensagem do usuário
    const userMsg = (await c.get(`/api/chats/${chat.id}`)).json.messages[0];
    assert.equal((await c.patch(`/api/chats/${chat.id}/messages/${userMsg.id}/rating`, { rating: 1 })).status, 404);
  });

  it('mostra mensagem clara quando o provedor recusa a chave e não vaza segredos', async () => {
    fake.reset();
    fake.state.mode = { status: 401 };
    const c = await newUser('erro401');
    const chat = await newChat(c);
    const r = await c.send(chat.id, { content: 'oi', model: 'fake:m1' });
    const err = r.events.find((e) => e.event === 'error');
    assert.ok(err);
    assert.match(err.data.message, /chave de API inválida/);
    assert.ok(!JSON.stringify(r.events).includes(API_KEY));
    // a mensagem do usuário foi mantida para permitir "tentar novamente"
    assert.equal((await c.get(`/api/chats/${chat.id}`)).json.messages.length, 1);

    fake.state.mode = {};
    const retry = await c.send(chat.id, { regenerate: true });
    assert.equal(retry.events.at(-1).event, 'done');
    assert.equal((await c.get(`/api/chats/${chat.id}`)).json.messages.length, 2);
  });

  it('traduz 429 e 500 do provedor para mensagens em português', async () => {
    const c = await newUser('erros');
    const chat = await newChat(c);
    fake.reset();
    fake.state.mode = { status: 429 };
    let r = await c.send(chat.id, { content: 'a', model: 'fake:m1' });
    assert.match(r.events.find((e) => e.event === 'error').data.message, /limite/);
    fake.state.mode = { status: 503 };
    r = await c.send(chat.id, { regenerate: true });
    assert.match(r.events.find((e) => e.event === 'error').data.message, /indisponível/);
    fake.reset();
  });

  it('permite interromper: guarda o texto parcial como incompleto', async () => {
    fake.reset();
    fake.state.mode = { words: Array.from({ length: 40 }, (_, i) => `p${i} `), delay: 30 };
    const c = await newUser('abort');
    const chat = await newChat(c);

    const ctrl = new AbortController();
    const res = await c.raw('POST', `/api/chats/${chat.id}/messages`, { content: 'conte uma história longa', model: 'fake:m1' }, { signal: ctrl.signal });
    const reader = res.body.getReader();
    let seen = '';
    while (!seen.includes('event: delta')) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += Buffer.from(value).toString();
    }
    ctrl.abort();
    await reader.cancel().catch(() => {});

    const msgs = await waitFor(async () => {
      const m = (await c.get(`/api/chats/${chat.id}`)).json.messages;
      return m.length === 2 ? m : null;
    });
    assert.equal(msgs[1].incomplete, true);
    assert.ok(msgs[1].content.length > 0);
    assert.ok(msgs[1].content.length < 40 * 3);
    fake.reset();
  });

  it('valida entradas: modelo inexistente, mensagem vazia, anexos demais, JSON inválido', async () => {
    const c = await newUser('valida');
    const chat = await newChat(c);
    assert.equal((await c.send(chat.id, { content: 'oi', model: 'nao:existe' })).status, 400);
    assert.equal((await c.send(chat.id, { content: '   ' })).status, 400);
    assert.equal((await c.send(chat.id, { regenerate: true })).status, 400);
    const many = Array.from({ length: 5 }, (_, i) => ({ kind: 'text', name: `a${i}.txt`, content: 'x' }));
    assert.equal((await c.send(chat.id, { content: 'oi', attachments: many })).status, 400);
    assert.equal((await c.send(chat.id, { content: 'oi', campoExtra: 1 })).status, 400);
    const bad = await c.raw('POST', `/api/chats/${chat.id}/messages`, '{nao-json');
    assert.equal(bad.status, 400);
  });
});

describe('anexos', () => {
  it('inclui arquivos de texto no prompt', async () => {
    fake.reset();
    const c = await newUser('texto');
    const chat = await newChat(c);
    await c.send(chat.id, {
      content: 'Resuma o arquivo',
      model: 'fake:m1',
      attachments: [{ kind: 'text', name: 'notas.md', content: 'conteúdo importante do arquivo' }],
    });
    const last = fake.state.calls.at(-1).body.messages.at(-1);
    assert.match(last.content, /Resuma o arquivo/);
    assert.match(last.content, /notas\.md/);
    assert.match(last.content, /conteúdo importante do arquivo/);
  });

  it('envia imagens para modelos com suporte e bloqueia nos demais, sem alterar o histórico', async () => {
    fake.reset();
    const c = await newUser('imagem');
    const chat = await newChat(c);
    const att = [{ kind: 'image', name: 'pixel.png', data: PNG }];

    const ok = await c.send(chat.id, { content: 'O que é isso?', model: 'fake:m1', attachments: att });
    assert.equal(ok.events.at(-1).event, 'done');
    const parts = fake.state.calls.at(-1).body.messages.at(-1).content;
    assert.equal(parts[0].type, 'text');
    assert.equal(parts[1].type, 'image_url');
    assert.ok(parts[1].image_url.url.startsWith('data:image/png;base64,'));

    const before = (await c.get(`/api/chats/${chat.id}`)).json.messages.length;
    const blocked = await c.send(chat.id, { content: 'e agora?', model: 'texto:t1' });
    assert.equal(blocked.status, 400);
    assert.match(blocked.json.error, /imagens/);
    assert.equal((await c.get(`/api/chats/${chat.id}`)).json.messages.length, before);
  });

  it('rejeita imagem com tipo inválido', async () => {
    const c = await newUser('imginv');
    const chat = await newChat(c);
    const r = await c.send(chat.id, { content: 'x', attachments: [{ kind: 'image', name: 'a.svg', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] });
    assert.equal(r.status, 400);
  });
});

describe('provedor Anthropic', () => {
  it('usa a Messages API com x-api-key e interpreta o streaming', async () => {
    fake.reset();
    const c = await newUser('anthropic');
    const chat = await newChat(c);
    const r = await c.send(chat.id, { content: 'oi', model: 'claude:c1' });
    assert.equal(r.events.at(-1).event, 'done');
    assert.equal(r.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'Olá, mundo!');
    const call = fake.state.calls.at(-1);
    assert.equal(call.url, '/messages');
    assert.equal(call.headers['x-api-key'], 'ant-key');
    assert.equal(call.headers['anthropic-version'], '2023-06-01');
    assert.equal(call.body.model, 'c1');
    assert.equal(typeof call.body.system, 'string');
    assert.equal(call.body.messages[0].role, 'user');
  });
});

describe('sem provedor configurado e limites', () => {
  it('responde 503 com instrução clara quando nenhum provedor está configurado', async () => {
    const empty = await startApp({ providers: [] });
    try {
      const c = empty.client();
      await c.register('vazio@exemplo.com');
      const models = (await c.get('/api/models')).json;
      assert.equal(models.configured, false);
      const chat = (await c.post('/api/chats')).json.chat;
      const r = await c.send(chat.id, { content: 'oi' });
      assert.equal(r.status, 503);
      assert.match(r.json.error, /provedor de IA/);
    } finally {
      await empty.close();
    }
  });

  it('aplica limite de requisições por usuário no chat', async () => {
    fake.reset();
    const limited = await startApp({
      env: { RATE_LIMIT_CHAT: '2' },
      providers: [{ id: 'fake', label: 'Fake', type: 'openai', baseUrl: fake.url, apiKey: 'k', models: ['m1'], vision: false }],
    });
    try {
      const c = limited.client();
      await c.register('limite@exemplo.com');
      const chat = (await c.post('/api/chats')).json.chat;
      assert.equal((await c.send(chat.id, { content: '1' })).status, 200);
      assert.equal((await c.send(chat.id, { content: '2' })).status, 200);
      assert.equal((await c.send(chat.id, { content: '3' })).status, 429);
    } finally {
      await limited.close();
    }
  });

  it('bloqueia cadastro quando ALLOW_REGISTRATION=false', async () => {
    const closed = await startApp({ env: { ALLOW_REGISTRATION: 'false' } });
    try {
      assert.equal((await closed.client().register('x@exemplo.com')).status, 403);
    } finally {
      await closed.close();
    }
  });
});

describe('utilitários', () => {
  it('parseSSE de teste interpreta eventos (sanidade do helper)', () => {
    const ev = parseSSE('event: a\ndata: {"x":1}\n\nevent: b\ndata: {"y":2}\n\n');
    assert.deepEqual(ev, [
      { event: 'a', data: { x: 1 } },
      { event: 'b', data: { y: 2 } },
    ]);
  });
});
