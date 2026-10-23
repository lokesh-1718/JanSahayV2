import { seedDatabase } from '../seed.js';
import {
  Rider,
  Delivery,
  Demand,
  DonationBatch,
  User,
  OperationEvent,
  Shelter,
} from '../models/index.js';
import { isHeartbeatStale } from '@civicaid/shared';
import { DomainError } from '../middleware/index.js';
import { logOperationEvent } from './eventService.js';

export async function seedDemo(): Promise<{ success: boolean; message: string }> {
  await seedDatabase(false);
  return { success: true, message: 'Deterministic demo scenario seeded successfully' };
}

export async function resetDemo(): Promise<{ success: boolean; message: string }> {
  await Promise.all([
    Delivery.deleteMany({}),
    DonationBatch.deleteMany({}),
    Demand.deleteMany({}),
    Shelter.deleteMany({}),
    Rider.deleteMany({}),
    User.deleteMany({}),
    OperationEvent.deleteMany({}),
  ]);
  await seedDatabase(false);
  return { success: true, message: 'Scenario reset and reseeded with clean state' };
}

/**
 * Watchdog: inspects active deliveries, revokes expired claims,
 * detects AFK riders, and handles reassignments or recovery.
 */
export async function runWatchdog(nowMs: number = Date.now()): Promise<{
  expiredOffers: number;
  afkRiders: number;
  reassignedDeliveries: number;
  recoveryRequiredDeliveries: number;
}> {
  let expiredOffers = 0;
  let afkRiders = 0;
  let reassignedDeliveries = 0;
  let recoveryRequiredDeliveries = 0;

  // 1. Expire unclaimed offers
  const staleOffers = await Delivery.find({
    status: 'OFFERED',
    claimExpiresAt: { $lt: new Date(nowMs) },
  });

  for (const del of staleOffers) {
    del.status = 'CANCELLED';
    del.failureReason = 'Rider offer claim window expired';
    await del.save();

    if (del.riderId) {
      await Rider.findByIdAndUpdate(del.riderId, {
        status: 'AVAILABLE',
        activeDeliveryId: null,
      });
    }

    // Return fulfilled quantity back to demand
    await Demand.findByIdAndUpdate(del.demandId, {
      $inc: { fulfilledQuantity: -del.quantity },
      $set: { status: 'OPEN' },
    });

    // Return quantity to batch
    await DonationBatch.findByIdAndUpdate(del.batchId, {
      $inc: { remainingQuantity: del.quantity },
      $set: { status: 'AVAILABLE' },
    });

    expiredOffers++;
    await logOperationEvent(
      'DELIVERY_OFFER_EXPIRED',
      'WARNING',
      `Claim window expired for delivery ${del._id}; returned ${del.quantity} to batch`,
      'Delivery',
      del._id,
    );
  }

  // 2. Detect AFK riders on active deliveries
  const activeDeliveries = await Delivery.find({
    status: { $in: ['CLAIMED', 'EN_ROUTE_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT'] },
    riderId: { $ne: null },
  }).populate('riderId');

  for (const del of activeDeliveries) {
    const rider = del.riderId as any;
    if (!rider || !rider.lastHeartbeatAt) continue;

    const lastHeartbeatMs = new Date(rider.lastHeartbeatAt).getTime();
    if (isHeartbeatStale(lastHeartbeatMs, nowMs, 60)) {
      // Mark rider AFK
      await Rider.findByIdAndUpdate(rider._id, { status: 'AFK' });
      afkRiders++;

      await logOperationEvent(
        'RIDER_DECLARED_AFK',
        'CRITICAL',
        `Rider ${rider._id} declared AFK (no heartbeat for >60s)`,
        'Rider',
        rider._id,
        { deliveryId: del._id, lastHeartbeat: rider.lastHeartbeatAt },
      );

      // If food not picked up yet, revoke reservation and reassign/reoffer!
      if (del.status === 'CLAIMED' || del.status === 'EN_ROUTE_TO_PICKUP') {
        // Find another available rider
        const alternativeRider = await Rider.findOne({
          _id: { $ne: rider._id },
          status: 'AVAILABLE',
          vehicleCapacity: { $gte: del.quantity },
          activeDeliveryId: { $in: [null, undefined] },
        });

        if (alternativeRider) {
          del.riderId = alternativeRider._id;
          del.status = 'OFFERED';
          del.claimExpiresAt = new Date(nowMs + 3 * 60_000);
          del.lastHeartbeatAt = new Date(nowMs);
          await del.save();

          await Rider.findByIdAndUpdate(alternativeRider._id, {
            status: 'RESERVED',
            activeDeliveryId: del._id,
          });

          reassignedDeliveries++;
          await logOperationEvent(
            'DELIVERY_REASSIGNED',
            'WARNING',
            `Delivery ${del._id} revoked from AFK rider and reoffered to rider ${alternativeRider._id}`,
            'Delivery',
            del._id,
            { oldRiderId: rider._id, newRiderId: alternativeRider._id },
          );
        } else {
          // No immediate rider available, keep in OFFERED or queue
          del.status = 'PENDING';
          del.riderId = undefined;
          await del.save();

          reassignedDeliveries++;
          await logOperationEvent(
            'DELIVERY_UNASSIGNED',
            'WARNING',
            `Delivery ${del._id} revoked from AFK rider; queued for matching`,
            'Delivery',
            del._id,
          );
        }
      } else if (del.status === 'PICKED_UP' || del.status === 'IN_TRANSIT') {
        // Aid is physically with the unresponsive rider! Needs urgent human intervention
        del.status = 'RECOVERY_REQUIRED';
        del.failureReason = 'Rider became unresponsive while carrying perishable aid';
        await del.save();
        recoveryRequiredDeliveries++;

        await logOperationEvent(
          'RECOVERY_REQUIRED',
          'CRITICAL',
          `Perishable aid in transit with unresponsive rider ${rider._id}! Immediate manual recovery required.`,
          'Delivery',
          del._id,
          { riderId: rider._id, quantity: del.quantity },
        );
      }
    }
  }

  return {
    expiredOffers,
    afkRiders,
    reassignedDeliveries,
    recoveryRequiredDeliveries,
  };
}

export async function advanceTime(minutes: number): Promise<{
  advancedMinutes: number;
  watchdogResult: Awaited<ReturnType<typeof runWatchdog>>;
}> {
  const simulatedNowMs = Date.now() + minutes * 60_000;
  const watchdogResult = await runWatchdog(simulatedNowMs);

  await logOperationEvent(
    'TIME_ADVANCED',
    'INFO',
    `Simulation clock advanced by ${minutes} minutes`,
    'System',
    undefined,
    { minutes, watchdogResult },
  );

  return { advancedMinutes: minutes, watchdogResult };
}

export async function simulateAfk(riderId: string): Promise<{
  success: boolean;
  riderId: string;
  watchdogResult: Awaited<ReturnType<typeof runWatchdog>>;
}> {
  const rider = await Rider.findById(riderId);
  if (!rider) {
    throw new DomainError('RIDER_NOT_FOUND', `Rider ${riderId} not found`, 404);
  }

  // Set last heartbeat to 120 seconds in the past to guarantee staleness
  const staleTime = new Date(Date.now() - 120_000);
  rider.lastHeartbeatAt = staleTime;
  await rider.save();

  // Run watchdog to trigger AFK logic immediately
  const watchdogResult = await runWatchdog(Date.now());

  return {
    success: true,
    riderId,
    watchdogResult,
  };
}
