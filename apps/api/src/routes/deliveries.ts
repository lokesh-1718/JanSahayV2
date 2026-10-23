import { Router, type Request, type Response, type NextFunction } from 'express';
import { riderHeartbeatSchema, deliveryStatusSchema } from '@civicaid/shared';
import * as deliveryService from '../services/deliveryService.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = {
      status: req.query.status as string | undefined,
      riderId: req.query.riderId as string | undefined,
    };
    const deliveries = await deliveryService.listDeliveries(filter);
    res.json({ data: deliveries });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const delivery = await deliveryService.getDeliveryById(req.params.id as string);
    res.json({ data: delivery });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const riderId = req.body.riderId as string | undefined;
    const delivery = await deliveryService.claimDelivery(req.params.id as string, riderId);
    res.json({ data: delivery });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { location } = riderHeartbeatSchema.parse(req.body);
    const result = await deliveryService.recordHeartbeat(req.params.id as string, location);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, location, note } = deliveryStatusSchema.parse(req.body);
    const delivery = await deliveryService.updateDeliveryStatus(req.params.id as string, status, location, note);
    res.json({ data: delivery });
  } catch (err) {
    next(err);
  }
});

export default router;
