import {
  DonationBatch,
  Delivery,
  Shelter,
  Rider,
  OperationEvent,
  type IOperationEvent,
} from '../models/index.js';

export interface OperationsSummary {
  totalActiveBatches: number;
  activeDeliveries: number;
  openShelters: number;
  availableRiders: number;
  atRiskDeliveries: number;
  criticalEventsCount: number;
}

export async function getSummary(): Promise<OperationsSummary> {
  const [
    totalActiveBatches,
    activeDeliveries,
    openShelters,
    availableRiders,
    atRiskDeliveries,
    criticalEventsCount,
  ] = await Promise.all([
    DonationBatch.countDocuments({ status: { $in: ['AVAILABLE', 'PARTIALLY_ALLOCATED'] } }),
    Delivery.countDocuments({
      status: { $in: ['OFFERED', 'CLAIMED', 'EN_ROUTE_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'REROUTING'] },
    }),
    Shelter.countDocuments({ status: 'OPEN' }),
    Rider.countDocuments({ status: 'AVAILABLE' }),
    Delivery.countDocuments({ status: 'RECOVERY_REQUIRED' }),
    OperationEvent.countDocuments({ severity: 'CRITICAL' }),
  ]);

  return {
    totalActiveBatches,
    activeDeliveries,
    openShelters,
    availableRiders,
    atRiskDeliveries,
    criticalEventsCount,
  };
}

export async function listEvents(limit: number = 50): Promise<IOperationEvent[]> {
  return OperationEvent.find().sort({ createdAt: -1 }).limit(limit);
}
