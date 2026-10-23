import { Rider, type IRider } from '../models/index.js';
import type { GeoPoint } from '@civicaid/shared';
import { DomainError } from '../middleware/index.js';

export async function listRiders(): Promise<IRider[]> {
  return Rider.find().populate('userId', 'name role').sort({ createdAt: 1 });
}

export async function getRiderById(id: string): Promise<IRider> {
  const rider = await Rider.findById(id).populate('userId', 'name role');
  if (!rider) {
    throw new DomainError('RIDER_NOT_FOUND', `Rider ${id} not found`, 404);
  }
  return rider;
}

export async function updateLocation(riderId: string, location: GeoPoint): Promise<IRider> {
  const rider = await Rider.findByIdAndUpdate(
    riderId,
    {
      currentLocation: location,
      lastHeartbeatAt: new Date(),
    },
    { new: true },
  );

  if (!rider) {
    throw new DomainError('RIDER_NOT_FOUND', `Rider ${riderId} not found`, 404);
  }

  return rider;
}
