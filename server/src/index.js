import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const { app, db, registry } = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`Cloud AI rodando em http://localhost:${config.port} (${config.nodeEnv})`);
  if (registry.configured) {
    const byProvider = {};
    for (const m of registry.models) (byProvider[m.providerLabel] ||= []).push(m.model);
    for (const [label, models] of Object.entries(byProvider)) console.log(`  • ${label}: ${models.join(', ')}`);
  } else {
    console.warn('  ! Nenhum provedor de IA configurado. Copie .env.example para .env e defina ao menos uma chave de API.');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
