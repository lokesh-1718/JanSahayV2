// ─── User Roles ──────────────────────────────────────────────
export const USER_ROLES = ['DONOR', 'RIDER', 'SHELTER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Aid Types ───────────────────────────────────────────────
export const AID_TYPES = [
  'COOKED_MEALS',
  'MEDICINE',
  'RAW_RATION',
  'INFANT_FORMULA',
  'ESSENTIAL_KIT',
] as const;
export type AidType = (typeof AID_TYPES)[number];

// ─── Batch Status ────────────────────────────────────────────
export const BATCH_STATUSES = [
  'DRAFT',
  'AVAILABLE',
  'PARTIALLY_ALLOCATED',
  'ALLOCATED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// ─── Delivery Status ─────────────────────────────────────────
export const DELIVERY_STATUSES = [
  'PENDING',
  'OFFERED',
  'CLAIMED',
  'EN_ROUTE_TO_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'REROUTING',
  'RECOVERY_REQUIRED',
  'DELIVERED',
  'REASSIGNED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// ─── Rider Status ────────────────────────────────────────────
export const RIDER_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'BUSY',
  'AFK',
  'OFFLINE',
] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

// ─── Shelter Status ──────────────────────────────────────────
export const SHELTER_STATUSES = ['OPEN', 'FULL', 'CLOSED', 'PAUSED'] as const;
export type ShelterStatus = (typeof SHELTER_STATUSES)[number];

// ─── Demand Status ───────────────────────────────────────────
export const DEMAND_STATUSES = [
  'OPEN',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'CLOSED',
] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

// ─── Operation Event Severity ────────────────────────────────
export const EVENT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

// ─── GeoJSON Point ───────────────────────────────────────────
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

// ─── Facility Requirements ───────────────────────────────────
export interface Facilities {
  cleanWater: boolean;
  cookingFuel: boolean;
  refrigeration: boolean;
}

// ─── Handling Requirements (on a batch) ──────────────────────
export interface HandlingRequirements {
  requiresCleanWater: boolean;
  requiresCookingFuel: boolean;
  requiresRefrigeration: boolean;
}
