import { Delivery, Rider, Shelter, Demand, type IDelivery } from '../models/index.js';
import { canTransitionDelivery, type DeliveryStatus, type GeoPoint } from '@civicaid/shared';
import { DomainError } from '../middleware/index.js';
import { logOperationEvent } from './eventService.js';

export async function listDeliveries(filter?: { status?: string; riderId?: string }): Promise<IDelivery[]> {
  const query: Record<string, unknown> = {};
  if (filter?.status) query.status = filter.status;
  if (filter?.riderId) query.riderId = filter.riderId;
  return Delivery.find(query)
    .populate({
      path: 'riderId',
      populate: { path: 'userId', select: 'name role' },
    })
    .populate({
      path: 'demandId',
      populate: { path: 'shelterId', select: 'name location facilities' },
    })
    .populate('batchId')
    .sort({ createdAt: -1 });
}

export async function getDeliveryById(id: string): Promise<IDelivery> {
  const delivery = await Delivery.findById(id)
    .populate({
      path: 'riderId',
      populate: { path: 'userId', select: 'name role' },
    })
    .populate({
      path: 'demandId',
      populate: { path: 'shelterId', select: 'name location facilities' },
    })
    .populate('batchId');
  if (!delivery) {
    throw new DomainError('DELIVERY_NOT_FOUND', `Delivery ${id} not found`, 404);
  }
  return delivery;
}

export async function claimDelivery(deliveryId: string, riderId?: string): Promise<IDelivery> {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    throw new DomainError('DELIVERY_NOT_FOUND', `Delivery ${deliveryId} not found`, 404);
  }

  if (delivery.status !== 'OFFERED') {
    throw new DomainError('DELIVERY_NOT_OFFERED', `Cannot claim delivery in status ${delivery.status}`, 400);
  }

  if (delivery.claimExpiresAt && delivery.claimExpiresAt.getTime() < Date.now()) {
    throw new DomainError('CLAIM_EXPIRED', 'Claim window for this delivery has expired', 400);
  }

  // If a riderId is given, ensure it matches assigned rider or assign it
  if (riderId && delivery.riderId && delivery.riderId.toString() !== riderId) {
    throw new DomainError('RIDER_MISMATCH', 'Delivery is offered to a different rider', 403);
  }

  delivery.status = 'CLAIMED';
  delivery.lastHeartbeatAt = new Date();
  await delivery.save();

  const assignedRiderId = delivery.riderId?.toString() || riderId;
  if (assignedRiderId) {
    await Rider.findByIdAndUpdate(assignedRiderId, {
      status: 'BUSY',
      activeDeliveryId: delivery._id,
      lastHeartbeatAt: new Date(),
    });
  }

  await logOperationEvent(
    'DELIVERY_CLAIMED',
    'INFO',
    `Delivery ${delivery._id} claimed by rider`,
    'Delivery',
    delivery._id,
    { riderId: assignedRiderId, quantity: delivery.quantity },
  );

  return delivery;
}

export async function recordHeartbeat(
  deliveryId: string,
  location?: GeoPoint,
): Promise<{ success: boolean; lastHeartbeatAt: Date }> {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    throw new DomainError('DELIVERY_NOT_FOUND', `Delivery ${deliveryId} not found`, 404);
  }

  const now = new Date();
  delivery.lastHeartbeatAt = now;
  await delivery.save();

  if (delivery.riderId) {
    const updatePayload: Record<string, unknown> = { lastHeartbeatAt: now };
    if (location) {
      updatePayload.currentLocation = location;
    }
    await Rider.findByIdAndUpdate(delivery.riderId, updatePayload);
  }

  return { success: true, lastHeartbeatAt: now };
}

export async function updateDeliveryStatus(
  deliveryId: string,
  newStatus: DeliveryStatus,
  location?: GeoPoint,
  note?: string,
): Promise<IDelivery> {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    throw new DomainError('DELIVERY_NOT_FOUND', `Delivery ${deliveryId} not found`, 404);
  }

  if (!canTransitionDelivery(delivery.status, newStatus)) {
    throw new DomainError(
      'ILLEGAL_STATUS_TRANSITION',
      `Cannot transition delivery from ${delivery.status} to ${newStatus}`,
      400,
    );
  }

  const prevStatus = delivery.status;
  delivery.status = newStatus;
  delivery.lastHeartbeatAt = new Date();

  if (newStatus === 'PICKED_UP') {
    delivery.pickedUpAt = new Date();
  }

  if (newStatus === 'DELIVERED') {
    delivery.deliveredAt = new Date();

    // Free rider
    if (delivery.riderId) {
      await Rider.findByIdAndUpdate(delivery.riderId, {
        status: 'AVAILABLE',
        activeDeliveryId: null,
      });
    }

    // Update shelter occupancy
    const demand = await Demand.findById(delivery.demandId);
    if (demand) {
      await Shelter.findByIdAndUpdate(demand.shelterId, {
        $inc: { currentOccupancy: delivery.quantity },
      });
    }
  }

  if (newStatus === 'CANCELLED') {
    if (delivery.riderId) {
      await Rider.findByIdAndUpdate(delivery.riderId, {
        status: 'AVAILABLE',
        activeDeliveryId: null,
      });
    }
  }

  await delivery.save();

  if (location && delivery.riderId) {
    await Rider.findByIdAndUpdate(delivery.riderId, {
      currentLocation: location,
      lastHeartbeatAt: new Date(),
    });
  }

  await logOperationEvent(
    'DELIVERY_STATUS_CHANGED',
    'INFO',
    `Delivery status changed from ${prevStatus} to ${newStatus}${note ? `: ${note}` : ''}`,
    'Delivery',
    delivery._id,
    { previousStatus: prevStatus, newStatus, note },
  );

  return delivery;
}
