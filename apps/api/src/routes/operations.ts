import { Router, type Request, type Response, type NextFunction } from 'express';
import * as operationsService from '../services/operationsService.js';

const router = Router();

router.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await operationsService.getSummary();
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const events = await operationsService.listEvents(limit);
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

export default router;
