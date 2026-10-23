import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { requestId, requestLogger, errorHandler } from './middleware/index.js';
import apiRouter from './routes/index.js';

export function createApp(): express.Application {
  const app = express();

  // ─── Global middleware ──────────────────────────────────────
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json());
  app.use(requestId);
  app.use(requestLogger);

  // ─── API routes ─────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ─── Error handler (must be last) ───────────────────────────
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
