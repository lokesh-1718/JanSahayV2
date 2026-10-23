import mongoose, { Schema, type Document } from 'mongoose';
import type { UserRole } from '@civicaid/shared';
import { USER_ROLES } from '@civicaid/shared';

export interface IUser extends Document {
  name: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, required: true },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>('User', userSchema);
