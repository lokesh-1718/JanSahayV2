import { OperationEvent, type IOperationEvent } from '../models/index.js';
import { REALTIME_EVENTS, type EventSeverity } from '@civicaid/shared';
import { emitRealtimeEvent } from './socketService.js';

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

  emitRealtimeEvent(
    REALTIME_EVENTS.OPERATION_EVENT_CREATED,
    'OperationEvent',
    event._id.toString(),
    event,
  );

  return event;
}

