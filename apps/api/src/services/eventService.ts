import { OperationEvent, type IOperationEvent } from '../models/index.js';
import type { EventSeverity } from '@civicaid/shared';

export async function logOperationEvent(
  type: string,
  severity: EventSeverity,
  message: string,
  entityType: string,
  entityId?: any,
  metadata?: Record<string, unknown>,
): Promise<IOperationEvent> {
  const event = await OperationEvent.create({
    type,
    severity,
    message,
    entityType,
    entityId,
    metadata,
  });

  return event;
}
