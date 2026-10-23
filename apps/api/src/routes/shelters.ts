import { Router, type Request, type Response, type NextFunction } from 'express';
import { createDemandSchema, updateShelterSchema } from '@civicaid/shared';
import * as shelterService from '../services/shelterService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const shelters = await shelterService.listShelters();
    res.json({ data: shelters });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shelter = await shelterService.getShelterById(req.params.id as string);
    res.json({ data: shelter });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/demands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const demands = await shelterService.getDemandsByShelterId(req.params.id as string);
    res.json({ data: demands });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/demands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createDemandSchema.parse({ ...req.body, shelterId: req.params.id as string });
    const demand = await shelterService.createDemand(req.params.id as string, validated);
    res.status(201).json({ data: demand });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateShelterSchema.parse(req.body);
    const shelter = await shelterService.updateShelter(req.params.id as string, validated);
    res.json({ data: shelter });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/full', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await shelterService.changeShelterStatusAndReroute(req.params.id as string, 'FULL');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await shelterService.changeShelterStatusAndReroute(req.params.id as string, 'CLOSED');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
