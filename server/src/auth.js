import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'cloudai_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, prefs: u.prefs || {} };
}

export function createAuth({ db, config }) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  };

  // Hash falso para igualar o tempo de resposta quando o e-mail não existe.
  const dummyHash = bcrypt.hashSync('cloud-ai-dummy-password', config.bcryptRounds);

  return {
    hashPassword: (pw) => bcrypt.hash(pw, config.bcryptRounds),
    async verifyPassword(pw, hash) {
      return bcrypt.compare(pw, hash || dummyHash).then((ok) => ok && !!hash);
    },

    startSession(res, userId) {
      const token = jwt.sign({ sub: userId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
    },
    endSession(res) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
    },

    requireAuth(req, res, next) {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
      try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
        const user = db.getUserById(payload.sub);
        if (!user) return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
        req.user = user;
        next();
      } catch {
        res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
      }
    },
  };
}
