import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { publicUser } from '../auth.js';
import { loginSchema, registerSchema, updateMeSchema, validate } from '../validation.js';

export function authRoutes({ db, auth, config }) {
  const r = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimits.authPer15Min,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
  });

  r.post('/register', limiter, validate(registerSchema), async (req, res) => {
    if (!config.allowRegistration) return res.status(403).json({ error: 'O cadastro de novos usuários está desativado.' });
    const { email, name, password } = req.body;
    try {
      const passwordHash = await auth.hashPassword(password);
      const id = db.createUser({ email, name, passwordHash });
      auth.startSession(res, id);
      res.status(201).json({ user: publicUser(db.getUserById(id)) });
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: 'Não foi possível criar a conta com esse e-mail.' });
      }
      throw err;
    }
  });

  r.post('/login', limiter, validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;
    const row = db.getUserByEmail(email);
    const ok = await auth.verifyPassword(password, row?.password_hash);
    if (!row || !ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    auth.startSession(res, row.id);
    res.json({ user: publicUser(db.getUserById(row.id)) });
  });

  r.post('/logout', (req, res) => {
    auth.endSession(res);
    res.json({ ok: true });
  });

  r.get('/me', auth.requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  r.patch('/me', auth.requireAuth, validate(updateMeSchema), (req, res) => {
    const name = req.body.name ?? req.user.name;
    const prefs = { ...req.user.prefs, ...(req.body.prefs || {}) };
    db.updateUser(req.user.id, { name, prefs });
    res.json({ user: publicUser(db.getUserById(req.user.id)) });
  });

  return r;
}
