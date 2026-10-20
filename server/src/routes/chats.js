import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { buildLearningContext, toProviderMessages, titleFrom } from '../prompt.js';
import { ProviderError } from '../providers/errors.js';
import { createChatSchema, ratingSchema, renameChatSchema, sendMessageSchema, validate } from '../validation.js';

const DEFAULT_TITLE = 'Nova conversa';

export function chatRoutes({ db, auth, config, registry }) {
  const r = Router();
  r.use(auth.requireAuth);

  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.rateLimits.chatPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user.id}`,
    message: { error: 'Você está enviando mensagens rápido demais. Aguarde um instante.' },
  });

  const ownChat = (req, res) => {
    const chat = db.getChat(req.user.id, req.params.id);
    if (!chat) res.status(404).json({ error: 'Conversa não encontrada.' });
    return chat;
  };

  // ---- Conversas ----
  r.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    res.json({ chats: db.listChats(req.user.id, q) });
  });

  r.post('/', validate(createChatSchema), (req, res) => {
    const model = req.body.model && registry.resolve(req.body.model) ? req.body.model : null;
    res.status(201).json({ chat: db.createChat(req.user.id, { title: req.body.title || DEFAULT_TITLE, model }) });
  });

  r.delete('/', (req, res) => {
    res.json({ deleted: db.deleteAllChats(req.user.id) });
  });

  r.get('/:id', (req, res) => {
    const chat = ownChat(req, res);
    if (!chat) return;
    res.json({ chat, messages: db.listMessages(chat.id) });
  });

  r.patch('/:id', validate(renameChatSchema), (req, res) => {
    if (!db.renameChat(req.user.id, req.params.id, req.body.title)) return res.status(404).json({ error: 'Conversa não encontrada.' });
    res.json({ chat: db.getChat(req.user.id, req.params.id) });
  });

  r.delete('/:id', (req, res) => {
    if (!db.deleteChat(req.user.id, req.params.id)) return res.status(404).json({ error: 'Conversa não encontrada.' });
    res.json({ ok: true });
  });

  // ---- Avaliação de respostas ----
  r.patch('/:id/messages/:messageId/rating', validate(ratingSchema), (req, res) => {
    const chat = ownChat(req, res);
    if (!chat) return;
    const messageId = Number(req.params.messageId);
    const msg = Number.isInteger(messageId) ? db.raw.prepare('SELECT chat_id FROM messages WHERE id = ?').get(messageId) : null;
    if (!msg || msg.chat_id !== chat.id || !db.rateMessage(req.user.id, messageId, req.body.rating)) {
      return res.status(404).json({ error: 'Mensagem não encontrada.' });
    }
    res.json({ ok: true, rating: req.body.rating });
  });

  // ---- Envio de mensagem com streaming (SSE) ----
  r.post('/:id/messages', chatLimiter, validate(sendMessageSchema), async (req, res) => {
    const chat = ownChat(req, res);
    if (!chat) return;

    if (!registry.configured) {
      return res.status(503).json({ error: 'Nenhum provedor de IA está configurado no servidor. Veja o README para configurar uma chave de API.' });
    }

    const { content, attachments, regenerate } = req.body;
    const modelId = req.body.model || chat.model || req.user.prefs?.defaultModel || registry.defaultModel;
    const entry = registry.resolve(modelId) || registry.resolve(registry.defaultModel);
    if (req.body.model && !registry.resolve(req.body.model)) {
      return res.status(400).json({ error: 'Modelo indisponível. Escolha outro modelo nas configurações.' });
    }

    // Verifica suporte a imagens ANTES de alterar o histórico.
    const existing = db.listMessages(chat.id);
    const hasImages =
      attachments.some((a) => a.kind === 'image') ||
      existing.slice(-config.maxHistoryMessages).some((m) => m.attachments.some((a) => a.kind === 'image'));
    if (hasImages && !entry.provider.vision) {
      return res.status(400).json({
        error: `O modelo ${entry.model} (${entry.provider.label}) não está marcado como compatível com imagens. Escolha outro modelo ou remova as imagens da conversa.`,
      });
    }

    // Prepara o histórico (nova mensagem do usuário ou regeneração da última resposta).
    let userMessage = null;
    if (regenerate) {
      const last = db.lastMessage(chat.id);
      if (!last) return res.status(400).json({ error: 'Não há mensagem para regenerar.' });
      if (last.role === 'assistant') db.deleteMessage(last.id);
      const after = db.lastMessage(chat.id);
      if (!after || after.role !== 'user') return res.status(400).json({ error: 'Não há mensagem do usuário para responder.' });
      userMessage = after;
    } else {
      if (!content.trim() && attachments.length === 0) return res.status(400).json({ error: 'Digite uma mensagem ou anexe um arquivo.' });
      userMessage = db.addMessage(chat.id, { role: 'user', content, attachments });
      if (chat.title === DEFAULT_TITLE && existing.length === 0) {
        db.renameChat(req.user.id, chat.id, titleFrom(content, attachments));
      }
    }

    const allMessages = db.listMessages(chat.id);

    db.touchChat(chat.id, entry.id);

    // Cabeçalhos SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event, data) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });

    send('meta', { chat: db.getChat(req.user.id, chat.id), userMessage, model: entry.id });

    const learning =
      req.user.prefs?.learningEnabled === false
        ? ''
        : buildLearningContext(db.learningSignals(req.user.id, chat.id), db.learningCorrections(req.user.id, chat.id));
    const system = [config.systemPrompt, learning, req.user.prefs?.systemPrompt && `Instruções personalizadas do usuário:\n${req.user.prefs.systemPrompt}`]
      .filter(Boolean)
      .join('\n\n');

    let full = '';
    let failure = null;
    try {
      const stream = registry.stream(entry, {
        system,
        messages: toProviderMessages(allMessages, config.maxHistoryMessages),
        signal: ac.signal,
        timeoutMs: config.upstreamTimeoutMs,
        maxTokens: config.maxOutputTokens,
      });
      for await (const delta of stream) {
        full += delta;
        send('delta', { text: delta });
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        failure = err instanceof ProviderError ? err.message : 'Erro inesperado ao falar com o provedor de IA.';
        console.error('[chat] falha no provedor:', err?.message || err);
      }
    }

    let saved = null;
    if (full.trim()) {
      saved = db.addMessage(chat.id, { role: 'assistant', content: full, incomplete: !!failure || ac.signal.aborted });
      db.touchChat(chat.id, entry.id);
    } else if (!failure && !ac.signal.aborted) {
      failure = 'O modelo não retornou nenhum texto. Tente novamente.';
    }

    if (failure) send('error', { message: failure, message_saved: !!saved, assistantMessage: saved });
    else send('done', { assistantMessage: saved, aborted: ac.signal.aborted });
    res.end();
  });

  return r;
}
