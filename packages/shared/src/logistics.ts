import type {
  AidType,
  Facilities,
  HandlingRequirements,
  GeoPoint,
  DeliveryStatus,
  ShelterStatus,
  BatchStatus,
  DemandStatus,
  RiderStatus,
} from './enums.js';

// ─── Constants ───────────────────────────────────────────────
/** Default safety buffer in minutes added to travel time */
export const SAFETY_BUFFER_MINUTES = 5;

/** Default claim window for a rider reservation in seconds */
export const CLAIM_WINDOW_SECONDS = 180; // 3 minutes live, override in demo

/** Heartbeat timeout in seconds */
export const HEARTBEAT_TIMEOUT_SECONDS = 60;

/** Average speed assumption for straight-line ETA (km/h) */
export const AVG_SPEED_KMH = 30;

// ─── Facility Compatibility ─────────────────────────────────
/**
 * Returns true when the shelter's facilities satisfy the batch's
 * handling requirements for the given aid type.
 */
export function isFacilityCompatible(
  aidType: AidType,
  handling: HandlingRequirements,
  facilities: Facilities,
): boolean {
  switch (aidType) {
    case 'RAW_RATION':
      // Raw ration always requires clean water + cooking fuel
      return facilities.cleanWater && facilities.cookingFuel;

    case 'INFANT_FORMULA':
      // Infant formula always requires clean water, refrigeration if batch says so
      if (!facilities.cleanWater) return false;
      if (handling.requiresRefrigeration && !facilities.refrigeration) return false;
      return true;

    case 'MEDICINE':
      // Refrigeration if the batch requires it
      if (handling.requiresRefrigeration && !facilities.refrigeration) return false;
      return true;

    case 'COOKED_MEALS':
    case 'ESSENTIAL_KIT':
      // No special facility requirements beyond shelter accepting the type
      return true;

    default:
      return false;
  }
}

// ─── Expiry / Safe Arrival ───────────────────────────────────
/**
 * Returns true when the delivery can arrive before the batch expires,
 * including the safety buffer.
 */
export function canArriveBeforeExpiry(
  nowMs: number,
  expiresAtMs: number,
  travelMinutes: number,
  safetyBufferMinutes: number = SAFETY_BUFFER_MINUTES,
): boolean {
  const arrivalMs = nowMs + (travelMinutes + safetyBufferMinutes) * 60_000;
  return arrivalMs < expiresAtMs;
}

// ─── Distance & ETA ──────────────────────────────────────────
/**
 * Haversine distance between two GeoJSON points in kilometres.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const [lon1, lat1] = a.coordinates;
  const [lon2, lat2] = b.coordinates;
  const R = 6_371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinHalf = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const aVal =
    sinHalf * sinHalf +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinHalfLon * sinHalfLon;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Straight-line travel time estimate in minutes.
 */
export function estimateTravelMinutes(
  from: GeoPoint,
  to: GeoPoint,
  speedKmh: number = AVG_SPEED_KMH,
): number {
  const km = haversineKm(from, to);
  return (km / speedKmh) * 60;
}

// ─── Quantity Splitting ──────────────────────────────────────
/**
 * Returns the quantity to allocate for a single delivery task.
 */
export function splitQuantity(
  batchRemaining: number,
  demandRemaining: number,
  riderCapacity: number,
): number {
  return Math.min(batchRemaining, demandRemaining, riderCapacity);
}

// ─── Heartbeat Staleness ─────────────────────────────────────
/**
 * Returns true when the rider's last heartbeat exceeds the timeout.
 */
export function isHeartbeatStale(
  lastHeartbeatMs: number,
  nowMs: number,
  timeoutSeconds: number = HEARTBEAT_TIMEOUT_SECONDS,
): boolean {
  return nowMs - lastHeartbeatMs > timeoutSeconds * 1_000;
}

// ─── Status Transition Validation ────────────────────────────
const VALID_DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['OFFERED', 'CANCELLED', 'EXPIRED'],
  OFFERED: ['CLAIMED', 'CANCELLED', 'EXPIRED'],
  CLAIMED: ['EN_ROUTE_TO_PICKUP', 'REASSIGNED', 'CANCELLED', 'EXPIRED'],
  EN_ROUTE_TO_PICKUP: ['PICKED_UP', 'REASSIGNED', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'REROUTING', 'RECOVERY_REQUIRED', 'CANCELLED'],
  REROUTING: ['IN_TRANSIT', 'RECOVERY_REQUIRED', 'CANCELLED'],
  RECOVERY_REQUIRED: ['IN_TRANSIT', 'CANCELLED'],
  DELIVERED: [],
  REASSIGNED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/**
 * Returns true when the delivery status transition is legal.
 */
export function canTransitionDelivery(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return VALID_DELIVERY_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Input and candidate types ──────────────────────────────
export interface BatchInput {
  id: string;
  aidType: AidType;
  quantity: number;
  remainingQuantity: number;
  pickupLocation: GeoPoint;
  expiresAt: Date | string | number;
  handling: HandlingRequirements;
  status?: BatchStatus;
}

export interface ShelterInput {
  id: string;
  name?: string;
  status: ShelterStatus;
  location: GeoPoint;
  capacity: number;
  currentOccupancy: number;
  facilities: Facilities;
  acceptedAidTypes: AidType[];
}

export interface DemandInput {
  id: string;
  shelterId: string;
  aidType: AidType;
  quantityRequested: number;
  quantityFulfilled: number;
  status: DemandStatus | string;
  urgencyLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface RiderInput {
  id: string;
  status: RiderStatus;
  vehicleCapacity: number;
  currentLocation: GeoPoint;
  activeDeliveryId?: string | null;
}

export interface CandidateShelter {
  shelterId: string;
  demandId: string;
  aidType: AidType;
  demandRemaining: number;
  shelterCapacityRemaining: number;
  location: GeoPoint;
  travelMinutes: number;
  urgencyRatio: number; // remaining / capacity
}

export interface CandidateRider {
  riderId: string;
  capacity: number;
  location: GeoPoint;
  distanceKm: number;
}

export interface MatchAllocation {
  riderId: string;
  shelterId: string;
  demandId: string;
  quantity: number;
  travelMinutes: number;
}

export interface MatchPlan {
  batchId: string;
  allocations: MatchAllocation[];
  totalAllocated: number;
  unallocatedQuantity: number;
  rejections: MatchRejection[];
}

export interface MatchRejection {
  shelterId?: string;
  riderId?: string;
  reason: string;
}

export interface RerouteDecision {
  success: boolean;
  newShelterId?: string;
  newDemandId?: string;
  newDestination?: GeoPoint;
  travelMinutes?: number;
  reason: string;
}

// ─── Candidate Filters ───────────────────────────────────────

/**
 * Filter shelters and demands that meet hard safety and compatibility requirements.
 */
export function getEligibleShelters(
  batch: BatchInput,
  shelters: ShelterInput[],
  demands: DemandInput[],
  nowMs: number = Date.now(),
  safetyBufferMinutes: number = SAFETY_BUFFER_MINUTES,
): CandidateShelter[] {
  const expiresAtMs = new Date(batch.expiresAt).getTime();
  if (expiresAtMs <= nowMs) {
    return [];
  }

  const candidates: CandidateShelter[] = [];

  for (const shelter of shelters) {
    if (shelter.status !== 'OPEN') continue;

    const capacityRemaining = shelter.capacity - shelter.currentOccupancy;
    if (capacityRemaining <= 0) continue;

    if (!shelter.acceptedAidTypes.includes(batch.aidType)) continue;

    if (!isFacilityCompatible(batch.aidType, batch.handling, shelter.facilities)) continue;

    const matchingDemands = demands.filter(
      (d) =>
        d.shelterId === shelter.id &&
        d.aidType === batch.aidType &&
        (d.status === 'OPEN' || d.status === 'PARTIALLY_FULFILLED') &&
        d.quantityRequested - d.quantityFulfilled > 0,
    );

    for (const demand of matchingDemands) {
      const demandRemaining = demand.quantityRequested - demand.quantityFulfilled;
      const travelMinutes = estimateTravelMinutes(batch.pickupLocation, shelter.location);

      if (!canArriveBeforeExpiry(nowMs, expiresAtMs, travelMinutes, safetyBufferMinutes)) {
        continue;
      }

      const urgencyRatio = demandRemaining / Math.max(1, shelter.capacity);

      candidates.push({
        shelterId: shelter.id,
        demandId: demand.id,
        aidType: batch.aidType,
        demandRemaining,
        shelterCapacityRemaining: capacityRemaining,
        location: shelter.location,
        travelMinutes,
        urgencyRatio,
      });
    }
  }

  return candidates;
}

/**
 * Filter riders who are available and ready to accept deliveries.
 */
export function getEligibleRiders(
  pickupLocation: GeoPoint,
  riders: RiderInput[],
): CandidateRider[] {
  return riders
    .filter((r) => r.status === 'AVAILABLE' && r.vehicleCapacity > 0 && !r.activeDeliveryId)
    .map((r) => ({
      riderId: r.id,
      capacity: r.vehicleCapacity,
      location: r.currentLocation,
      distanceKm: haversineKm(r.currentLocation, pickupLocation),
    }));
}

// ─── Candidate Ranking ───────────────────────────────────────

export function rankShelterCandidates(candidates: CandidateShelter[]): CandidateShelter[] {
  return [...candidates].sort((a, b) => {
    // Primary: highest urgency ratio
    if (Math.abs(b.urgencyRatio - a.urgencyRatio) > 0.001) {
      return b.urgencyRatio - a.urgencyRatio;
    }
    // Secondary: shortest travel time
    return a.travelMinutes - b.travelMinutes;
  });
}

export function rankRiderCandidates(candidates: CandidateRider[]): CandidateRider[] {
  return [...candidates].sort((a, b) => a.distanceKm - b.distanceKm);
}

// ─── Matching Engine ─────────────────────────────────────────

export interface BuildMatchPlanInput {
  batch: BatchInput;
  shelters: ShelterInput[];
  demands: DemandInput[];
  riders: RiderInput[];
  nowMs?: number;
  safetyBufferMinutes?: number;
}

/**
 * Greedy matching algorithm: applies hard safety checks, ranks candidates,
 * and splits quantities across riders respecting shelter demand & capacity limits.
 */
export function buildMatchPlan(input: BuildMatchPlanInput): MatchPlan {
  const { batch, shelters, demands, riders, nowMs = Date.now(), safetyBufferMinutes = SAFETY_BUFFER_MINUTES } = input;
  const expiresAtMs = new Date(batch.expiresAt).getTime();
  const rejections: MatchRejection[] = [];

  if (expiresAtMs <= nowMs) {
    rejections.push({ reason: 'Batch is already expired' });
    return {
      batchId: batch.id,
      allocations: [],
      totalAllocated: 0,
      unallocatedQuantity: batch.remainingQuantity,
      rejections,
    };
  }

  const eligibleShelters = getEligibleShelters(batch, shelters, demands, nowMs, safetyBufferMinutes);
  if (eligibleShelters.length === 0) {
    rejections.push({ reason: 'No eligible shelters with compatible facilities, capacity, and safe ETA' });
  }

  const eligibleRiders = getEligibleRiders(batch.pickupLocation, riders);
  if (eligibleRiders.length === 0) {
    rejections.push({ reason: 'No available riders' });
  }

  const rankedShelters = rankShelterCandidates(eligibleShelters);
  const availableRiders = rankRiderCandidates(eligibleRiders);

  let batchRemaining = batch.remainingQuantity;
  const allocations: MatchAllocation[] = [];

  const shelterCapacityRemainingMap = new Map<string, number>();
  for (const s of shelters) {
    shelterCapacityRemainingMap.set(s.id, Math.max(0, s.capacity - s.currentOccupancy));
  }

  const demandRemainingMap = new Map<string, number>();
  for (const d of demands) {
    demandRemainingMap.set(d.id, Math.max(0, d.quantityRequested - d.quantityFulfilled));
  }

  let riderIdx = 0;

  for (const shelterCand of rankedShelters) {
    if (batchRemaining <= 0) break;
    if (riderIdx >= availableRiders.length) {
      rejections.push({ reason: 'Insufficient available riders to fulfill remaining quantity' });
      break;
    }

    let shelterCap = shelterCapacityRemainingMap.get(shelterCand.shelterId) ?? 0;
    let demandRem = demandRemainingMap.get(shelterCand.demandId) ?? 0;

    while (batchRemaining > 0 && demandRem > 0 && shelterCap > 0 && riderIdx < availableRiders.length) {
      const rider = availableRiders[riderIdx];
      const allocQty = splitQuantity(batchRemaining, demandRem, Math.min(shelterCap, rider.capacity));

      if (allocQty <= 0) break;

      allocations.push({
        riderId: rider.riderId,
        shelterId: shelterCand.shelterId,
        demandId: shelterCand.demandId,
        quantity: allocQty,
        travelMinutes: Math.round(shelterCand.travelMinutes * 10) / 10,
      });

      batchRemaining -= allocQty;
      demandRem -= allocQty;
      shelterCap -= allocQty;

      shelterCapacityRemainingMap.set(shelterCand.shelterId, shelterCap);
      demandRemainingMap.set(shelterCand.demandId, demandRem);

      riderIdx++;
    }
  }

  const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0);

  return {
    batchId: batch.id,
    allocations,
    totalAllocated,
    unallocatedQuantity: batchRemaining,
    rejections,
  };
}

// ─── Rerouting Logic ─────────────────────────────────────────

export interface FindRerouteInput {
  delivery: {
    id: string;
    batchId: string;
    aidType: AidType;
    quantity: number;
    handling: HandlingRequirements;
    expiresAt: Date | string | number;
    currentShelterId: string;
  };
  riderLocation: GeoPoint;
  shelters: ShelterInput[];
  demands: DemandInput[];
  nowMs?: number;
  safetyBufferMinutes?: number;
}

/**
 * Finds a suitable alternative destination when a destination shelter becomes full/closed.
 */
export function findRerouteDestination(input: FindRerouteInput): RerouteDecision {
  const { delivery, riderLocation, shelters, demands, nowMs = Date.now(), safetyBufferMinutes = SAFETY_BUFFER_MINUTES } = input;
  const expiresAtMs = new Date(delivery.expiresAt).getTime();

  const candidates: Array<{
    shelter: ShelterInput;
    demand?: DemandInput;
    travelMinutes: number;
  }> = [];

  for (const shelter of shelters) {
    if (shelter.id === delivery.currentShelterId) continue;
    if (shelter.status !== 'OPEN') continue;

    const capacityRemaining = shelter.capacity - shelter.currentOccupancy;
    if (capacityRemaining < delivery.quantity) continue;

    if (!shelter.acceptedAidTypes.includes(delivery.aidType)) continue;

    if (!isFacilityCompatible(delivery.aidType, delivery.handling, shelter.facilities)) continue;

    const travelMinutes = estimateTravelMinutes(riderLocation, shelter.location);
    if (!canArriveBeforeExpiry(nowMs, expiresAtMs, travelMinutes, safetyBufferMinutes)) continue;

    const matchingDemand = demands.find(
      (d) =>
        d.shelterId === shelter.id &&
        d.aidType === delivery.aidType &&
        (d.status === 'OPEN' || d.status === 'PARTIALLY_FULFILLED') &&
        d.quantityRequested - d.quantityFulfilled >= delivery.quantity,
    );

    candidates.push({
      shelter,
      demand: matchingDemand,
      travelMinutes,
    });
  }

  if (candidates.length === 0) {
    return {
      success: false,
      reason: 'No compatible, open shelter with capacity and safe arrival time found. Recovery required.',
    };
  }

  // Prefer shelters that have active matching demands, then lowest travel time
  candidates.sort((a, b) => {
    if (a.demand && !b.demand) return -1;
    if (!a.demand && b.demand) return 1;
    return a.travelMinutes - b.travelMinutes;
  });

  const best = candidates[0];
  return {
    success: true,
    newShelterId: best.shelter.id,
    newDemandId: best.demand?.id,
    newDestination: best.shelter.location,
    travelMinutes: Math.round(best.travelMinutes * 10) / 10,
    reason: `Rerouted to ${best.shelter.name ?? best.shelter.id} (${Math.round(best.travelMinutes)} min ETA).`,
  };
}
