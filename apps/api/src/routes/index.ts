import { Router } from 'express';
import healthRouter from './health.js';
import batchesRouter from './batches.js';
import sheltersRouter from './shelters.js';
import ridersRouter from './riders.js';
import deliveriesRouter from './deliveries.js';
import operationsRouter from './operations.js';
import demoRouter from './demo.js';

const router = Router();

router.use(healthRouter);
router.use('/batches', batchesRouter);
router.use('/shelters', sheltersRouter);
router.use('/riders', ridersRouter);
router.use('/deliveries', deliveriesRouter);
router.use('/operations', operationsRouter);
router.use('/demo', demoRouter);

export default router;
