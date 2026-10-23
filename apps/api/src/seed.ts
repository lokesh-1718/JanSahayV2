/**
 * Deterministic seed script for CivicAid Dispatch.
 *
 * Creates demo users, riders, shelters, demands, and a sample batch
 * with fixed coordinates around a central area (Delhi, India).
 *
 * Run:  npm run seed -w apps/api
 */
import mongoose from 'mongoose';
import { config } from './config/index.js';
import {
  User,
  Rider,
  Shelter,
  Demand,
  DonationBatch,
  OperationEvent,
  Delivery,
} from './models/index.js';

// ─── Coordinates (Delhi area) ──────────────────────────────
const COORDS = {
  // Pickup point (Connaught Place area)
  pickup: [77.2195, 28.6328] as [number, number],
  // Shelters spread around the city
  shelterA: [77.2090, 28.6139] as [number, number], // South — ~2.3 km
  shelterB: [77.2315, 28.6455] as [number, number], // NE — ~1.8 km
  shelterC: [77.1950, 28.6450] as [number, number], // NW — ~2.5 km
  // Riders spread around pickup
  rider1: [77.2210, 28.6350] as [number, number],
  rider2: [77.2170, 28.6300] as [number, number],
  rider3: [77.2250, 28.6340] as [number, number],
  rider4: [77.2100, 28.6380] as [number, number],
  rider5: [77.2300, 28.6290] as [number, number],
};

export async function seedDatabase(shouldDisconnect: boolean = false): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB for seeding');
  }

  // ─── Clear existing data ──────────────────────────────
  await Promise.all([
    User.deleteMany({}),
    Rider.deleteMany({}),
    Shelter.deleteMany({}),
    Demand.deleteMany({}),
    DonationBatch.deleteMany({}),
    Delivery.deleteMany({}),
    OperationEvent.deleteMany({}),
  ]);
  console.log('🗑️  Cleared existing data');

  // ─── Users ────────────────────────────────────────────
  const [donor, admin, shelterUserA, shelterUserB, shelterUserC, ...riderUsers] =
    await User.insertMany([
      { name: 'Delhi Food Bank',       role: 'DONOR' },
      { name: 'Ops Admin',             role: 'ADMIN' },
      { name: 'Shelter A Manager',     role: 'SHELTER' },
      { name: 'Shelter B Manager',     role: 'SHELTER' },
      { name: 'Shelter C Manager',     role: 'SHELTER' },
      { name: 'Rider Anil',            role: 'RIDER' },
      { name: 'Rider Priya',           role: 'RIDER' },
      { name: 'Rider Karan',           role: 'RIDER' },
      { name: 'Rider Meena',           role: 'RIDER' },
      { name: 'Rider Suresh',          role: 'RIDER' },
    ]);
  console.log(`👤 Created ${10} users`);

  // ─── Shelters ─────────────────────────────────────────
  const [shelterA, shelterB, shelterC] = await Shelter.insertMany([
    {
      name: 'Shelter Alpha',
      status: 'OPEN',
      location: { type: 'Point', coordinates: COORDS.shelterA },
      capacity: 100,
      currentOccupancy: 30,
      facilities: { cleanWater: true, cookingFuel: true, refrigeration: true },
      acceptedAidTypes: ['COOKED_MEALS', 'MEDICINE', 'RAW_RATION', 'INFANT_FORMULA', 'ESSENTIAL_KIT'],
      contactName: shelterUserA.name,
    },
    {
      name: 'Shelter Bravo',
      status: 'OPEN',
      location: { type: 'Point', coordinates: COORDS.shelterB },
      capacity: 80,
      currentOccupancy: 10,
      facilities: { cleanWater: true, cookingFuel: false, refrigeration: false },
      acceptedAidTypes: ['COOKED_MEALS', 'ESSENTIAL_KIT', 'INFANT_FORMULA'],
      contactName: shelterUserB.name,
    },
    {
      name: 'Shelter Charlie',
      status: 'OPEN',
      location: { type: 'Point', coordinates: COORDS.shelterC },
      capacity: 120,
      currentOccupancy: 50,
      facilities: { cleanWater: true, cookingFuel: true, refrigeration: false },
      acceptedAidTypes: ['COOKED_MEALS', 'RAW_RATION', 'ESSENTIAL_KIT'],
      contactName: shelterUserC.name,
    },
  ]);
  console.log(`🏠 Created 3 shelters`);

  // ─── Riders ───────────────────────────────────────────
  const riderCoords = [COORDS.rider1, COORDS.rider2, COORDS.rider3, COORDS.rider4, COORDS.rider5];
  const riders = await Rider.insertMany(
    riderUsers.map((u, i) => ({
      userId: u._id,
      status: 'AVAILABLE',
      vehicleCapacity: 40,
      currentLocation: { type: 'Point', coordinates: riderCoords[i] },
      lastHeartbeatAt: new Date(),
      maxRadiusKm: 15,
    })),
  );
  console.log(`🏍️  Created ${riders.length} riders (capacity: 40 each)`);

  // ─── Demands ──────────────────────────────────────────
  const demands = await Demand.insertMany([
    {
      shelterId: shelterA._id,
      aidType: 'COOKED_MEALS',
      requestedQuantity: 50,
      fulfilledQuantity: 0,
      status: 'OPEN',
    },
    {
      shelterId: shelterB._id,
      aidType: 'COOKED_MEALS',
      requestedQuantity: 60,
      fulfilledQuantity: 0,
      status: 'OPEN',
    },
    {
      shelterId: shelterC._id,
      aidType: 'COOKED_MEALS',
      requestedQuantity: 70,
      fulfilledQuantity: 0,
      status: 'OPEN',
    },
  ]);
  console.log(`📋 Created ${demands.length} demands (total: 180 meals)`);

  // ─── Sample Donation Batch ────────────────────────────
  const batch = await DonationBatch.create({
    donorId: donor._id,
    aidType: 'COOKED_MEALS',
    quantity: 180,
    remainingQuantity: 180,
    unit: 'meals',
    pickupLocation: { type: 'Point', coordinates: COORDS.pickup },
    expiresAt: new Date(Date.now() + 75 * 60_000), // 75 minutes from now
    handling: {
      requiresCleanWater: false,
      requiresCookingFuel: false,
      requiresRefrigeration: false,
    },
    status: 'AVAILABLE',
    notes: 'Freshly cooked meals from Delhi Food Bank — 180-meal demo batch.',
  });
  console.log(`📦 Created donation batch: ${batch.quantity} ${batch.unit} (expires in 75 min)`);

  // ─── Seed events ──────────────────────────────────────
  await OperationEvent.insertMany([
    {
      type: 'SCENARIO_SEEDED',
      severity: 'INFO',
      message: 'Demo scenario seeded: 180-meal split across 3 shelters, 5 riders.',
      entityType: 'system',
    },
    {
      type: 'BATCH_CREATED',
      severity: 'INFO',
      message: `Donation batch created: ${batch.quantity} ${batch.aidType} from ${donor.name}.`,
      entityType: 'DonationBatch',
      entityId: batch._id as any,
      metadata: { donorName: donor.name, quantity: batch.quantity, aidType: batch.aidType },
    },
  ]);
  console.log(`📜 Created seed operation events`);

  // ─── Summary ──────────────────────────────────────────
  console.log(`
✅ Seed complete!
   Users:    10 (1 donor, 1 admin, 3 shelter managers, 5 riders)
   Shelters: 3  (Alpha, Bravo, Charlie)
   Riders:   5  (capacity 40 each)
   Demands:  3  (50 + 60 + 70 = 180 meals)
   Batch:    1  (180 cooked meals, 75-min expiry)
  `);

  if (shouldDisconnect) {
    await mongoose.disconnect();
  }
}

// Run directly from CLI
const isDirectCli = process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed.js');
if (isDirectCli) {
  seedDatabase(true).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
