import mongoose, { Schema, type Document, type Types } from 'mongoose';
import type { AidType, DemandStatus } from '@civicaid/shared';
import { AID_TYPES, DEMAND_STATUSES } from '@civicaid/shared';

export interface IDemand extends Document {
  shelterId: Types.ObjectId;
  aidType: AidType;
  requestedQuantity: number;
  fulfilledQuantity: number;
  status: DemandStatus;
  requiredFacilities?: string[];
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const demandSchema = new Schema<IDemand>(
  {
    shelterId: { type: Schema.Types.ObjectId, ref: 'Shelter', required: true },
    aidType: { type: String, enum: AID_TYPES, required: true },
    requestedQuantity: { type: Number, required: true, min: 1 },
    fulfilledQuantity: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: DEMAND_STATUSES, default: 'OPEN' },
    requiredFacilities: [{ type: String }],
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

demandSchema.index({ shelterId: 1, status: 1 });
demandSchema.index({ aidType: 1, status: 1 });

/** Virtual: remaining quantity still needed */
demandSchema.virtual('remainingQuantity').get(function (this: IDemand) {
  return this.requestedQuantity - this.fulfilledQuantity;
});

export const Demand = mongoose.model<IDemand>('Demand', demandSchema);
