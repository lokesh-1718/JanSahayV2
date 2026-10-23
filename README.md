# CivicAid Dispatch 🚀

> **Real-Time Emergency Logistics & Aid Dispatch Platform**  
> Coordinating perishable food, fragile medical supplies, and emergency aid with strict expiry guarantees, dynamic fleet capacity splitting, automated rider watchdogs, and mid-transit rerouting.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Express_5-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-brightgreen.svg)](https://leafletjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black.svg)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_8-forestgreen.svg)](https://www.mongodb.com/)
[![Tests](https://img.shields.io/badge/Tests-22%2F22_Passing-success.svg)](file:///d:/J1-Backup/apps/api/test)

---

## 🌟 Executive Overview

In crisis and disaster response, perishable hot food, formula, and fragile medical supplies spoil rapidly. Traditional dispatch platforms fail in high-uncertainty environments when:
- Shelters unexpectedly reach capacity while delivery riders are already on the road.
- Dispatched batches arrive minutes after spoilage due to missing arrival buffers.
- Riders become unresponsive in dead zones without automatic task reclamation.
- Large donations (e.g. 180 cooked meals) cannot be legally delivered by standard single-rider bike fleets (capacity 40).

**CivicAid Dispatch** is built as an authoritative, backend-enforced logistics coordinator that mathematically guarantees safety, capacity, and real-time resilience.

---

## 🎯 Key Capabilities

| Capability | Engineering Guarantee |
|---|---|
| **Deterministic Expiry Window** | Enforces $t_{\text{now}} + t_{\text{travel}} + t_{\text{buffer}} < t_{\text{expiry}}$. Spoiled or tight-expiry aid is rejected before dispatch. |
| **Facility Compatibility Check** | Verifies clean water, cooking fuel, and refrigeration constraints before assigning aid to a destination. |
| **Greedy Capacity Splitting** | Mathematically splits large batches (e.g. 180 meals) across multiple 40-capacity riders and multiple shelter demands: $\min(Q_{\text{batch}}, Q_{\text{demand}}, C_{\text{rider}})$. |
| **Mid-Transit Dynamic Reroute** | When a destination shelter marks itself `FULL` or `CLOSED`, active in-transit deliveries automatically divert to the closest reachable compatible shelter. |
| **Silent Rider Watchdog** | Automated watchdog detects silent riders ($>60\text{s}$ heartbeat staleness), marks them `AFK`, revokes the delivery, and re-allocates it to available riders. |
| **Real-Time WebSocket Invalidation** | Dual-channel Socket.IO architecture for instant multi-dashboard synchronization without manual refreshing. |
| **Multi-Layer Geospatial Command** | Interactive Leaflet map with dark matter, street, and satellite basemaps (100% free, zero watermarks, zero API key required). |

---

## ⚙️ Core Functions & Platform Capabilities

CivicAid Dispatch provides a comprehensive suite of domain functions distributed across pure algorithmic packages, backend operational services, real-time channels, and interactive visualization views:

### 1. 🧮 Pure Logistics & Dispatch Engine (`packages/shared/src/logistics.ts`)
Zero-dependency, fully deterministic mathematical algorithms executing safety, capacity, and routing rules:

- **`buildMatchPlan(input: MatchPlanInput): MatchPlan`**  
  Top-level dispatch orchestrator. Evaluates eligible shelters and riders, ranks candidates by urgency and distance, greedily allocates portions respecting capacity limits, splits large batches into multi-rider tasks, and records unallocated remainders with explicit rejection reasons.
- **`isFacilityCompatible(aidType, handling, facilities): boolean`**  
  Hard safety filter verifying destination infrastructure. Validates clean water and cooking fuel for `RAW_RATION`, and cold chain refrigeration for temperature-sensitive `MEDICINE` and `INFANT_FORMULA`.
- **`canArriveBeforeExpiry(nowMs, expiresAtMs, travelMinutes, safetyBufferMinutes): boolean`**  
  Guarantees aid arrival before spoilage: $t_{\text{now}} + t_{\text{travel}} + t_{\text{safetyBuffer}} < t_{\text{expiresAt}}$. Blocks dispatch if arrival falls within the safety buffer (default: 5 min).
- **`splitQuantity(batchRemaining, demandRemaining, riderCapacity): number`**  
  Calculates legal payload allocation for a single rider trip: $\min(Q_{\text{batchRem}}, Q_{\text{demandRem}}, C_{\text{rider}})$.
- **`getEligibleShelters(batch, shelters, demands, nowMs): CandidateShelter[]`**  
  Filters shelters that are `OPEN`, have active demand matching the batch `aidType`, satisfy facility constraints, have remaining capacity, and can be reached before expiry.
- **`getEligibleRiders(pickupLocation, riders): CandidateRider[]`**  
  Filters riders who are currently `AVAILABLE` and have positive vehicle carrying capacity.
- **`rankShelterCandidates(candidates): CandidateShelter[]`**  
  Ranks eligible shelters by priority ratio (remaining demand / capacity) and proximity to pickup.
- **`rankRiderCandidates(candidates): CandidateRider[]`**  
  Ranks riders by shortest Haversine distance to the donation pickup hub.
- **`findRerouteDestination(input: RerouteInput): RerouteDecision`**  
  Dynamic in-transit reroute engine. When a target shelter becomes `FULL` or `CLOSED`, searches for the nearest alternative shelter with open demand, compatible facilities, and reachable before expiry. Escalates to `RECOVERY_REQUIRED` if no alternative exists.
- **`canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean`**  
  Finite state machine validator enforcing strictly legal delivery status transitions (e.g. rejects transitions directly from `OFFERED` to `DELIVERED`).
- **`isHeartbeatStale(lastHeartbeatMs, nowMs, timeoutSeconds): boolean`**  
  Detects unresponsive riders when telemetry exceeds the heartbeat timeout (default: 60s).
- **`haversineKm(from: GeoPoint, to: GeoPoint): number`**  
  Calculates great-circle distance in kilometers between two GeoJSON coordinate points.
- **`estimateTravelMinutes(from: GeoPoint, to: GeoPoint, speedKmh): number`**  
  Estimates travel duration based on distance and average transit velocity.

---

### 2. 🔌 Backend Operational Services (`apps/api/src/services/`)
Stateful domain services managing persistence, atomic workflows, telemetry, and background watchdogs:

- **Donation Batch Management (`batchService.ts`)**:
  - `createBatch(data)`: Validates future expiry, persists new donation batch in MongoDB, and logs audit events.
  - `matchBatch(id)`: Invokes `buildMatchPlan`, atomically generates `Delivery` tasks in `OFFERED` status, reserves riders, updates demand fulfilled counts, and emits real-time events.
  - `listBatches()` / `getBatchById(id)`: Retrieves active batches with remaining quantities.
- **Delivery Lifecycle Management (`deliveryService.ts`)**:
  - `claimDelivery(deliveryId, riderId)`: Atomically transitions task from `OFFERED` to `CLAIMED` and sets rider status to `BUSY`.
  - `recordHeartbeat(deliveryId, location)`: Records real-time GPS telemetry and timestamps rider heartbeats.
  - `updateDeliveryStatus(deliveryId, status, note)`: Advances delivery state machine (`CLAIMED` $\to$ `EN_ROUTE_TO_PICKUP` $\to$ `PICKED_UP` $\to$ `IN_TRANSIT` $\to$ `DELIVERED`).
  - `listDeliveries(filter)`: Queries deliveries with populated nested references (`riderId.userId`, `demandId.shelterId`, `batchId`).
- **Dynamic Shelter Management (`shelterService.ts`)**:
  - `markShelterFull(shelterId)`: Sets shelter to `FULL` and automatically reroutes all active in-transit deliveries.
  - `closeShelter(shelterId)`: Closes facility, releases unfilled demands, and triggers emergency diversions.
  - `createDemand(shelterId, data)`: Adds structured aid requirements with urgency levels.
  - `updateShelter(shelterId, data)`: Updates occupancy, contact info, and facility statuses.
- **Rider Fleet Telemetry (`riderService.ts`)**:
  - `updateRiderLocation(riderId, location)`: Updates GeoJSON coordinates with `2dsphere` spatial indexing.
  - `listRiders()`: Returns active fleet statuses (`AVAILABLE`, `RESERVED`, `BUSY`, `AFK`).
- **Automated Watchdog & Simulation (`demoService.ts`)**:
  - `advanceSimulationTime(minutes)`: Simulates time jumps to test expiry deadlines and claim timeouts.
  - `simulateAfkRider(riderId)`: Injects telemetry loss, marks rider `AFK`, reclaims assigned delivery, and triggers auto-reassignment.
  - `seedScenario()` / `resetScenario()`: Re-initializes clean deterministic database state.
- **Real-Time WebSocket Broadcaster (`socketService.ts`)**:
  - `initSocketServer(httpServer)`: Mounts Socket.IO server with room subscriptions (`operations`, `shelter:<id>`, `rider:<id>`).
  - `emitRealtimeEvent(event, entityType, entityId, data)`: Broadcasts typed real-time payload across subscribed client sockets.
- **Audit & Metrics (`operationsService.ts`, `eventService.ts`)**:
  - `getOperationalSummary()`: Computes real-time KPI aggregates.
  - `logOperationEvent(type, severity, message, ...)`: Records structured, append-only operational audit trail entries.

---

### 3. 🖥️ Interactive Web Command Center (`apps/web/src/`)
Real-time React 19 operational interface designed for emergency dispatchers and judges:

- **Geospatial Fleet Map (`DispatchMap.tsx`)**:
  - Multi-basemap tile switcher: `🌙 Dark` (Esri Canvas), `🗺️ Streets` (OpenStreetMap), `🛰️ Satellite` (Esri Imagery) with zero API keys required.
  - Dynamic marker rendering: Central Hub (📦), Shelters colored by occupancy (🏠 `OPEN`, `FULL`, `CLOSED`), and Riders colored by state (🏍️ `AVAILABLE`, `BUSY`, `AFK`).
  - Active route polylines with glowing dashed animations (Sky-blue for standard routes, Amber for rerouted diversions).
  - Interactive popup inspect drawers for all entities.
- **Operations Overview**:
  - Real-time KPI summary cards (Active Batches, Active Deliveries, Open Shelters, Available Riders, At-Risk Deliveries).
  - Live Append-Only Operational Audit Trail with severity badges (`CRITICAL`, `WARNING`, `INFO`).
  - Quick action launcher for matching batches and creating donations.
- **Donation Management**:
  - Batch catalog with live expiry countdowns, handling badges (💧 Water, 🔥 Fuel, ❄️ Fridge), and allocation progress bars.
  - Modal form for creating donation batches with custom handling rules.
- **Delivery Task Lifecycle Board**:
  - Comprehensive delivery task table showing ID, quantity, destination, rider, ETA, last heartbeat age, and reroute counts.
  - Interactive lifecycle transition buttons (`Claim`, `En Route`, `Pick Up`, `In Transit`, `Deliver`).
- **Shelter Demand & Capacity Manager**:
  - Facility cards showing live occupancy progress bars (`currentOccupancy / capacity`).
  - Infrastructure capability tags.
  - One-click `Mark Full`, `Close`, and `Reopen` facility controls.
  - Direct `+ Add Demand` modal launcher.
- **Rider Fleet Telemetry Monitor**:
  - Live vehicle fleet table tracking vehicle capacities, active assigned deliveries, and heartbeat staleness counters.
  - `Simulate AFK` failure injection buttons.
- **Judge Scenarios & Decision Inspector**:
  - 1-click execution cards for all 5 mandatory hackathon evaluation workflows.
  - Automated Decision Inspector table detailing the safety invariant, backend engine mechanism, and verification badge for each system rule (`RULE-01` to `RULE-05`).

---

## 🏗️ System Architecture

CivicAid Dispatch is architected as an npm workspaces monorepo:

```
d:\J1-Backup\
├── apps/
│   ├── api/                    # Express 5 + Socket.IO + Mongoose REST backend
│   │   ├── src/
│   │   │   ├── config/         # Environment configuration & MongoDB connection
│   │   │   ├── middleware/     # Request ID, audit logging, Zod validation, error handler
│   │   │   ├── models/         # Mongoose models with 2dsphere indexes
│   │   │   ├── routes/         # Express 5 REST controllers
│   │   │   ├── services/       # Dispatch, recovery, watchdog, and socket services
│   │   │   ├── seed.ts         # Deterministic seed generator
│   │   │   └── server.ts       # HTTP + Socket.IO server startup
│   │   └── test/               # Node test runner suite (22 unit & integration tests)
│   │
│   └── web/                    # React 19 + Vite + TypeScript frontend shell
│       ├── src/
│       │   ├── components/     # Interactive Leaflet DispatchMap with basemap switcher
│       │   ├── api.ts          # Typed REST API client
│       │   ├── socket.ts       # Socket.IO client singleton
│       │   ├── App.tsx         # Operations dashboard & judge scenarios
│       │   └── index.css       # Dark glassmorphism design system
│       └── vite.config.ts      # Reverse proxy (/api & /socket.io -> :4000)
│
├── packages/
│   └── shared/                 # Shared domain contracts (imported by API & Web)
│       └── src/
│           ├── enums.ts        # Status enums (Batch, Delivery, Shelter, Rider)
│           ├── schemas.ts      # Zod validation schemas
│           ├── events.ts       # Socket.IO event names and room helpers
│           └── logistics.ts    # Pure, deterministic mathematical logistics engine
│
└── docs/                       # Complete engineering documentation
    ├── ARCHITECTURE.md         # Domain modeling, state machines & algorithms
    ├── API_DOCUMENTATION.md    # REST & WebSocket protocol specification
    ├── JUDGE_DEMO_RUNBOOK.md   # Step-by-step hackathon demonstration guide
    ├── LAYERED_BUILD_PLAN.md   # Layer 0 to 10 progressive delivery plan
    └── IMPLEMENTATION_WORKFLOW.md # Technical requirements & constraints
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js**: v20 or higher
- **MongoDB**: v6 or higher (running locally on port `27017`)

### 2. Installation
Clone the repository and install dependencies across all workspace packages:

```bash
npm install
```

### 3. Environment Configuration
Verify or copy the environment configuration in the project root:

```bash
cp .env.example .env
```

Default contents of `.env`:
```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/civicaid
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000

# Map Provider API Key (Optional — default Esri/OSM works with NO key required)
VITE_MAPBOX_TOKEN=
VITE_MAP_API_KEY=
```

### 4. Seed Deterministic Scenario Data
Populate MongoDB with 10 users, 3 shelters, 5 riders (capacity 40), 3 demands (180 meals), and 1 donation batch:

```bash
npm run seed
```

### 5. Launch the Platform
Start the backend and frontend concurrently:

```bash
# Starts Express API on :4000 and Vite Web on :5173
npm run dev
```

Alternatively, run them in separate terminals:
```bash
# Terminal 1: Backend API + Sockets
npm run dev:api

# Terminal 2: Web Dashboard
npm run dev:web
```

Open your browser to: **`http://localhost:5173`**

---

## 🧪 Test Suite

CivicAid Dispatch includes a comprehensive test suite covering the logistics engine and REST API workflows without mocking the business logic:

```bash
npm run test -w apps/api
```

### Test Coverage Highlights:
- **Facility Compatibility**: Rejection of raw ration without clean water and cooking fuel; rejection of refrigerated items without cold storage.
- **Expiry Bounds**: Hard rejection of expired batches and deliveries arriving after expiry plus the safety buffer.
- **180-Meal Multi-Rider Allocation**: Proves greedy splitting across multiple 40-capacity riders and multiple shelter demands ($40+40+40+40+20 = 180$).
- **Mid-Transit Dynamic Rerouting**: Validates reroute to alternative compatible shelters and fallback to `RECOVERY_REQUIRED`.
- **Heartbeat Staleness Watchdog**: Validates detection of $>60\text{s}$ rider staleness and task revocation.
- **REST Endpoints**: 10 integration tests validating Supertest workflows against live database transactions.

---

## 🏆 1-Click Judge Failure Scenarios

The web interface includes a dedicated **Judge Scenarios** panel with one-click triggers:

1. **Scenario 1 — 180-Meal Multi-Rider Split**:
   - Takes a 180 cooked meals batch and splits it across 5 riders (capacity 40) delivering to Shelter Alpha, Bravo, and Charlie.
2. **Scenario 2 — Silent Rider AFK Reassignment**:
   - Simulates a rider who stops sending heartbeats for $>60\text{s}$. The watchdog marks the rider `AFK`, revokes the delivery task, and re-offers it to the next available rider.
3. **Scenario 3 — Shelter Full Mid-Transit Reroute**:
   - Marks Shelter Alpha `FULL` while delivery `#...` is in `IN_TRANSIT`. The engine automatically diverts the rider to Shelter Bravo and updates the map polyline in amber.
4. **Scenario 4 — Unsafe / Expiry Delivery Block**:
   - Submits a donation of raw rations requiring clean water and fuel to shelters lacking those facilities. The engine blocks the match before dispatch.
5. **Scenario 5 — No Safe Alternative (Recovery Escalation)**:
   - Closes all alternative shelters and marks destination full. The engine marks the delivery `RECOVERY_REQUIRED` and alerts operators.

---

## 📚 Complete Documentation

- 📐 [**System Architecture & Algorithms**](file:///d:/J1-Backup/docs/ARCHITECTURE.md)
- 🔌 [**REST API & WebSocket Protocol Reference**](file:///d:/J1-Backup/docs/API_DOCUMENTATION.md)
- 📋 [**Judge Demonstration Runbook**](file:///d:/J1-Backup/docs/JUDGE_DEMO_RUNBOOK.md)
- 🏗️ [**Layered Build Plan**](file:///d:/J1-Backup/docs/LAYERED_BUILD_PLAN.md)
- 📑 [**Implementation Workflow**](file:///d:/J1-Backup/docs/IMPLEMENTATION_WORKFLOW.md)
