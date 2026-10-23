import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFacilityCompatible,
  canArriveBeforeExpiry,
  splitQuantity,
  isHeartbeatStale,
  canTransitionDelivery,
  buildMatchPlan,
  findRerouteDestination,
  getEligibleShelters,
  type BatchInput,
  type ShelterInput,
  type DemandInput,
  type RiderInput,
} from '@civicaid/shared';

// ─── Shared Mock Data ──────────────────────────────────────────
const ORIGIN = { type: 'Point' as const, coordinates: [77.2195, 28.6328] as [number, number] }; // Delhi CP
const SHELTER_SOUTH = { type: 'Point' as const, coordinates: [77.2090, 28.6139] as [number, number] }; // ~2.3km
const SHELTER_NE = { type: 'Point' as const, coordinates: [77.2315, 28.6455] as [number, number] }; // ~1.8km

describe('Layer 4 — Pure Logistics Engine', () => {

  describe('1. Facility Compatibility', () => {
    it('rejects RAW_RATION without clean water and cooking fuel', () => {
      const handling = { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: false };
      
      // Missing clean water
      assert.equal(
        isFacilityCompatible('RAW_RATION', handling, { cleanWater: false, cookingFuel: true, refrigeration: true }),
        false,
        'Should reject RAW_RATION without clean water'
      );

      // Missing cooking fuel
      assert.equal(
        isFacilityCompatible('RAW_RATION', handling, { cleanWater: true, cookingFuel: false, refrigeration: true }),
        false,
        'Should reject RAW_RATION without cooking fuel'
      );

      // Has both clean water and cooking fuel
      assert.equal(
        isFacilityCompatible('RAW_RATION', handling, { cleanWater: true, cookingFuel: true, refrigeration: false }),
        true,
        'Should accept RAW_RATION when both clean water and cooking fuel are available'
      );
    });

    it('rejects refrigerated items if shelter lacks refrigeration', () => {
      const handling = { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: true };
      assert.equal(
        isFacilityCompatible('MEDICINE', handling, { cleanWater: true, cookingFuel: true, refrigeration: false }),
        false
      );
      assert.equal(
        isFacilityCompatible('MEDICINE', handling, { cleanWater: true, cookingFuel: true, refrigeration: true }),
        true
      );
    });
  });

  describe('2. Expiry & Safe Arrival', () => {
    it('rejects expired batches', () => {
      const now = Date.now();
      const past = now - 1000;
      assert.equal(canArriveBeforeExpiry(now, past, 10, 5), false);
    });

    it('rejects delivery arriving after expiry including safety buffer', () => {
      const now = Date.now();
      // Expiry is in 14 minutes
      const expiresAt = now + 14 * 60_000;
      // Travel time is 10 min + 5 min safety buffer = 15 min -> should be rejected!
      assert.equal(canArriveBeforeExpiry(now, expiresAt, 10, 5), false);

      // Expiry is in 20 minutes -> arrival in 15 min should be accepted
      const safeExpiry = now + 20 * 60_000;
      assert.equal(canArriveBeforeExpiry(now, safeExpiry, 10, 5), true);
    });
  });

  describe('3. Quantity Splitting & Capacity Bounds', () => {
    it('splits quantity as min(batchRemaining, demandRemaining, riderCapacity)', () => {
      assert.equal(splitQuantity(100, 50, 40), 40); // bounded by rider capacity
      assert.equal(splitQuantity(100, 20, 40), 20); // bounded by demand
      assert.equal(splitQuantity(15, 50, 40), 15);  // bounded by batch remaining
    });
  });

  describe('4. 180-Meal Multi-Rider Split Scenario', () => {
    it('splits 180 meals into 40+40+40+40+20 portions across 5 riders (capacity 40)', () => {
      const now = Date.now();
      const expiresAt = now + 90 * 60_000; // 90 min

      const batch: BatchInput = {
        id: 'batch-1',
        aidType: 'COOKED_MEALS',
        quantity: 180,
        remainingQuantity: 180,
        pickupLocation: ORIGIN,
        expiresAt,
        handling: { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: false },
      };

      const shelters: ShelterInput[] = [
        {
          id: 'shelter-1',
          name: 'Shelter Alpha',
          status: 'OPEN',
          location: SHELTER_SOUTH,
          capacity: 100,
          currentOccupancy: 0,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
        {
          id: 'shelter-2',
          name: 'Shelter Bravo',
          status: 'OPEN',
          location: SHELTER_NE,
          capacity: 100,
          currentOccupancy: 0,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
        {
          id: 'shelter-3',
          name: 'Shelter Charlie',
          status: 'OPEN',
          location: ORIGIN,
          capacity: 100,
          currentOccupancy: 0,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
      ];

      // Demands structured so 5 riders of capacity 40 can deliver 40+40+40+40+20
      const demands: DemandInput[] = [
        { id: 'demand-1', shelterId: 'shelter-1', aidType: 'COOKED_MEALS', quantityRequested: 80, quantityFulfilled: 0, status: 'OPEN' },
        { id: 'demand-2', shelterId: 'shelter-2', aidType: 'COOKED_MEALS', quantityRequested: 60, quantityFulfilled: 0, status: 'OPEN' },
        { id: 'demand-3', shelterId: 'shelter-3', aidType: 'COOKED_MEALS', quantityRequested: 40, quantityFulfilled: 0, status: 'OPEN' },
      ];

      const riders: RiderInput[] = [1, 2, 3, 4, 5].map((i) => ({
        id: `rider-${i}`,
        status: 'AVAILABLE',
        vehicleCapacity: 40,
        currentLocation: ORIGIN,
      }));

      const plan = buildMatchPlan({
        batch,
        shelters,
        demands,
        riders,
        nowMs: now,
      });

      assert.equal(plan.totalAllocated, 180, 'Must allocate all 180 meals');
      assert.equal(plan.unallocatedQuantity, 0, 'No meals left unallocated');
      assert.equal(plan.allocations.length, 5, 'Exactly 5 rider allocations (40+40+40+40+20 = 180)');

      // Check portions: exactly [40, 40, 40, 40, 20] in some order
      const quantities = plan.allocations.map((a) => a.quantity).sort((a, b) => b - a);
      assert.deepEqual(quantities, [40, 40, 40, 40, 20]);
    });

    it('splits 180 meals across 50, 60, 70 demands when sufficient riders are available', () => {
      const now = Date.now();
      const expiresAt = now + 90 * 60_000;

      const batch: BatchInput = {
        id: 'batch-1',
        aidType: 'COOKED_MEALS',
        quantity: 180,
        remainingQuantity: 180,
        pickupLocation: ORIGIN,
        expiresAt,
        handling: { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: false },
      };

      const shelters: ShelterInput[] = [
        {
          id: 'shelter-1',
          name: 'Shelter Alpha',
          status: 'OPEN',
          location: SHELTER_SOUTH,
          capacity: 100,
          currentOccupancy: 0,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
        {
          id: 'shelter-2',
          name: 'Shelter Bravo',
          status: 'OPEN',
          location: SHELTER_NE,
          capacity: 100,
          currentOccupancy: 0,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
        {
          id: 'shelter-3',
          name: 'Shelter Charlie',
          status: 'OPEN',
          location: ORIGIN,
          capacity: 100,
          currentOccupancy: 0,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
      ];

      const demands: DemandInput[] = [
        { id: 'demand-1', shelterId: 'shelter-1', aidType: 'COOKED_MEALS', quantityRequested: 50, quantityFulfilled: 0, status: 'OPEN' },
        { id: 'demand-2', shelterId: 'shelter-2', aidType: 'COOKED_MEALS', quantityRequested: 60, quantityFulfilled: 0, status: 'OPEN' },
        { id: 'demand-3', shelterId: 'shelter-3', aidType: 'COOKED_MEALS', quantityRequested: 70, quantityFulfilled: 0, status: 'OPEN' },
      ];

      // 6 riders needed for 50, 60, 70 demands (40+10, 40+20, 40+30)
      const riders: RiderInput[] = [1, 2, 3, 4, 5, 6].map((i) => ({
        id: `rider-${i}`,
        status: 'AVAILABLE',
        vehicleCapacity: 40,
        currentLocation: ORIGIN,
      }));

      const plan = buildMatchPlan({
        batch,
        shelters,
        demands,
        riders,
        nowMs: now,
      });

      assert.equal(plan.totalAllocated, 180);
      assert.equal(plan.unallocatedQuantity, 0);
      assert.equal(plan.allocations.length, 6);
    });
  });

  describe('5. Exclusion of Full Shelters', () => {
    it('excludes shelter when status is FULL or remaining capacity is 0', () => {
      const now = Date.now();
      const batch: BatchInput = {
        id: 'batch-1',
        aidType: 'COOKED_MEALS',
        quantity: 50,
        remainingQuantity: 50,
        pickupLocation: ORIGIN,
        expiresAt: now + 60 * 60_000,
        handling: { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: false },
      };

      const fullShelter: ShelterInput = {
        id: 'shelter-full',
        status: 'FULL',
        location: SHELTER_SOUTH,
        capacity: 100,
        currentOccupancy: 100,
        facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
        acceptedAidTypes: ['COOKED_MEALS'],
      };

      const demand: DemandInput = {
        id: 'demand-1',
        shelterId: 'shelter-full',
        aidType: 'COOKED_MEALS',
        quantityRequested: 50,
        quantityFulfilled: 0,
        status: 'OPEN',
      };

      const eligible = getEligibleShelters(batch, [fullShelter], [demand], now);
      assert.equal(eligible.length, 0, 'Full shelter must be excluded from eligible candidates');
    });
  });

  describe('6. Rerouting Logic', () => {
    it('reroutes to a compatible, reachable alternative shelter when current is full', () => {
      const now = Date.now();
      const delivery = {
        id: 'del-1',
        batchId: 'batch-1',
        aidType: 'COOKED_MEALS' as const,
        quantity: 30,
        handling: { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: false },
        expiresAt: now + 60 * 60_000,
        currentShelterId: 'shelter-alpha',
      };

      const shelters: ShelterInput[] = [
        {
          id: 'shelter-alpha', // original (now full/closed)
          status: 'FULL',
          location: SHELTER_SOUTH,
          capacity: 100,
          currentOccupancy: 100,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
        {
          id: 'shelter-bravo', // valid alternative
          name: 'Shelter Bravo',
          status: 'OPEN',
          location: SHELTER_NE,
          capacity: 100,
          currentOccupancy: 40,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
      ];

      const demands: DemandInput[] = [
        { id: 'demand-bravo', shelterId: 'shelter-bravo', aidType: 'COOKED_MEALS', quantityRequested: 50, quantityFulfilled: 0, status: 'OPEN' },
      ];

      const reroute = findRerouteDestination({
        delivery,
        riderLocation: ORIGIN,
        shelters,
        demands,
        nowMs: now,
      });

      assert.equal(reroute.success, true);
      assert.equal(reroute.newShelterId, 'shelter-bravo');
      assert.equal(reroute.newDemandId, 'demand-bravo');
    });

    it('returns success: false when no compatible shelter can receive delivery', () => {
      const now = Date.now();
      const delivery = {
        id: 'del-1',
        batchId: 'batch-1',
        aidType: 'COOKED_MEALS' as const,
        quantity: 30,
        handling: { requiresCleanWater: false, requiresCookingFuel: false, requiresRefrigeration: false },
        expiresAt: now + 60 * 60_000,
        currentShelterId: 'shelter-alpha',
      };

      const shelters: ShelterInput[] = [
        {
          id: 'shelter-alpha',
          status: 'FULL',
          location: SHELTER_SOUTH,
          capacity: 100,
          currentOccupancy: 100,
          facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
          acceptedAidTypes: ['COOKED_MEALS'],
        },
      ];

      const reroute = findRerouteDestination({
        delivery,
        riderLocation: ORIGIN,
        shelters,
        demands: [],
        nowMs: now,
      });

      assert.equal(reroute.success, false);
      assert.match(reroute.reason, /Recovery required/i);
    });
  });

  describe('7. Heartbeat Staleness & State Transitions', () => {
    it('detects stale rider heartbeat after 60 seconds', () => {
      const now = Date.now();
      const freshHeartbeat = now - 30_000; // 30 sec ago
      const staleHeartbeat = now - 65_000; // 65 sec ago

      assert.equal(isHeartbeatStale(freshHeartbeat, now, 60), false);
      assert.equal(isHeartbeatStale(staleHeartbeat, now, 60), true);
    });

    it('validates legal delivery transitions and rejects illegal ones', () => {
      assert.equal(canTransitionDelivery('OFFERED', 'CLAIMED'), true);
      assert.equal(canTransitionDelivery('CLAIMED', 'EN_ROUTE_TO_PICKUP'), true);
      assert.equal(canTransitionDelivery('EN_ROUTE_TO_PICKUP', 'PICKED_UP'), true);
      assert.equal(canTransitionDelivery('PICKED_UP', 'IN_TRANSIT'), true);
      assert.equal(canTransitionDelivery('IN_TRANSIT', 'DELIVERED'), true);
      assert.equal(canTransitionDelivery('IN_TRANSIT', 'REROUTING'), true);
      assert.equal(canTransitionDelivery('CLAIMED', 'REASSIGNED'), true);

      // Illegal jumps
      assert.equal(canTransitionDelivery('OFFERED', 'DELIVERED'), false);
      assert.equal(canTransitionDelivery('DELIVERED', 'IN_TRANSIT'), false);
      assert.equal(canTransitionDelivery('CANCELLED', 'DELIVERED'), false);
    });
  });

});
