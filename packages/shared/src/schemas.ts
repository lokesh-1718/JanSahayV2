import { z } from 'zod';
import { AID_TYPES, BATCH_STATUSES, DELIVERY_STATUSES, RIDER_STATUSES, SHELTER_STATUSES, DEMAND_STATUSES } from './enums.js';

// ─── Reusable primitives ────────────────────────────────────
const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

const facilitiesSchema = z.object({
  cleanWater: z.boolean(),
  cookingFuel: z.boolean(),
  refrigeration: z.boolean(),
});

const handlingSchema = z.object({
  requiresCleanWater: z.boolean(),
  requiresCookingFuel: z.boolean(),
  requiresRefrigeration: z.boolean(),
});

const objectIdString = z.string().min(1, 'ID is required');

// ─── Create Donation Batch ──────────────────────────────────
export const createBatchSchema = z.object({
  donorId: objectIdString,
  aidType: z.enum(AID_TYPES),
  quantity: z.number().int().positive(),
  unit: z.string().min(1),
  pickupLocation: geoPointSchema,
  expiresAt: z.string().datetime().refine(
    (val) => new Date(val) > new Date(),
    { message: 'Expiry must be in the future' },
  ),
  handling: handlingSchema,
  notes: z.string().optional(),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

// ─── Create / Update Shelter Demand ─────────────────────────
export const createDemandSchema = z.object({
  shelterId: objectIdString,
  aidType: z.enum(AID_TYPES),
  requestedQuantity: z.number().int().positive(),
  requiredFacilities: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateDemandInput = z.infer<typeof createDemandSchema>;

export const updateDemandSchema = createDemandSchema.partial().omit({ shelterId: true });
export type UpdateDemandInput = z.infer<typeof updateDemandSchema>;

// ─── Update Shelter ─────────────────────────────────────────
export const updateShelterSchema = z.object({
  status: z.enum(SHELTER_STATUSES).optional(),
  capacity: z.number().int().positive().optional(),
  currentOccupancy: z.number().int().min(0).optional(),
  facilities: facilitiesSchema.optional(),
  acceptedAidTypes: z.array(z.enum(AID_TYPES)).optional(),
  contactName: z.string().optional(),
});
export type UpdateShelterInput = z.infer<typeof updateShelterSchema>;

// ─── Rider Location Update ──────────────────────────────────
export const riderLocationSchema = z.object({
  location: geoPointSchema,
});
export type RiderLocationInput = z.infer<typeof riderLocationSchema>;

// ─── Rider Heartbeat ────────────────────────────────────────
export const riderHeartbeatSchema = z.object({
  location: geoPointSchema.optional(),
});
export type RiderHeartbeatInput = z.infer<typeof riderHeartbeatSchema>;

// ─── Delivery Status Update ─────────────────────────────────
export const deliveryStatusSchema = z.object({
  status: z.enum(DELIVERY_STATUSES),
  location: geoPointSchema.optional(),
  note: z.string().optional(),
});
export type DeliveryStatusInput = z.infer<typeof deliveryStatusSchema>;

// ─── Simulation Commands ────────────────────────────────────
export const advanceTimeSchema = z.object({
  minutes: z.number().int().positive().max(120),
});
export type AdvanceTimeInput = z.infer<typeof advanceTimeSchema>;

export const simulateAfkSchema = z.object({
  riderId: objectIdString,
});
export type SimulateAfkInput = z.infer<typeof simulateAfkSchema>;

// ─── API Error Shape ────────────────────────────────────────
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ─── Error Codes ────────────────────────────────────────────
export const ERROR_CODES = {
  BATCH_EXPIRED: 'BATCH_EXPIRED',
  UNSAFE_ARRIVAL_TIME: 'UNSAFE_ARRIVAL_TIME',
  SHELTER_INCOMPATIBLE: 'SHELTER_INCOMPATIBLE',
  SHELTER_FULL: 'SHELTER_FULL',
  SHELTER_CLOSED: 'SHELTER_CLOSED',
  DELIVERY_ALREADY_CLAIMED: 'DELIVERY_ALREADY_CLAIMED',
  CLAIM_WINDOW_EXPIRED: 'CLAIM_WINDOW_EXPIRED',
  RIDER_UNRESPONSIVE: 'RIDER_UNRESPONSIVE',
  NO_SAFE_REROUTE: 'NO_SAFE_REROUTE',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
