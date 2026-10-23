import { Router, type Request, type Response, type NextFunction } from 'express';
import { advanceTimeSchema, simulateAfkSchema } from '@civicaid/shared';
import * as demoService from '../services/demoService.js';

const router = Router();

router.post('/seed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await demoService.seedDemo();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/reset', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await demoService.resetDemo();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/advance-time', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { minutes } = advanceTimeSchema.parse(req.body);
    const result = await demoService.advanceTime(minutes);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/simulate-afk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { riderId } = simulateAfkSchema.parse(req.body);
    const result = await demoService.simulateAfk(riderId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
