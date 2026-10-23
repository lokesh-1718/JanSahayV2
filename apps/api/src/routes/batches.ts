import { Router, type Request, type Response, type NextFunction } from 'express';
import { createBatchSchema } from '@civicaid/shared';
import * as batchService from '../services/batchService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const batches = await batchService.listBatches();
    res.json({ data: batches });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createBatchSchema.parse(req.body);
    const batch = await batchService.createBatch(validated);
    res.status(201).json({ data: batch });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await batchService.getBatchById(req.params.id as string);
    res.json({ data: batch });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await batchService.matchBatch(req.params.id as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
