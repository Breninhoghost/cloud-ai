import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  prefs TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  attachments TEXT,
  rating INTEGER NOT NULL DEFAULT 0,
  incomplete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
`;

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

function mapMessage(r) {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    attachments: r.attachments ? JSON.parse(r.attachments) : [],
    rating: r.rating,
    incomplete: !!r.incomplete,
    createdAt: r.created_at,
  };
}

function mapChat(r) {
  return { id: r.id, title: r.title, model: r.model, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function createDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const q = {
    insertUser: db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    updateUser: db.prepare('UPDATE users SET name = ?, prefs = ? WHERE id = ?'),

    insertChat: db.prepare('INSERT INTO chats (id, user_id, title, model) VALUES (?, ?, ?, ?)'),
    chatForUser: db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?'),
    listChats: db.prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 500'),
    searchChats: db.prepare(
      `SELECT DISTINCT c.* FROM chats c
       LEFT JOIN messages m ON m.chat_id = c.id
       WHERE c.user_id = ? AND (c.title LIKE ? ESCAPE '\\' OR m.content LIKE ? ESCAPE '\\')
       ORDER BY c.updated_at DESC LIMIT 100`
    ),
    renameChat: db.prepare("UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"),
    touchChat: db.prepare("UPDATE chats SET updated_at = datetime('now'), model = COALESCE(?, model) WHERE id = ?"),
    deleteChat: db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?'),
    deleteAllChats: db.prepare('DELETE FROM chats WHERE user_id = ?'),

    insertMessage: db.prepare('INSERT INTO messages (chat_id, role, content, attachments, incomplete) VALUES (?, ?, ?, ?, ?)'),
    messagesForChat: db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC'),
    messageById: db.prepare('SELECT * FROM messages WHERE id = ?'),
    lastMessage: db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1'),
    deleteMessage: db.prepare('DELETE FROM messages WHERE id = ?'),
    countMessages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?'),
    rateMessage: db.prepare(
      `UPDATE messages SET rating = ?
       WHERE id = ? AND role = 'assistant'
         AND chat_id IN (SELECT id FROM chats WHERE user_id = ?)`
    ),
    learningSignals: db.prepare(
      `SELECT m.rating, m.content AS answer,
         (SELECT u.content FROM messages u
          WHERE u.chat_id = m.chat_id AND u.role = 'user' AND u.id < m.id
          ORDER BY u.id DESC LIMIT 1) AS question,
         (SELECT u.content FROM messages u
          WHERE u.chat_id = m.chat_id AND u.role = 'user' AND u.id > m.id
          ORDER BY u.id ASC LIMIT 1) AS followup
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
       WHERE c.user_id = ? AND c.id != ? AND m.role = 'assistant'
         AND m.rating IN (-1, 1) AND m.incomplete = 0
       ORDER BY m.id DESC LIMIT ?`
    ),
    learningCorrections: db.prepare(
      `SELECT u.content AS correction,
         (SELECT a.content FROM messages a
          WHERE a.chat_id = u.chat_id AND a.role = 'assistant' AND a.id < u.id
          ORDER BY a.id DESC LIMIT 1) AS answer,
         (SELECT q.content FROM messages q
          WHERE q.chat_id = u.chat_id AND q.role = 'user'
            AND q.id < (SELECT a.id FROM messages a
                        WHERE a.chat_id = u.chat_id AND a.role = 'assistant' AND a.id < u.id
                        ORDER BY a.id DESC LIMIT 1)
          ORDER BY q.id DESC LIMIT 1) AS question
       FROM messages u
       JOIN chats c ON c.id = u.chat_id
       WHERE c.user_id = ? AND c.id != ? AND u.role = 'user'
         AND EXISTS (SELECT 1 FROM messages a
                     WHERE a.chat_id = u.chat_id AND a.role = 'assistant' AND a.id < u.id)
       ORDER BY u.id DESC LIMIT ?`
    ),
  };

  const parsePrefs = (s) => {
    try {
      return JSON.parse(s || '{}');
    } catch {
      return {};
    }
  };

  return {
    raw: db,
    close: () => db.close(),

    createUser({ email, name, passwordHash }) {
      const id = crypto.randomUUID();
      q.insertUser.run(id, email, name, passwordHash);
      return id;
    },
    getUserByEmail: (email) => q.userByEmail.get(email),
    getUserById(id) {
      const u = q.userById.get(id);
      return u ? { ...u, prefs: parsePrefs(u.prefs) } : null;
    },
    updateUser(id, { name, prefs }) {
      q.updateUser.run(name, JSON.stringify(prefs || {}), id);
    },

    createChat(userId, { title = 'Nova conversa', model = null } = {}) {
      const id = crypto.randomUUID();
      q.insertChat.run(id, userId, title, model);
      return mapChat(q.chatForUser.get(id, userId));
    },
    getChat(userId, chatId) {
      const c = q.chatForUser.get(chatId, userId);
      return c ? mapChat(c) : null;
    },
    listChats(userId, search) {
      const term = (search || '').trim();
      if (!term) return q.listChats.all(userId).map(mapChat);
      const like = `%${escapeLike(term)}%`;
      return q.searchChats.all(userId, like, like).map(mapChat);
    },
    renameChat: (userId, chatId, title) => q.renameChat.run(title, chatId, userId).changes > 0,
    touchChat: (chatId, model) => q.touchChat.run(model ?? null, chatId),
    deleteChat: (userId, chatId) => q.deleteChat.run(chatId, userId).changes > 0,
    deleteAllChats: (userId) => q.deleteAllChats.run(userId).changes,

    addMessage(chatId, { role, content, attachments = [], incomplete = false }) {
      const info = q.insertMessage.run(chatId, role, content, attachments.length ? JSON.stringify(attachments) : null, incomplete ? 1 : 0);
      return mapMessage(q.messageById.get(info.lastInsertRowid));
    },
    listMessages: (chatId) => q.messagesForChat.all(chatId).map(mapMessage),
    lastMessage(chatId) {
      const m = q.lastMessage.get(chatId);
      return m ? mapMessage(m) : null;
    },
    deleteMessage: (id) => q.deleteMessage.run(id),
    countMessages: (chatId) => q.countMessages.get(chatId).n,
    rateMessage: (userId, messageId, rating) => q.rateMessage.run(rating, messageId, userId).changes > 0,
    learningSignals(userId, excludeChatId, limit = 40) {
      return q.learningSignals.all(userId, excludeChatId, Math.max(1, Math.min(100, limit)));
    },
    learningCorrections(userId, excludeChatId, limit = 100) {
      return q.learningCorrections.all(userId, excludeChatId, Math.max(1, Math.min(200, limit)));
    },
  };
}
