import http from 'http';
import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import { app } from './app.js';
import { initSocketServer } from './services/socketService.js';

// ─── Start ──────────────────────────────────────────────────
async function start(): Promise<void> {
  await connectDatabase();

  const server = http.createServer(app);
  initSocketServer(server);

  server.listen(config.port, () => {
    console.log(`
🚀 CivicAid API running with Socket.IO
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

