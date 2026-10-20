import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lê o .env da raiz do projeto (ou de server/.env). Variáveis já definidas no ambiente têm prioridade.
dotenv.config({ path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../.env')], quiet: true });

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = (v, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

/**
 * Lê os provedores de IA das variáveis de ambiente.
 * Um provedor só é habilitado se estiver realmente configurado (chave ou URL base).
 * Tipos de adaptador: "openai" (qualquer API compatível com /chat/completions) e "anthropic".
 */
export function loadProviders(env = process.env) {
  const providers = [];

  if (env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      label: 'OpenAI',
      type: 'openai',
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: env.OPENAI_API_KEY,
      models: list(env.OPENAI_MODELS || 'gpt-4o-mini'),
      vision: bool(env.OPENAI_VISION, true),
    });
  }

  if (env.ANTHROPIC_API_KEY) {
    providers.push({
      id: 'anthropic',
      label: 'Anthropic',
      type: 'anthropic',
      baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      apiKey: env.ANTHROPIC_API_KEY,
      models: list(env.ANTHROPIC_MODELS || 'claude-sonnet-5-5'),
      vision: bool(env.ANTHROPIC_VISION, true),
    });
  }

  if (env.OPENROUTER_API_KEY) {
    providers.push({
      id: 'openrouter',
      label: 'OpenRouter',
      type: 'openai',
      baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
      models: list(env.OPENROUTER_MODELS || 'openai/gpt-4o-mini'),
      vision: bool(env.OPENROUTER_VISION, true),
    });
  }

  if (env.GROQ_API_KEY) {
    providers.push({
      id: 'groq',
      label: 'Groq',
      type: 'openai',
      baseUrl: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      apiKey: env.GROQ_API_KEY,
      models: list(env.GROQ_MODELS),
      vision: bool(env.GROQ_VISION, false),
    });
  }

  if (env.OLLAMA_BASE_URL) {
    providers.push({
      id: 'ollama',
      label: 'Ollama (local)',
      type: 'openai',
      baseUrl: env.OLLAMA_BASE_URL,
      apiKey: env.OLLAMA_API_KEY || '',
      models: list(env.OLLAMA_MODELS),
      vision: bool(env.OLLAMA_VISION, false),
    });
  }

  // Provedor genérico: qualquer endpoint compatível com a API de chat da OpenAI.
  if (env.CUSTOM_BASE_URL) {
    providers.push({
      id: 'custom',
      label: env.CUSTOM_LABEL || 'Personalizado',
      type: 'openai',
      baseUrl: env.CUSTOM_BASE_URL,
      apiKey: env.CUSTOM_API_KEY || '',
      models: list(env.CUSTOM_MODELS),
      vision: bool(env.CUSTOM_VISION, false),
    });
  }

  return providers.filter((p) => p.models.length > 0);
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  let jwtSecret = env.SESSION_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    if (isProd) {
      throw new Error('SESSION_SECRET é obrigatório em produção (mínimo de 32 caracteres). Gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    }
    // Em desenvolvimento geramos um segredo temporário (sessões caem ao reiniciar).
    jwtSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[aviso] SESSION_SECRET não definido; usando segredo temporário de desenvolvimento.');
  }

  return {
    nodeEnv,
    isProd,
    port: Number(env.PORT || 3001),
    jwtSecret,
    dbPath: env.DATABASE_PATH || path.resolve(__dirname, '../data/cloud-ai.db'),
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    trustProxy: env.TRUST_PROXY ? (Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)) : false,
    allowRegistration: bool(env.ALLOW_REGISTRATION, true),
    bcryptRounds: Number(env.BCRYPT_ROUNDS || 12),
    clientDist: env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist'),
    providers: loadProviders(env),
    defaultModel: env.DEFAULT_MODEL || '',
    maxHistoryMessages: Number(env.MAX_HISTORY_MESSAGES || 40),
    maxOutputTokens: Number(env.MAX_OUTPUT_TOKENS || 4096),
    upstreamTimeoutMs: Number(env.UPSTREAM_TIMEOUT_MS || 60000),
    rateLimits: {
      apiPer15Min: Number(env.RATE_LIMIT_API || 600),
      authPer15Min: Number(env.RATE_LIMIT_AUTH || 30),
      chatPerMinute: Number(env.RATE_LIMIT_CHAT || 20),
    },
    systemPrompt:
      env.SYSTEM_PROMPT ||
      'Você é o Cloud AI, um assistente de inteligência artificial útil, claro e honesto. Responda em português do Brasil, a menos que o usuário peça outro idioma. Use Markdown quando ajudar (listas, tabelas e blocos de código com a linguagem indicada).',
  };
}
