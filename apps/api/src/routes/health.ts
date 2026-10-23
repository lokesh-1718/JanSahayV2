import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

// GET /api/v1/health
router.get('/health', (_req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1
      ? 'connected'
      : dbState === 2
        ? 'connecting'
        : 'disconnected';

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
  });
});

export default router;
