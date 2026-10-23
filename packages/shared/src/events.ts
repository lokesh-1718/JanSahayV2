/**
 * Socket.IO event names used across backend and frontend.
 * The client should treat these as invalidation signals and refetch data.
 */
export const REALTIME_EVENTS = {
  // ─── Batch events ───────────────────────────────────────
  BATCH_CREATED: 'BATCH_CREATED',
  BATCH_UPDATED: 'BATCH_UPDATED',

  // ─── Matching events ───────────────────────────────────
  MATCH_PLAN_CREATED: 'MATCH_PLAN_CREATED',

  // ─── Delivery events ───────────────────────────────────
  DELIVERY_OFFERED: 'DELIVERY_OFFERED',
  DELIVERY_CLAIMED: 'DELIVERY_CLAIMED',
  DELIVERY_STATUS_CHANGED: 'DELIVERY_STATUS_CHANGED',
  DELIVERY_REQUEUED: 'DELIVERY_REQUEUED',
  DELIVERY_REROUTED: 'DELIVERY_REROUTED',
  DELIVERY_RECOVERY_FAILED: 'DELIVERY_RECOVERY_FAILED',

  // ─── Rider events ──────────────────────────────────────
  RIDER_LOCATION_UPDATED: 'RIDER_LOCATION_UPDATED',
  RIDER_DECLARED_AFK: 'RIDER_DECLARED_AFK',

  // ─── Shelter events ────────────────────────────────────
  SHELTER_STATUS_CHANGED: 'SHELTER_STATUS_CHANGED',

  // ─── Operations events ─────────────────────────────────
  OPERATION_EVENT_CREATED: 'OPERATION_EVENT_CREATED',
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/**
 * Socket.IO room helpers.
 */
export const ROOMS = {
  operations: 'operations',
  shelter: (id: string) => `shelter:${id}`,
  rider: (id: string) => `rider:${id}`,
  batch: (id: string) => `batch:${id}`,
} as const;

/**
 * Payload wrapper sent on every socket event.
 */
export interface RealtimePayload<T = unknown> {
  event: RealtimeEvent;
  entityType: string;
  entityId?: string;
  data: T;
  timestamp: string;
}
