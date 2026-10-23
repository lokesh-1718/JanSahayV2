import mongoose, { Schema, type Document, type Types } from 'mongoose';
import type { AidType, BatchStatus, GeoPoint, HandlingRequirements } from '@civicaid/shared';
import { AID_TYPES, BATCH_STATUSES } from '@civicaid/shared';

export interface IDonationBatch extends Document {
  donorId: Types.ObjectId;
  aidType: AidType;
  quantity: number;
  remainingQuantity: number;
  unit: string;
  pickupLocation: GeoPoint;
  expiresAt: Date;
  handling: HandlingRequirements;
  status: BatchStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const donationBatchSchema = new Schema<IDonationBatch>(
  {
    donorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    aidType: { type: String, enum: AID_TYPES, required: true },
    quantity: { type: Number, required: true, min: 1 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    pickupLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    expiresAt: { type: Date, required: true },
    handling: {
      requiresCleanWater: { type: Boolean, default: false },
      requiresCookingFuel: { type: Boolean, default: false },
      requiresRefrigeration: { type: Boolean, default: false },
    },
    status: { type: String, enum: BATCH_STATUSES, default: 'AVAILABLE' },
    notes: { type: String },
  },
  { timestamps: true },
);

donationBatchSchema.index({ status: 1, expiresAt: 1 });
donationBatchSchema.index({ pickupLocation: '2dsphere' });

export const DonationBatch = mongoose.model<IDonationBatch>('DonationBatch', donationBatchSchema);
