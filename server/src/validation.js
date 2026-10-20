import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('E-mail inválido.').max(254);

export const registerSchema = z.object({
  email,
  name: z.string().trim().min(1, 'Informe seu nome.').max(80),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const prefsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    fontSize: z.enum(['sm', 'md', 'lg']),
    defaultModel: z.string().max(200),
    systemPrompt: z.string().max(2000),
    sendWithEnter: z.boolean(),
    learningEnabled: z.boolean(),
  })
  .partial()
  .strict();

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    prefs: prefsSchema.optional(),
  })
  .strict();

export const createChatSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    model: z.string().max(200).optional(),
  })
  .strict();

export const renameChatSchema = z.object({ title: z.string().trim().min(1, 'O título não pode ficar vazio.').max(120) }).strict();

export const ratingSchema = z.object({ rating: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }).strict();

const imageAttachment = z.object({
  kind: z.literal('image'),
  name: z.string().trim().min(1).max(200),
  data: z
    .string()
    .max(5_600_000, 'Imagem grande demais (máx. ~4 MB).')
    .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/, 'Imagem inválida (use PNG, JPEG, WebP ou GIF).'),
});

const textAttachment = z.object({
  kind: z.literal('text'),
  name: z.string().trim().min(1).max(200),
  content: z.string().max(200_000, 'Arquivo de texto grande demais (máx. 200 mil caracteres).'),
});

export const sendMessageSchema = z
  .object({
    content: z.string().max(32_000, 'Mensagem longa demais.').default(''),
    model: z.string().max(200).optional(),
    regenerate: z.boolean().default(false),
    attachments: z.array(z.discriminatedUnion('kind', [imageAttachment, textAttachment])).max(4, 'No máximo 4 anexos por mensagem.').default([]),
  })
  .strict();

export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue?.message && issue.message !== 'Required' ? issue.message : 'Dados inválidos.' });
  }
  req.body = parsed.data;
  next();
};
