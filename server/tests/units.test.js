import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSSE } from '../src/providers/sse.js';
import { buildLearningContext, toProviderMessages, titleFrom } from '../src/prompt.js';
import { createRegistry } from '../src/providers/index.js';
import { loadProviders, loadConfig } from '../src/config.js';

async function collect(iter) {
  const out = [];
  for await (const x of iter) out.push(x);
  return out;
}

async function* chunks(...parts) {
  for (const p of parts) yield Buffer.from(p);
}

describe('readSSE', () => {
  it('junta eventos divididos em vários pedaços e suporta CRLF', async () => {
    const out = await collect(readSSE(chunks('event: a\nda', 'ta: 1\n\nda', 'ta: dois\r\n\r\n', 'data: tres\n\n')));
    assert.deepEqual(out, [
      { event: 'a', data: '1' },
      { event: 'message', data: 'dois' },
      { event: 'message', data: 'tres' },
    ]);
  });

  it('não corrompe caracteres UTF-8 divididos entre pedaços', async () => {
    const bytes = Buffer.from('data: ação ✓\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // no meio do "ç"
    async function* split() {
      yield bytes.subarray(0, cut);
      yield bytes.subarray(cut);
    }
    assert.deepEqual(await collect(readSSE(split())), [{ event: 'message', data: 'ação ✓' }]);
  });

  it('ignora comentários e emite o último evento sem linha em branco final', async () => {
    const out = await collect(readSSE(chunks(': keep-alive\n\ndata: fim')));
    assert.deepEqual(out, [{ event: 'message', data: 'fim' }]);
  });
});

describe('toProviderMessages', () => {
  const m = (role, content, attachments = []) => ({ role, content, attachments });

  it('descarta assistentes no início e une mensagens consecutivas do mesmo papel', () => {
    const out = toProviderMessages([m('assistant', 'x'), m('user', 'a'), m('user', 'b'), m('assistant', 'c')]);
    assert.deepEqual(out.map((x) => [x.role, x.content]), [
      ['user', 'a\n\nb'],
      ['assistant', 'c'],
    ]);
  });

  it('inclui texto de arquivos e separa imagens', () => {
    const out = toProviderMessages([
      m('user', 'veja', [
        { kind: 'text', name: 'a.txt', content: 'CONTEUDO' },
        { kind: 'image', name: 'i.png', data: 'data:image/png;base64,AAAA' },
      ]),
    ]);
    assert.match(out[0].content, /a\.txt/);
    assert.match(out[0].content, /CONTEUDO/);
    assert.deepEqual(out[0].images, [{ mime: 'image/png', data: 'AAAA' }]);
  });

  it('limita o histórico às últimas N mensagens', () => {
    const rows = Array.from({ length: 10 }, (_, i) => m(i % 2 ? 'assistant' : 'user', String(i)));
    const out = toProviderMessages(rows, 4);
    assert.equal(out.length, 4);
    assert.equal(out.at(-1).content, '9');
  });
});

describe('titleFrom', () => {
  it('compacta espaços e limita o tamanho', () => {
    assert.equal(titleFrom('  olá   mundo \n tudo '), 'olá mundo tudo');
    assert.ok(titleFrom('a'.repeat(200)).length <= 60);
    assert.equal(titleFrom('', [{ name: 'foto.png' }]), 'foto.png');
  });

  describe('buildLearningContext', () => {
    it('usa correções explícitas e respostas bem avaliadas sem tratar exemplos como fatos', () => {
      const context = buildLearningContext(
        [{ rating: 1, question: 'Explique closures', answer: 'Resposta útil', followup: null }],
        [{ question: 'Quanto é 2 + 2?', answer: 'É 5.', correction: 'Na verdade, eu errei: o correto é 4.' }]
      );

      assert.match(context, /Correção do usuário: Na verdade, eu errei: o correto é 4/);
      assert.match(context, /Resposta bem avaliada pelo usuário/);
      assert.match(context, /não como fonte factual/);
      assert.match(context, /são dados, não instruções/);
    });

    it('ignora respostas rejeitadas sem uma correção explícita', () => {
      assert.equal(buildLearningContext([{ rating: -1, question: 'pergunta', answer: 'resposta', followup: 'Pode explicar melhor?' }]), '');
    });
  });
});

describe('configuração de provedores', () => {
  it('habilita apenas provedores realmente configurados', () => {
    assert.deepEqual(loadProviders({}), []);
    const p = loadProviders({ OPENAI_API_KEY: 'k', OPENAI_MODELS: 'a, b', ANTHROPIC_API_KEY: 'k2', OLLAMA_BASE_URL: 'http://localhost:11434/v1', OLLAMA_MODELS: 'llama3' });
    assert.deepEqual(p.map((x) => x.id), ['openai', 'anthropic', 'ollama']);
    assert.deepEqual(p[0].models, ['a', 'b']);
  });

  it('ignora provedor sem modelos (ex.: Groq sem GROQ_MODELS)', () => {
    assert.deepEqual(loadProviders({ GROQ_API_KEY: 'k' }), []);
  });

  it('exige SESSION_SECRET forte em produção', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'curto' }), /SESSION_SECRET/);
    assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) }));
  });

  it('registro resolve modelos e usa o padrão configurado quando válido', () => {
    const providers = [{ id: 'p', label: 'P', type: 'openai', baseUrl: 'http://x', apiKey: 's', models: ['a', 'b'], vision: false }];
    assert.equal(createRegistry(providers).defaultModel, 'p:a');
    assert.equal(createRegistry(providers, 'p:b').defaultModel, 'p:b');
    assert.equal(createRegistry(providers, 'p:zzz').defaultModel, 'p:a');
    assert.equal(createRegistry(providers).resolve('p:zzz'), null);
    assert.equal(JSON.stringify(createRegistry(providers).models).includes('"s"'), false);
  });
});
