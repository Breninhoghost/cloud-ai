import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { createDb } from './db.js';
import { createAuth, publicUser } from './auth.js';
import { createRegistry } from './providers/index.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes } from './routes/chats.js';

export function createApp(config, db = createDb(config.dbPath)) {
  const app = express();
  const auth = createAuth({ db, config });
  const registry = createRegistry(config.providers, config.defaultModel);

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'upgrade-insecure-requests': config.cookieSecure ? [] : null,
        },
      },
    })
  );
  app.use(cookieParser());

  // ---- API ----
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.rateLimits.apiPer15Min,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
    })
  );

  // Proteção CSRF adicional: requisições que alteram dados precisam do cabeçalho customizado
  // (um formulário de outro site não consegue enviá-lo) além do cookie SameSite=Lax.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-requested-with') !== 'cloud-ai') return res.status(403).json({ error: 'Requisição não permitida.' });
    next();
  });

  // O envio de mensagens aceita anexos (base64), por isso tem um limite maior que o restante da API.
  app.use('/api/chats/:id/messages', express.json({ limit: '20mb' }));
  app.use('/api', express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes({ db, auth, config }));

  app.get('/api/models', auth.requireAuth, (req, res) => {
    const defaultModel =
      registry.resolve(req.user.prefs?.defaultModel) ? req.user.prefs.defaultModel : registry.defaultModel;
    res.json({ configured: registry.configured, models: registry.models, defaultModel });
  });

  app.use('/api/chats', chatRoutes({ db, auth, config, registry }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // ---- Frontend estático (produção) ----
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(indexHtml));
  }

  // ---- Tratamento de erros ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo grande demais.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    console.error('[erro]', err);
    if (res.headersSent) return res.end();
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return { app, db, registry };
}

export { publicUser };
