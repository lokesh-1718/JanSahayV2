import mongoose, { Schema, type Document, type Types } from 'mongoose';
import type { RiderStatus, GeoPoint } from '@civicaid/shared';
import { RIDER_STATUSES } from '@civicaid/shared';

export interface IRider extends Document {
  userId: Types.ObjectId;
  status: RiderStatus;
  vehicleCapacity: number;
  currentLocation: GeoPoint;
  lastHeartbeatAt: Date;
  maxRadiusKm: number;
  activeDeliveryId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const riderSchema = new Schema<IRider>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RIDER_STATUSES, default: 'AVAILABLE' },
    vehicleCapacity: { type: Number, required: true, min: 1 },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    lastHeartbeatAt: { type: Date, default: Date.now },
    maxRadiusKm: { type: Number, default: 15 },
    activeDeliveryId: { type: Schema.Types.ObjectId, ref: 'Delivery' },
  },
  { timestamps: true },
);

riderSchema.index({ currentLocation: '2dsphere' });
riderSchema.index({ status: 1 });

export const Rider = mongoose.model<IRider>('Rider', riderSchema);
