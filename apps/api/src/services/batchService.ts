import mongoose from 'mongoose';
import {
  DonationBatch,
  Shelter,
  Demand,
  Rider,
  Delivery,
  type IDonationBatch,
  type IDelivery,
} from '../models/index.js';
import {
  buildMatchPlan,
  type MatchPlan,
  type BatchInput,
  type ShelterInput,
  type DemandInput,
  type RiderInput,
} from '@civicaid/shared';
import { DomainError } from '../middleware/index.js';
import { logOperationEvent } from './eventService.js';

export async function listBatches(): Promise<IDonationBatch[]> {
  return DonationBatch.find().sort({ createdAt: -1 });
}

export async function getBatchById(id: string): Promise<IDonationBatch> {
  const batch = await DonationBatch.findById(id);
  if (!batch) {
    throw new DomainError('BATCH_NOT_FOUND', `Batch with ID ${id} not found`, 404);
  }
  return batch;
}

export async function createBatch(data: {
  donorId: string;
  aidType: any;
  quantity: number;
  unit: string;
  pickupLocation: any;
  expiresAt: string | Date;
  handling: any;
  notes?: string;
}): Promise<IDonationBatch> {
  const expiresAt = new Date(data.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    throw new DomainError('BATCH_EXPIRED', 'Batch expiry must be in the future', 400);
  }

  const batch = await DonationBatch.create({
    donorId: data.donorId,
    aidType: data.aidType,
    quantity: data.quantity,
    remainingQuantity: data.quantity,
    unit: data.unit,
    pickupLocation: data.pickupLocation,
    expiresAt,
    handling: data.handling,
    status: 'AVAILABLE',
    notes: data.notes,
  });

  await logOperationEvent(
    'BATCH_CREATED',
    'INFO',
    `Created donation batch of ${batch.quantity} ${batch.unit} (${batch.aidType})`,
    'DonationBatch',
    batch._id,
    { quantity: batch.quantity, aidType: batch.aidType, expiresAt },
  );

  return batch;
}

export async function matchBatch(batchId: string): Promise<{
  plan: MatchPlan;
  deliveries: IDelivery[];
}> {
  const batch = await getBatchById(batchId);

  if (batch.status === 'EXPIRED' || batch.status === 'CANCELLED') {
    throw new DomainError('INVALID_BATCH_STATUS', `Cannot match batch in ${batch.status} status`, 400);
  }

  if (batch.remainingQuantity <= 0) {
    throw new DomainError('BATCH_DEPLETED', 'No remaining quantity in batch to allocate', 400);
  }

  // Fetch open shelters
  const shelters = await Shelter.find({ status: 'OPEN' });

  // Fetch open or partially fulfilled demands matching the aid type
  const demands = await Demand.find({
    aidType: batch.aidType,
    status: { $in: ['OPEN', 'PARTIALLY_FULFILLED'] },
  });

  // Fetch available riders with capacity
  const riders = await Rider.find({
    status: 'AVAILABLE',
    vehicleCapacity: { $gt: 0 },
    activeDeliveryId: { $in: [null, undefined] },
  });

  // Convert Mongoose docs to logistics engine input format
  const batchInput: BatchInput = {
    id: batch._id.toString(),
    aidType: batch.aidType,
    quantity: batch.quantity,
    remainingQuantity: batch.remainingQuantity,
    pickupLocation: batch.pickupLocation,
    expiresAt: batch.expiresAt,
    handling: batch.handling,
    status: batch.status,
  };

  const shelterInputs: ShelterInput[] = shelters.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    status: s.status,
    location: s.location,
    capacity: s.capacity,
    currentOccupancy: s.currentOccupancy,
    facilities: s.facilities,
    acceptedAidTypes: s.acceptedAidTypes,
  }));

  const demandInputs: DemandInput[] = demands.map((d) => ({
    id: d._id.toString(),
    shelterId: d.shelterId.toString(),
    aidType: d.aidType,
    quantityRequested: d.requestedQuantity,
    quantityFulfilled: d.fulfilledQuantity,
    status: d.status,
  }));

  const riderInputs: RiderInput[] = riders.map((r) => ({
    id: r._id.toString(),
    status: r.status,
    vehicleCapacity: r.vehicleCapacity,
    currentLocation: r.currentLocation,
    activeDeliveryId: r.activeDeliveryId ? r.activeDeliveryId.toString() : null,
  }));

  // Run pure logistics matching
  const plan = buildMatchPlan({
    batch: batchInput,
    shelters: shelterInputs,
    demands: demandInputs,
    riders: riderInputs,
    nowMs: Date.now(),
  });

  if (plan.allocations.length === 0) {
    await logOperationEvent(
      'MATCH_BLOCKED',
      'WARNING',
      `Match failed for batch ${batch._id}: ${plan.rejections.map((r) => r.reason).join('; ')}`,
      'DonationBatch',
      batch._id,
      { rejections: plan.rejections },
    );
    return { plan, deliveries: [] };
  }

  const createdDeliveries: IDelivery[] = [];
  const claimWindowMs = 3 * 60_000; // 3 minutes

  // Persist allocations
  for (const alloc of plan.allocations) {
    const shelter = shelters.find((s) => s._id.toString() === alloc.shelterId);
    if (!shelter) continue;

    const delivery = await Delivery.create({
      batchId: batch._id,
      demandId: new mongoose.Types.ObjectId(alloc.demandId),
      riderId: new mongoose.Types.ObjectId(alloc.riderId),
      quantity: alloc.quantity,
      status: 'OFFERED',
      pickupLocation: batch.pickupLocation,
      destinationLocation: shelter.location,
      estimatedMinutes: alloc.travelMinutes,
      claimExpiresAt: new Date(Date.now() + claimWindowMs),
      lastHeartbeatAt: new Date(),
    });

    createdDeliveries.push(delivery);

    // Reserve rider
    await Rider.findByIdAndUpdate(alloc.riderId, {
      status: 'RESERVED',
      activeDeliveryId: delivery._id,
    });

    // Update demand fulfilledQuantity
    const demandDoc = await Demand.findById(alloc.demandId);
    if (demandDoc) {
      demandDoc.fulfilledQuantity += alloc.quantity;
      if (demandDoc.fulfilledQuantity >= demandDoc.requestedQuantity) {
        demandDoc.status = 'FULFILLED';
      } else {
        demandDoc.status = 'PARTIALLY_FULFILLED';
      }
      await demandDoc.save();
    }

    await logOperationEvent(
      'DELIVERY_OFFERED',
      'INFO',
      `Offered delivery of ${alloc.quantity} items to rider for shelter ${shelter.name}`,
      'Delivery',
      delivery._id,
      {
        batchId: batch._id,
        shelterId: alloc.shelterId,
        riderId: alloc.riderId,
        quantity: alloc.quantity,
        etaMinutes: alloc.travelMinutes,
      },
    );
  }

  // Update batch remaining quantity and status
  batch.remainingQuantity = plan.unallocatedQuantity;
  if (batch.remainingQuantity <= 0) {
    batch.status = 'ALLOCATED';
  } else if (batch.remainingQuantity < batch.quantity) {
    batch.status = 'PARTIALLY_ALLOCATED';
  }
  await batch.save();

  await logOperationEvent(
    'MATCH_PLAN_CREATED',
    'INFO',
    `Matched batch into ${createdDeliveries.length} delivery tasks (${plan.totalAllocated} allocated, ${plan.unallocatedQuantity} remaining)`,
    'DonationBatch',
    batch._id,
    {
      totalAllocated: plan.totalAllocated,
      unallocated: plan.unallocatedQuantity,
      allocationsCount: createdDeliveries.length,
    },
  );

  return { plan, deliveries: createdDeliveries };
}
