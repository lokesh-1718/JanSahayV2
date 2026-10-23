import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import { app } from './app.js';

// ─── Start ──────────────────────────────────────────────────
async function start(): Promise<void> {
  await connectDatabase();

  app.listen(config.port, () => {
    console.log(`
🚀 CivicAid API running
   Port:     ${config.port}
   MongoDB:  ${config.mongoUri}
   Client:   ${config.clientOrigin}
    `);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
