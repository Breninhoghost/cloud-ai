import { ProviderError } from './errors.js';
import { upstreamFetch } from './http.js';
import { readSSE } from './sse.js';

function toMessage(m) {
  if (!m.images?.length) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [
      { type: 'text', text: m.content || 'Analise a(s) imagem(ns) anexada(s).' },
      ...m.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })),
    ],
  };
}

/**
 * Adaptador para qualquer API compatível com `POST {baseUrl}/chat/completions` com streaming
 * (OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM, etc.).
 */
export async function* streamOpenAI({ provider, model, system, messages, signal, timeoutMs }) {
  const url = provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  const body = {
    model,
    stream: true,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map(toMessage)],
  };

  const { res, dispose } = await upstreamFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }, { signal, timeoutMs, label: provider.label });
  try {
    for await (const ev of readSSE(res.body)) {
      if (ev.data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(ev.data);
      } catch {
        continue;
      }
      if (json.error) {
        throw new ProviderError(`${provider.label}: ${String(json.error.message || json.error).slice(0, 200)}`, 502);
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) yield delta;
    }
  } finally {
    dispose();
  }
}
