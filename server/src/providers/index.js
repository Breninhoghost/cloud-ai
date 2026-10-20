import { streamOpenAI } from './openai.js';
import { streamAnthropic } from './anthropic.js';

const ADAPTERS = {
  openai: streamOpenAI,
  anthropic: streamAnthropic,
};

/**
 * Registro de provedores/modelos. Os identificadores públicos têm o formato "provedor:modelo".
 * As chaves de API ficam apenas aqui, no servidor — a lista pública nunca as contém.
 */
export function createRegistry(providers, preferredDefault = '') {
  const entries = new Map();
  for (const p of providers) {
    for (const model of p.models) {
      entries.set(`${p.id}:${model}`, { id: `${p.id}:${model}`, provider: p, model });
    }
  }

  const publicModels = [...entries.values()].map((e) => ({
    id: e.id,
    model: e.model,
    provider: e.provider.id,
    providerLabel: e.provider.label,
    vision: !!e.provider.vision,
  }));

  const defaultModel = entries.has(preferredDefault) ? preferredDefault : publicModels[0]?.id || null;

  return {
    configured: publicModels.length > 0,
    models: publicModels,
    defaultModel,
    resolve: (id) => entries.get(id) || null,
    stream(entry, params) {
      const adapter = ADAPTERS[entry.provider.type];
      if (!adapter) throw new Error(`Adaptador desconhecido: ${entry.provider.type}`);
      return adapter({ provider: entry.provider, model: entry.model, ...params });
    },
  };
}
