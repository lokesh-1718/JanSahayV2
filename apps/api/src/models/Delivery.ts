import mongoose, { Schema, type Document, type Types } from 'mongoose';
import type { DeliveryStatus, GeoPoint } from '@civicaid/shared';
import { DELIVERY_STATUSES } from '@civicaid/shared';

export interface IDelivery extends Document {
  batchId: Types.ObjectId;
  demandId: Types.ObjectId;
  riderId?: Types.ObjectId;
  quantity: number;
  status: DeliveryStatus;
  pickupLocation: GeoPoint;
  destinationLocation: GeoPoint;
  estimatedMinutes: number;
  claimExpiresAt?: Date;
  lastHeartbeatAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  rerouteCount: number;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<IDelivery>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'DonationBatch', required: true },
    demandId: { type: Schema.Types.ObjectId, ref: 'Demand', required: true },
    riderId: { type: Schema.Types.ObjectId, ref: 'Rider' },
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'PENDING' },
    pickupLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    destinationLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    estimatedMinutes: { type: Number, required: true, min: 0 },
    claimExpiresAt: { type: Date },
    lastHeartbeatAt: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    rerouteCount: { type: Number, default: 0 },
    failureReason: { type: String },
  },
  { timestamps: true },
);

deliverySchema.index({ status: 1 });
deliverySchema.index({ riderId: 1, status: 1 });
deliverySchema.index({ batchId: 1 });
deliverySchema.index({ claimExpiresAt: 1 }, { sparse: true });
deliverySchema.index({ lastHeartbeatAt: 1 }, { sparse: true });

export const Delivery = mongoose.model<IDelivery>('Delivery', deliverySchema);
