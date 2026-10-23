import mongoose, { Schema, type Document } from 'mongoose';
import type { ShelterStatus, AidType, GeoPoint, Facilities } from '@civicaid/shared';
import { SHELTER_STATUSES, AID_TYPES } from '@civicaid/shared';

export interface IShelter extends Document {
  name: string;
  status: ShelterStatus;
  location: GeoPoint;
  capacity: number;
  currentOccupancy: number;
  facilities: Facilities;
  acceptedAidTypes: AidType[];
  contactName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const shelterSchema = new Schema<IShelter>(
  {
    name: { type: String, required: true },
    status: { type: String, enum: SHELTER_STATUSES, default: 'OPEN' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    capacity: { type: Number, required: true, min: 1 },
    currentOccupancy: { type: Number, default: 0, min: 0 },
    facilities: {
      cleanWater: { type: Boolean, default: false },
      cookingFuel: { type: Boolean, default: false },
      refrigeration: { type: Boolean, default: false },
    },
    acceptedAidTypes: [{ type: String, enum: AID_TYPES }],
    contactName: { type: String },
  },
  { timestamps: true },
);

shelterSchema.index({ location: '2dsphere' });
shelterSchema.index({ status: 1 });

export const Shelter = mongoose.model<IShelter>('Shelter', shelterSchema);
