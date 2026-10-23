import mongoose from 'mongoose';
import {
  Shelter,
  Demand,
  Delivery,
  DonationBatch,
  Rider,
  type IShelter,
  type IDemand,
} from '../models/index.js';
import {
  findRerouteDestination,
  type ShelterInput,
  type DemandInput,
} from '@civicaid/shared';
import { DomainError } from '../middleware/index.js';
import { logOperationEvent } from './eventService.js';

export async function listShelters(): Promise<any[]> {
  const shelters = await Shelter.find().sort({ name: 1 }).lean();
  const demands = await Demand.find({ status: { $ne: 'CLOSED' } }).lean();
  return shelters.map((s) => ({
    ...s,
    demands: demands.filter((d) => d.shelterId.toString() === s._id.toString()),
  }));
}

export async function getShelterById(id: string): Promise<IShelter> {
  const shelter = await Shelter.findById(id);
  if (!shelter) {
    throw new DomainError('SHELTER_NOT_FOUND', `Shelter ${id} not found`, 404);
  }
  return shelter;
}

export async function getDemandsByShelterId(shelterId: string): Promise<IDemand[]> {
  return Demand.find({ shelterId }).sort({ createdAt: -1 });
}

export async function createDemand(
  shelterId: string,
  data: {
    aidType: any;
    requestedQuantity: number;
    requiredFacilities?: string[];
    expiresAt?: string | Date;
  },
): Promise<IDemand> {
  const shelter = await getShelterById(shelterId);

  const demand = await Demand.create({
    shelterId: shelter._id,
    aidType: data.aidType,
    requestedQuantity: data.requestedQuantity,
    fulfilledQuantity: 0,
    status: 'OPEN',
    requiredFacilities: data.requiredFacilities,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  });

  await logOperationEvent(
    'DEMAND_CREATED',
    'INFO',
    `Shelter ${shelter.name} created demand for ${demand.requestedQuantity} ${demand.aidType}`,
    'Demand',
    demand._id,
    { shelterId: shelter._id, aidType: demand.aidType, quantity: demand.requestedQuantity },
  );

  return demand;
}

export async function updateShelter(
  shelterId: string,
  data: Partial<{
    status: any;
    capacity: number;
    currentOccupancy: number;
    facilities: any;
    acceptedAidTypes: any[];
    contactName: string;
  }>,
): Promise<IShelter> {
  const shelter = await Shelter.findByIdAndUpdate(shelterId, { $set: data }, { new: true });
  if (!shelter) {
    throw new DomainError('SHELTER_NOT_FOUND', `Shelter ${shelterId} not found`, 404);
  }

  await logOperationEvent(
    'SHELTER_UPDATED',
    'INFO',
    `Shelter ${shelter.name} details updated`,
    'Shelter',
    shelter._id,
    data,
  );

  return shelter;
}

/**
 * Handle shelter status change (FULL or CLOSED) and automatically reroute in-flight deliveries.
 */
export async function changeShelterStatusAndReroute(
  shelterId: string,
  newStatus: 'FULL' | 'CLOSED',
): Promise<{
  shelter: IShelter;
  reroutedDeliveries: string[];
  failedDeliveries: string[];
}> {
  const shelter = await Shelter.findByIdAndUpdate(
    shelterId,
    { status: newStatus },
    { new: true },
  );
  if (!shelter) {
    throw new DomainError('SHELTER_NOT_FOUND', `Shelter ${shelterId} not found`, 404);
  }

  await logOperationEvent(
    newStatus === 'FULL' ? 'SHELTER_MARKED_FULL' : 'SHELTER_CLOSED',
    'WARNING',
    `Shelter ${shelter.name} marked as ${newStatus}`,
    'Shelter',
    shelter._id,
    { status: newStatus },
  );

  // Find all active demands for this shelter
  const shelterDemands = await Demand.find({ shelterId: shelter._id });
  const shelterDemandIds = shelterDemands.map((d) => d._id);

  // Find deliveries currently heading to this shelter
  const activeDeliveries = await Delivery.find({
    demandId: { $in: shelterDemandIds },
    status: { $in: ['CLAIMED', 'EN_ROUTE_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT'] },
  });

  const reroutedDeliveries: string[] = [];
  const failedDeliveries: string[] = [];

  if (activeDeliveries.length === 0) {
    return { shelter, reroutedDeliveries, failedDeliveries };
  }

  // Load candidate shelters and demands
  const allShelters = await Shelter.find({ _id: { $ne: shelter._id }, status: 'OPEN' });
  const allDemands = await Demand.find({
    shelterId: { $ne: shelter._id },
    status: { $in: ['OPEN', 'PARTIALLY_FULFILLED'] },
  });

  const shelterInputs: ShelterInput[] = allShelters.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    status: s.status,
    location: s.location,
    capacity: s.capacity,
    currentOccupancy: s.currentOccupancy,
    facilities: s.facilities,
    acceptedAidTypes: s.acceptedAidTypes,
  }));

  const demandInputs: DemandInput[] = allDemands.map((d) => ({
    id: d._id.toString(),
    shelterId: d.shelterId.toString(),
    aidType: d.aidType,
    quantityRequested: d.requestedQuantity,
    quantityFulfilled: d.fulfilledQuantity,
    status: d.status,
  }));

  for (const del of activeDeliveries) {
    const batch = await DonationBatch.findById(del.batchId);
    if (!batch) continue;

    // Get rider current location
    let riderLocation = del.pickupLocation;
    if (del.riderId) {
      const rider = await Rider.findById(del.riderId);
      if (rider) {
        riderLocation = rider.currentLocation;
      }
    }

    const decision = findRerouteDestination({
      delivery: {
        id: del._id.toString(),
        batchId: del.batchId.toString(),
        aidType: batch.aidType,
        quantity: del.quantity,
        handling: batch.handling,
        expiresAt: batch.expiresAt,
        currentShelterId: shelter._id.toString(),
      },
      riderLocation,
      shelters: shelterInputs,
      demands: demandInputs,
      nowMs: Date.now(),
    });

    if (decision.success && decision.newShelterId) {
      del.destinationLocation = decision.newDestination!;
      del.estimatedMinutes = decision.travelMinutes || del.estimatedMinutes;
      del.rerouteCount += 1;
      del.lastHeartbeatAt = new Date();

      if (decision.newDemandId) {
        del.demandId = new mongoose.Types.ObjectId(decision.newDemandId);
        await Demand.findByIdAndUpdate(decision.newDemandId, {
          $inc: { fulfilledQuantity: del.quantity },
        });
      }

      await del.save();
      reroutedDeliveries.push(del._id.toString());

      await logOperationEvent(
        'DELIVERY_REROUTED',
        'WARNING',
        `Rerouted delivery ${del._id} from ${shelter.name} to alternative shelter (${decision.reason})`,
        'Delivery',
        del._id,
        {
          fromShelterId: shelter._id,
          toShelterId: decision.newShelterId,
          travelMinutes: decision.travelMinutes,
        },
      );
    } else {
      del.status = 'RECOVERY_REQUIRED';
      del.failureReason = decision.reason;
      await del.save();
      failedDeliveries.push(del._id.toString());

      await logOperationEvent(
        'RECOVERY_REQUIRED',
        'CRITICAL',
        `No safe reroute destination available for delivery ${del._id}: ${decision.reason}`,
        'Delivery',
        del._id,
        { deliveryId: del._id, reason: decision.reason },
      );
    }
  }

  return { shelter, reroutedDeliveries, failedDeliveries };
}
