import { ProviderError } from './errors.js';
import { upstreamFetch } from './http.js';
import { readSSE } from './sse.js';

function toMessage(m) {
  const parts = [
    ...m.images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } })),
    { type: 'text', text: m.content || 'Analise a(s) imagem(ns) anexada(s).' },
  ];
  return { role: m.role, content: parts };
}

/** Adaptador para a Messages API da Anthropic (`POST {baseUrl}/messages`) com streaming. */
export async function* streamAnthropic({ provider, model, system, messages, signal, timeoutMs, maxTokens }) {
  const url = provider.baseUrl.replace(/\/+$/, '') + '/messages';
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'x-api-key': provider.apiKey,
    'anthropic-version': '2023-06-01',
  };
  const body = { model, max_tokens: maxTokens, stream: true, messages: messages.map(toMessage) };
  if (system) body.system = system;

  const { res, dispose } = await upstreamFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }, { signal, timeoutMs, label: provider.label });
  try {
    for await (const ev of readSSE(res.body)) {
      let json;
      try {
        json = JSON.parse(ev.data);
      } catch {
        continue;
      }
      if (ev.event === 'error' || json.type === 'error') {
        throw new ProviderError(`${provider.label}: ${String(json.error?.message || 'erro durante a geração').slice(0, 200)}`, 502);
      }
      if (ev.event === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
        yield json.delta.text;
      }
      if (ev.event === 'message_stop') return;
    }
  } finally {
    dispose();
  }
}
