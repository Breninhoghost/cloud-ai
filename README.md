# Cloud AI

Plataforma de chat com inteligência artificial, com interface em português do Brasil, tema claro/escuro, histórico de conversas, respostas em streaming e suporte a vários provedores de IA configuráveis por variáveis de ambiente.

- **Frontend:** React 18 + Vite (CSS próprio, sem framework de UI)
- **Backend:** Node.js 20+ com Express
- **Banco de dados:** SQLite (`better-sqlite3`) — isolado em um único módulo para facilitar a migração para PostgreSQL
- **Autenticação:** contas com e-mail e senha (bcrypt), sessão em cookie `httpOnly`

> A identidade visual (logo, cores, textos) é original e não reutiliza elementos de outros produtos.

---

## Funcionalidades

| Área | O que existe |
|---|---|
| Chat | Conversa em tempo real (streaming), interromper resposta, regenerar, copiar, avaliar (👍/👎) |
| Conteúdo | Markdown completo (listas, tabelas, citações), blocos de código com realce e botão de copiar |
| Histórico | Salvamento automático, criar, renomear, excluir, pesquisar por título **e** conteúdo, excluir tudo |
| Anexos | Imagens (PNG, JPEG, WebP, GIF até 4 MB) e arquivos de texto/código (até 200 mil caracteres) — imagens só são aceitas por modelos marcados com suporte a visão |
| Modelos | Seletor de modelo na conversa e modelo padrão por usuário; lista vem da configuração do servidor |
| Configurações | Nome, tema (sistema/claro/escuro), tamanho do texto, instruções personalizadas, aprendizado opcional entre conversas, Enter para enviar |
| Responsivo | Barra lateral deslizante no celular, layout fluido para tablet e desktop |

---

## Estrutura do projeto

```
cloud-ai/
├── package.json            # workspaces (server + client) e scripts
├── .env.example            # modelo de configuração
├── Dockerfile · docker-compose.yml
├── server/
│   ├── src/
│   │   ├── index.js        # inicialização
│   │   ├── app.js          # Express: segurança, rotas, arquivos estáticos
│   │   ├── config.js       # variáveis de ambiente → configuração e provedores
│   │   ├── db.js           # SQLite (única camada que conhece o banco)
│   │   ├── auth.js         # sessão (JWT em cookie httpOnly), bcrypt
│   │   ├── validation.js   # esquemas zod de todas as entradas
│   │   ├── prompt.js       # monta o histórico enviado ao modelo
│   │   ├── routes/         # auth.js, chats.js (inclui o endpoint de streaming)
│   │   └── providers/      # camada de integração com IA
│   │       ├── index.js    # registro de provedores/modelos
│   │       ├── openai.js   # adaptador "compatível com OpenAI"
│   │       ├── anthropic.js# adaptador Messages API da Anthropic
│   │       ├── sse.js      # leitor de Server-Sent Events
│   │       └── http.js     # fetch com timeout e tradução de erros
│   └── tests/              # testes automatizados (node:test)
└── client/
    └── src/
        ├── App.jsx         # estado, streaming, sessão, tema
        ├── api.js          # chamadas à API e leitor de SSE
        └── components/     # Sidebar, ChatView, Message, Markdown, Composer, SettingsModal, AuthScreen…
```

---

## Instalação e execução (desenvolvimento)

Requisitos: **Node.js 20 ou superior** e npm.

```bash
# 1. Instale as dependências (instala servidor e cliente de uma vez)
npm install

# 2. Crie o arquivo de configuração
cp .env.example .env

# 3. Edite o .env e configure pelo menos UM provedor de IA (veja a próxima seção)

# 4. Inicie servidor (porta 3001) e cliente (porta 5173)
npm run dev
```

Abra **http://localhost:5173**, crie uma conta e converse.

Em desenvolvimento, se `SESSION_SECRET` estiver vazio, o servidor usa um segredo temporário (as sessões caem ao reiniciar). Em produção ele é obrigatório.

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor com recarga automática + Vite |
| `npm run build` | Gera o frontend em `client/dist` |
| `npm start` | Inicia o servidor (serve também o `client/dist` se existir) |
| `npm test` | Roda os testes do backend |

---

## Aprendizado entre conversas

Nas configurações, o usuário pode ativar ou desativar o aprendizado automático. Quando ativo, o servidor envia ao modelo até cinco exemplos recentes da própria conta: respostas marcadas com 👍 (como referência de estilo) e mensagens que contenham autocorreções explícitas, como “na verdade”, “o correto é” ou “eu me enganei”. Conversas de outras contas e a conversa atual não entram nessa memória.

Isso não treina nem altera os parâmetros do modelo. Os exemplos são enviados junto com a solicitação ao provedor escolhido; respostas anteriores e correções também podem conter erros e devem ser verificadas. O recurso pode ser desligado a qualquer momento nas configurações.

---

## Configurar uma API de IA

O backend conversa com os provedores; o navegador **nunca** recebe chaves. Cada provedor é habilitado apenas quando tem chave (ou URL) **e** pelo menos um modelo em `*_MODELS`. Os modelos aparecem na interface agrupados por provedor.

| Provedor | Variáveis | Observações |
|---|---|---|
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODELS` | Adaptador `openai`. Imagens: `OPENAI_VISION=true` (padrão). |
| **Anthropic** | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODELS` | Adaptador próprio (Messages API). Imagens: padrão `true`. |
| **OpenRouter** | `OPENROUTER_API_KEY`, `OPENROUTER_MODELS` | Usa o adaptador `openai`. Modelos no formato `empresa/modelo`. |
| **Groq** | `GROQ_API_KEY`, `GROQ_MODELS` | Adaptador `openai`. Imagens desligadas por padrão. |
| **Ollama (local)** | `OLLAMA_BASE_URL` (ex.: `http://localhost:11434/v1`), `OLLAMA_MODELS` | Sem chave. Imagens desligadas por padrão. |
| **Outro compatível com OpenAI** | `CUSTOM_BASE_URL`, `CUSTOM_MODELS`, `CUSTOM_API_KEY`, `CUSTOM_LABEL` | LM Studio, vLLM, Together, etc. |

Exemplo mínimo no `.env`:

```env
SESSION_SECRET=troque-por-um-valor-aleatorio-com-48-caracteres-ou-mais
OPENAI_API_KEY=sk-...
OPENAI_MODELS=gpt-4o-mini
```

Use nomes de modelos **válidos na sua conta** do provedor. Para vários modelos, separe por vírgula (`OPENAI_MODELS=modelo-a,modelo-b`).

### Quais integrações funcionam (e como foram validadas)

Existem **dois adaptadores reais**: `openai` (qualquer endpoint `POST /chat/completions` com streaming) e `anthropic` (`POST /messages` com streaming). OpenAI, OpenRouter, Groq, Ollama e provedores personalizados usam o primeiro; a Anthropic usa o segundo.

Os testes automatizados validam os dois adaptadores contra um **servidor local que imita o formato dessas APIs** (cabeçalhos de autenticação, corpo da requisição, streaming, erros 401/429/503, cancelamento). **Não há testes automatizados que chamem as APIs reais** (exigiria chaves e geraria custo). Antes de publicar, faça um teste manual com a sua chave.

Para adicionar um provedor com API diferente, crie `server/src/providers/meu-provedor.js` exportando um gerador assíncrono `async function* (params)` que emite trechos de texto, e registre-o em `ADAPTERS` (`providers/index.js`) e em `loadProviders` (`config.js`).

### Mensagens de erro

Chave inválida, limite/crédito esgotado, modelo inexistente, provedor fora do ar ou demora excessiva viram mensagens claras em português na interface, com botão **Tentar novamente**. Detalhes técnicos e chaves nunca são enviados ao navegador. Se nenhum provedor estiver configurado, a interface avisa e o envio fica bloqueado.

---

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example). As principais:

| Variável | Padrão | Descrição |
|---|---|---|
| `SESSION_SECRET` | — | **Obrigatória em produção** (≥ 32 caracteres) |
| `PORT` | `3001` | Porta do servidor |
| `DATABASE_PATH` | `server/data/cloud-ai.db` | Arquivo SQLite |
| `ALLOW_REGISTRATION` | `true` | Permite novos cadastros |
| `TRUST_PROXY` | — | Nº de proxies confiáveis (necessário atrás de Nginx/Render/Railway para o limite de requisições por IP funcionar) |
| `DEFAULT_MODEL` | primeiro | Modelo padrão (`provedor:modelo`) |
| `MAX_HISTORY_MESSAGES` | `40` | Mensagens de contexto enviadas ao modelo |
| `RATE_LIMIT_*` | ver `.env.example` | Limites de requisições |

---

## Testes

```bash
npm test
```

Cobrem: cadastro/login/logout, cookie `httpOnly`, mensagens de erro genéricas, validação de entradas, proteção CSRF, **isolamento entre contas** (um usuário não lê, altera, exclui, avalia nem envia mensagem em conversa de outro), CRUD e busca de conversas, streaming completo, regeneração, avaliação, interrupção (texto parcial salvo), erros do provedor, anexos (texto e imagem, com e sem suporte de visão), adaptadores OpenAI e Anthropic, limites de requisições, ausência de provedor e o leitor de SSE (incluindo UTF-8 dividido entre pacotes).

---

## Segurança

- Chaves de API só em variáveis de ambiente do servidor; a lista de modelos enviada ao navegador não contém segredos. Nada sensível vai para `localStorage` (só a preferência de tema).
- Senhas com **bcrypt**; login com mensagem genérica e tempo equalizado (não revela se o e-mail existe).
- Sessão em cookie **`httpOnly`**, `SameSite=Lax`, `Secure` em produção, expira em 7 dias.
- Proteção CSRF extra: rotas que alteram dados exigem o cabeçalho `X-Requested-With`.
- Toda entrada é validada com **zod** (tipos, tamanhos, formatos de imagem); SQL somente com consultas parametrizadas; buscas escapam `%` e `_`.
- Toda consulta de conversa/mensagem filtra por `user_id` do usuário logado.
- Markdown é renderizado **sem HTML bruto** (sem XSS); links abrem com `rel="noopener noreferrer nofollow"`.
- `helmet` (CSP, etc.) e limites de requisições por IP (geral e login) e por usuário (chat).

**Limitações conhecidas** (considere antes de abrir ao público): não há verificação de e-mail nem recuperação de senha; o logout apaga o cookie, mas o token assinado não é revogado no servidor (expira em 7 dias); anexos de imagem ficam no banco em base64.

---

## Publicar na internet

### Opção A — Docker (recomendada)

```bash
cp .env.example .env        # configure SESSION_SECRET e os provedores
docker compose up -d --build
```

O banco fica no volume `cloud-ai-data`. Para HTTPS, coloque na frente um proxy reverso (Caddy, Nginx, Traefik) ou use uma plataforma que já ofereça HTTPS, e **remova** `COOKIE_SECURE: "false"` do `docker-compose.yml` (o cookie `Secure` exige HTTPS). Defina `TRUST_PROXY=1`.

### Opção B — Render, Railway, Fly.io e similares (a partir do Dockerfile)

1. Envie o projeto para um repositório Git (o `.env` já está no `.gitignore`).
2. Crie um serviço web apontando para o `Dockerfile`.
3. Defina as variáveis de ambiente do `.env` no painel da plataforma (`SESSION_SECRET`, chaves, `TRUST_PROXY=1`).
4. **Anexe um disco/volume persistente** em `/data` — sem ele o SQLite é apagado a cada deploy.
5. Porta: `3001` (ou a definida por `PORT`).

### Opção C — Servidor próprio (VPS) sem Docker

```bash
npm install && npm run build
NODE_ENV=production SESSION_SECRET=... OPENAI_API_KEY=... OPENAI_MODELS=... npm start
```

Use `pm2` ou `systemd` para manter o processo, e Nginx/Caddy para HTTPS na frente.

### Checklist de produção

- [ ] `SESSION_SECRET` forte e secreto
- [ ] HTTPS ativo (cookie `Secure`) e `TRUST_PROXY` configurado
- [ ] Volume persistente para o SQLite e rotina de backup
- [ ] `ALLOW_REGISTRATION=false` se o app for privado
- [ ] Limites de gasto configurados no painel do provedor de IA
- [ ] Teste manual de conversa, imagem e regeneração com a chave real

### Migrar para PostgreSQL

Todo acesso ao banco está em `server/src/db.js` (a interface retornada por `createDb`). Para migrar: reimplemente essas funções com `pg` (as consultas são SQL padrão; troque `INTEGER AUTOINCREMENT` por `SERIAL`/`BIGSERIAL`, `datetime('now')` por `now()` e `LIKE ... ESCAPE` por `ILIKE`), torne-as assíncronas e adicione `await` nas rotas.

---

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Aviso "Nenhum provedor de IA configurado" | `.env` sem chave **ou** sem `*_MODELS`; reinicie o servidor após editar |
| "chave de API inválida" | Chave errada/sem permissão para o modelo |
| "modelo ou endpoint não encontrado" | Nome do modelo inválido para a sua conta ou `*_BASE_URL` incorreta |
| Login não persiste em produção | Falta HTTPS (cookie `Secure`) ou `TRUST_PROXY` |
| Erro ao instalar `better-sqlite3` | Instale ferramentas de compilação (`python3`, `make`, `g++`) ou use Node 20/22 LTS |
| Dados somem a cada deploy | Banco em disco efêmero: monte um volume em `/data` |
