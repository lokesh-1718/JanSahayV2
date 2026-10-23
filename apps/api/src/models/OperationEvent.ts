import mongoose, { Schema, type Document, type Types } from 'mongoose';
import type { EventSeverity } from '@civicaid/shared';
import { EVENT_SEVERITIES } from '@civicaid/shared';

export interface IOperationEvent extends Document {
  type: string;
  severity: EventSeverity;
  message: string;
  entityType: string;
  entityId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const operationEventSchema = new Schema<IOperationEvent>(
  {
    type: { type: String, required: true },
    severity: { type: String, enum: EVENT_SEVERITIES, default: 'INFO' },
    message: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
  },
);

operationEventSchema.index({ createdAt: -1 });
operationEventSchema.index({ entityType: 1, entityId: 1 });

export const OperationEvent = mongoose.model<IOperationEvent>('OperationEvent', operationEventSchema);
