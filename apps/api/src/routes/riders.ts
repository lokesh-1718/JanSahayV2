import { Router, type Request, type Response, type NextFunction } from 'express';
import { riderLocationSchema } from '@civicaid/shared';
import * as riderService from '../services/riderService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const riders = await riderService.listRiders();
    res.json({ data: riders });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rider = await riderService.getRiderById(req.params.id as string);
    res.json({ data: rider });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/location', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { location } = riderLocationSchema.parse(req.body);
    const rider = await riderService.updateLocation(req.params.id as string, location);
    res.json({ data: rider });
  } catch (err) {
    next(err);
  }
});

export default router;
