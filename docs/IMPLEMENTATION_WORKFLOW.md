# CivicAid Dispatch — Complete Implementation Workflow

> For a build-friendly sequence, start with [`LAYERED_BUILD_PLAN.md`](./LAYERED_BUILD_PLAN.md). This document contains the complete technical reference; the layered plan breaks it into independently verifiable stages.

## 1. Product goal

Build a simulation-first real-time coordination platform for perishable food and fragile aid. The platform connects:

- **Donors** — restaurants, pharmacies, hostels, and warehouses that publish aid batches.
- **Volunteer riders** — accept split delivery tasks, share status/location, and transport aid.
- **Shelters/relief camps** — publish demand, capacity, facilities, and availability.
- **Operations/admin users** — run live failure simulations and observe recovery decisions.

The MVP must prove four judge-facing behaviors:

1. A large donation is split across multiple riders and compatible shelters.
2. A rider who becomes unresponsive loses the reservation automatically.
3. A shelter that becomes full during transit is removed from the active route and the rider is rerouted.
4. Expiry and facility rules block unsafe or impossible deliveries.

## 2. Recommended technical decisions

The requested stack is retained. The following supporting libraries are recommended for a reliable MVP:

| Area | Choice |
|---|---|
| Frontend | React, Vite, TypeScript, React Router, Redux Toolkit, Axios |
| UI | Tailwind CSS, shadcn/ui, lucide-react |
| Maps | Leaflet, react-leaflet, OpenStreetMap tiles for development |
| Backend | Node.js, Express, TypeScript, Mongoose |
| Real-time | Socket.IO for server events and rider/admin updates |
| Validation | Zod shared between request boundaries where practical |
| Auth for MVP | Demo role switcher with seeded users; replace with JWT later |
| Testing | Vitest, React Testing Library, Supertest, MongoDB Memory Server |
| Formatting | ESLint, Prettier, Husky or a simple pre-commit check |

**Assumption:** Use TypeScript in both frontend and backend. This reduces errors in status transitions, matching rules, and shared event payloads. The first release should be simulation-first rather than production-auth-first.

## 3. User-visible MVP flow

### 3.1 Donor flow

1. Donor opens the dashboard.
2. Donor creates a batch with:
   - aid type: cooked meals, medicine, raw ration kits, infant formula, or essential kits;
   - quantity and unit;
   - pickup location;
   - expiry timestamp;
   - handling requirements;
   - optional notes.
3. The system validates that the expiry is in the future.
4. The batch appears in the operations queue with a live countdown.
5. The matching engine finds compatible shelter demand and available riders.
6. The batch is split into delivery tasks based on demand, rider capacity, distance, and safe travel time.

### 3.2 Shelter flow

1. Shelter publishes or updates a demand record.
2. Shelter specifies:
   - requested aid type;
   - quantity still needed;
   - maximum receiving capacity;
   - clean water availability;
   - cooking fuel availability;
   - refrigeration or cold-chain capability;
   - open/closed/full state.
3. Shelter can click **Mark Full** at any time.
4. The backend immediately cancels unstarted tasks to that shelter and asks the matching engine to recover in-transit tasks.

### 3.3 Rider flow

1. Rider sees eligible delivery tasks.
2. Rider accepts one task, creating a reservation with a short claim deadline.
3. Rider must check in or send a location update before the claim deadline.
4. The system moves the task through `CLAIMED`, `EN_ROUTE_TO_PICKUP`, `PICKED_UP`, and `IN_TRANSIT`.
5. If the rider is unresponsive, a watchdog expires the reservation and requeues the quantity.
6. If the destination changes state, the system gives the rider a new destination or sends the task to the recovery queue.

### 3.4 Operations/admin flow

The admin screen is a central simulation dashboard. It must expose large, obvious controls for:

- Seed demo scenario.
- Create tight-expiry batch.
- Split a batch across riders.
- Simulate rider AFK/unresponsive.
- Mark Shelter A full.
- Close a shelter.
- Add direct donation to a shelter.
- Advance simulation clock by 5/10/30 minutes.
- Reset scenario.

Every simulation action writes an event to the activity timeline so judges can see what happened and why.

## 4. Repository and folder structure

Create a monorepo with npm workspaces:

```text
J1-Backup/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  ├─ components/
│  │  │  ├─ features/
│  │  │  │  ├─ dashboard/
│  │  │  │  ├─ donations/
│  │  │  │  ├─ shelters/
│  │  │  │  ├─ riders/
│  │  │  │  ├─ deliveries/
│  │  │  │  └─ simulation/
│  │  │  ├─ hooks/
│  │  │  ├─ lib/
│  │  │  ├─ routes/
│  │  │  └─ types/
│  │  └─ public/
│  └─ api/
│     └─ src/
│        ├─ config/
│        ├─ controllers/
│        ├─ jobs/
│        ├─ middleware/
│        ├─ models/
│        ├─ routes/
│        ├─ services/
│        │  ├─ matching/
│        │  ├─ dispatch/
│        │  ├─ recovery/
│        │  ├─ simulation/
│        │  └─ realtime/
│        ├─ sockets/
│        ├─ types/
│        └─ server.ts
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ enums.ts
│        ├─ events.ts
│        ├─ schemas.ts
│        └─ logistics.ts
├─ docs/
├─ .env.example
├─ package.json
└─ README.md
```

Keep all domain enums, validation schemas, and event payload types in `packages/shared` so the browser and API cannot silently disagree.

## 5. Step-by-step build sequence

### Step 1 — Initialize the repository

Create the workspace and install the baseline tooling.

```bash
mkdir civicAid-dispatch
cd civicAid-dispatch
npm init -y
npm install -D concurrently typescript tsx eslint prettier
```

Create the two apps with Vite and an Express TypeScript service. Do not add a UI kit until the basic applications start successfully.

Initial scripts should include:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev -w apps/api\" \"npm run dev -w apps/web\"",
    "build": "npm run build -w packages/shared && npm run build -w apps/api && npm run build -w apps/web",
    "lint": "npm run lint -w apps/api && npm run lint -w apps/web",
    "test": "npm run test -w apps/api && npm run test -w apps/web"
  }
}
```

Add `.env.example` immediately:

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/civicaid
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

### Step 2 — Establish the domain vocabulary

Define these enums in the shared package.

```ts
type UserRole = 'DONOR' | 'RIDER' | 'SHELTER' | 'ADMIN';

type AidType =
  | 'COOKED_MEALS'
  | 'MEDICINE'
  | 'RAW_RATION'
  | 'INFANT_FORMULA'
  | 'ESSENTIAL_KIT';

type BatchStatus =
  | 'DRAFT'
  | 'AVAILABLE'
  | 'PARTIALLY_ALLOCATED'
  | 'ALLOCATED'
  | 'EXPIRED'
  | 'CANCELLED';

type DeliveryStatus =
  | 'PENDING'
  | 'OFFERED'
  | 'CLAIMED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'REROUTING'
  | 'RECOVERY_REQUIRED'
  | 'DELIVERED'
  | 'REASSIGNED'
  | 'CANCELLED'
  | 'EXPIRED';

type RiderStatus = 'AVAILABLE' | 'RESERVED' | 'BUSY' | 'AFK' | 'OFFLINE';
type ShelterStatus = 'OPEN' | 'FULL' | 'CLOSED' | 'PAUSED';
```

Never use arbitrary strings in controllers or React components for these values.

### Step 3 — Design the MongoDB data model

Use Mongoose models with timestamps and indexes. The essential collections are:

#### `users`

```ts
{
  name: string,
  role: UserRole,
  phone?: string,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### `riders`

```ts
{
  userId: ObjectId,
  status: RiderStatus,
  vehicleCapacity: number,
  currentLocation: { type: 'Point', coordinates: [number, number] },
  lastHeartbeatAt: Date,
  maxRadiusKm: number,
  activeDeliveryId?: ObjectId
}
```

Create a `2dsphere` index on `currentLocation`.

#### `shelters`

```ts
{
  name: string,
  status: ShelterStatus,
  location: { type: 'Point', coordinates: [number, number] },
  capacity: number,
  currentOccupancy: number,
  facilities: {
    cleanWater: boolean,
    cookingFuel: boolean,
    refrigeration: boolean
  },
  acceptedAidTypes: AidType[],
  contactName?: string
}
```

Create a `2dsphere` index on `location`.

#### `demands`

```ts
{
  shelterId: ObjectId,
  aidType: AidType,
  requestedQuantity: number,
  fulfilledQuantity: number,
  status: 'OPEN' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CLOSED',
  requiredFacilities?: string[],
  expiresAt?: Date
}
```

The remaining quantity is `requestedQuantity - fulfilledQuantity`. Do not store a second mutable `remainingQuantity` unless it is updated in the same transaction.

#### `donationBatches`

```ts
{
  donorId: ObjectId,
  aidType: AidType,
  quantity: number,
  remainingQuantity: number,
  unit: string,
  pickupLocation: { type: 'Point', coordinates: [number, number] },
  expiresAt: Date,
  handling: {
    requiresCleanWater: boolean,
    requiresCookingFuel: boolean,
    requiresRefrigeration: boolean
  },
  status: BatchStatus,
  notes?: string
}
```

#### `deliveries`

```ts
{
  batchId: ObjectId,
  demandId: ObjectId,
  riderId?: ObjectId,
  quantity: number,
  status: DeliveryStatus,
  pickupLocation: GeoPoint,
  destinationLocation: GeoPoint,
  estimatedMinutes: number,
  claimExpiresAt?: Date,
  lastHeartbeatAt?: Date,
  pickedUpAt?: Date,
  deliveredAt?: Date,
  rerouteCount: number,
  failureReason?: string
}
```

#### `operationEvents`

Append-only audit records power the simulation timeline:

```ts
{
  type: string,
  severity: 'INFO' | 'WARNING' | 'CRITICAL',
  message: string,
  entityType: string,
  entityId?: ObjectId,
  metadata?: Record<string, unknown>,
  createdAt: Date
}
```

### Step 4 — Implement safety and compatibility rules first

Create pure functions in `packages/shared/src/logistics.ts` so they can be unit tested without MongoDB.

#### Compatibility rule

A demand is eligible only when all conditions pass:

```text
aid type is accepted
AND shelter status is OPEN
AND remaining capacity is positive
AND required facilities are present
AND delivery can arrive before expiry
```

Example facility matrix:

| Aid type | Required shelter condition |
|---|---|
| Cooked meals | Shelter open and receiving capacity available |
| Medicine | Shelter accepts medicine; refrigeration if batch requires it |
| Raw ration | Clean water and cooking fuel are both true |
| Infant formula | Clean water is true; refrigeration when required by batch |
| Essential kit | Shelter accepts the kit category |

#### Safe arrival rule

Reject a candidate if:

```text
estimatedArrivalAt >= batch.expiresAt
```

Use a safety buffer for the MVP, for example 5 minutes, so the real condition is:

```text
now + travelTime + safetyBuffer < expiresAt
```

The UI may display a countdown, but the backend is the authority and must re-check the rule before claiming, pickup, reroute, and delivery completion.

### Step 5 — Implement the matching engine

Build the engine as a deterministic service with no direct HTTP concerns:

```ts
matchBatch(batchId: string): Promise<MatchPlan>
```

#### Matching algorithm for the MVP

1. Load the batch, open demands, and available riders.
2. Filter demands by aid compatibility, facility requirements, open status, capacity, and safe arrival.
3. Estimate travel time from pickup to each shelter.
4. Rank shelter candidates by:
   - earliest expiry risk;
   - shortest travel time;
   - highest urgency ratio (`remaining / capacity`);
   - shortest distance.
5. Allocate quantity using `min(batchRemaining, demandRemaining, riderCapacity)`.
6. Continue until the batch is allocated, no eligible demand remains, or no eligible rider remains.
7. Create one delivery task per rider/shelter allocation.
8. Update batch and demand quantities atomically.
9. Emit `MATCH_PLAN_CREATED` and `DELIVERY_OFFERED` events.

For the 180-meal example, a 40-meal rider capacity should result in five deliveries: 40, 40, 40, 40, and 20, subject to shelter demand and safe arrival.

#### Why this is sufficient for the hackathon

This is a greedy heuristic, not a full vehicle-routing optimizer. It is deterministic, explainable in the UI, and strong enough to demonstrate splitting, constraints, expiry protection, and recovery. Keep an interface so a scoring or optimization algorithm can replace it later.

### Step 6 — Add reservation and anti-ghost-rider behavior

When a rider accepts an offered delivery:

1. Start a MongoDB transaction.
2. Confirm the delivery is still `OFFERED`.
3. Confirm the batch is not expired.
4. Confirm the shelter is still open and has capacity.
5. Assign the rider and set `claimExpiresAt = now + claimWindow`.
6. Set rider status to `RESERVED`.
7. Commit and emit `DELIVERY_CLAIMED`.

Use a short claim window, such as 3 minutes in the live system and 30 seconds in demo mode.

The watchdog runs every 5–10 seconds in the API process for the prototype:

```text
find CLAIMED or EN_ROUTE_TO_PICKUP tasks where
lastHeartbeatAt < now - heartbeatTimeout
OR claimExpiresAt < now
```

For every stale task:

1. Mark the delivery `REASSIGNED` or `CANCELLED` with reason `RIDER_UNRESPONSIVE`.
2. Release the rider.
3. Return the quantity to the batch/demand allocation pool.
4. Ask the matcher for a replacement rider.
5. Emit `RIDER_DECLARED_AFK`, `DELIVERY_REQUEUED`, and `DELIVERY_OFFERED` events.

Do not rely only on the browser timer. The server must enforce the timeout.

### Step 7 — Implement mid-transit recovery

When a shelter changes to `FULL` or `CLOSED`:

1. Update the shelter status in a transaction.
2. Find all undelivered deliveries for that shelter.
3. Mark unstarted deliveries as `CANCELLED` and return their quantity.
4. Mark `PICKED_UP` or `IN_TRANSIT` deliveries as `REROUTING`.
5. Search for the next compatible shelter with remaining demand.
6. Recalculate travel time from the rider's last known location, not the original pickup point.
7. Require arrival before expiry with the safety buffer.
8. If a safe destination exists, update the delivery destination and mark it `IN_TRANSIT`.
9. If no safe destination exists, mark it `RECOVERY_REQUIRED` in the operations view and show a human decision alert.
10. Emit `SHELTER_STATUS_CHANGED`, `DELIVERY_REROUTED`, or `DELIVERY_RECOVERY_FAILED`.

For the demo, the UI should show the old destination crossed out, the new destination highlighted, and the reason for the decision.

### Step 8 — Build the backend API

Use versioned routes under `/api/v1`.

#### Health and demo

```text
GET    /api/v1/health
POST   /api/v1/demo/seed
POST   /api/v1/demo/reset
POST   /api/v1/demo/advance-time
```

#### Donations

```text
POST   /api/v1/batches
GET    /api/v1/batches
GET    /api/v1/batches/:id
POST   /api/v1/batches/:id/match
POST   /api/v1/batches/:id/cancel
```

#### Shelters and demands

```text
GET    /api/v1/shelters
PATCH  /api/v1/shelters/:id
POST   /api/v1/shelters/:id/full
POST   /api/v1/shelters/:id/close
POST   /api/v1/shelters/:id/demands
PATCH  /api/v1/demands/:id
```

#### Riders and deliveries

```text
GET    /api/v1/riders
PATCH  /api/v1/riders/:id/location
GET    /api/v1/deliveries
POST   /api/v1/deliveries/:id/claim
POST   /api/v1/deliveries/:id/heartbeat
POST   /api/v1/deliveries/:id/status
POST   /api/v1/deliveries/:id/simulate-afk
```

#### Operations

```text
GET    /api/v1/operations/summary
GET    /api/v1/operations/events
GET    /api/v1/operations/active-alerts
```

Every request should pass through validation, error normalization, and request logging middleware.

### Step 9 — Add real-time events with Socket.IO

Create rooms:

- `operations` — all admin dashboards.
- `shelter:<id>` — a shelter's live status and demand.
- `rider:<id>` — a rider's tasks and route changes.
- `batch:<id>` — a donation's allocation and countdown.

Publish these events:

```ts
type RealtimeEvent =
  | 'BATCH_CREATED'
  | 'BATCH_UPDATED'
  | 'MATCH_PLAN_CREATED'
  | 'DELIVERY_OFFERED'
  | 'DELIVERY_CLAIMED'
  | 'DELIVERY_STATUS_CHANGED'
  | 'RIDER_LOCATION_UPDATED'
  | 'RIDER_DECLARED_AFK'
  | 'DELIVERY_REQUEUED'
  | 'SHELTER_STATUS_CHANGED'
  | 'DELIVERY_REROUTED'
  | 'DELIVERY_RECOVERY_FAILED'
  | 'OPERATION_EVENT_CREATED';
```

The client must treat socket events as invalidation signals and refetch authoritative data through TanStack Query. Do not make the socket payload the only source of truth.

### Step 10 — Build the frontend shell

Install Tailwind and shadcn/ui, then create a consistent application shell:

- left navigation: Overview, Donations, Deliveries, Shelters, Riders, Simulation;
- top bar: current simulation time, connection status, active alerts, role selector;
- main content: responsive cards, tables, map, and timeline;
- right drawer: selected delivery or alert details.

Use these shadcn/ui primitives first:

- Button
- Card
- Badge
- Dialog
- Drawer
- Dropdown Menu
- Form
- Input
- Select
- Table
- Tabs
- Toast/Sonner
- Progress

Avoid building separate pages for every role in the first sprint. Use one shared operations dashboard with role-focused tabs and clear demo controls.

### Step 11 — Build the map view with Leaflet

Create a `DispatchMap` component that renders:

- donor pickup markers;
- shelter markers colored by status;
- rider markers colored by availability;
- delivery polylines;
- rerouted delivery polylines;
- expiry-risk styling.

Keep map state separate from domain state:

```text
domain state -> delivery/rider/shelter query data
map adapter -> markers, polylines, popups, viewport
```

Add `MapContainer`, `TileLayer`, `Marker`, `Popup`, and `Polyline` only after the list/table view works. This keeps business logic testable and avoids making the map the system of record.

### Step 12 — Implement the dashboard screens

#### Overview

Show:

- active batches;
- meals/units saved;
- deliveries in progress;
- at-risk deliveries;
- unresponsive rider count;
- shelters needing aid;
- live event timeline;
- map.

#### Donations

Show a table with batch status, quantity remaining, expiry countdown, allocation progress, and risk level. Add a create-batch dialog.

#### Deliveries

Show a Kanban or table grouped by status. Each row should show rider, shelter, quantity, expiry, ETA, and last heartbeat.

#### Shelters

Show facility badges, current demand, current status, and actions for **Mark Full**, **Close**, and **Reopen**.

#### Riders

Show availability, capacity, last heartbeat, location, active delivery, and a demo action for **Simulate AFK**.

#### Simulation

Show a scenario checklist with a one-click action for each judge test. Each action must call the real backend logic rather than only mutating local React state.

### Step 13 — Create the simulation scenarios

Seed a deterministic scenario with fixed coordinates and IDs so the demo is repeatable.

#### Scenario A — Tight expiry

1. Create 40 cooked meals with a 12-minute expiry.
2. Place the nearest rider 20 minutes away.
3. Show the batch as blocked with reason `UNSAFE_ARRIVAL_TIME`.

#### Scenario B — 180-meal split

1. Create 180 cooked meals expiring in 75 minutes.
2. Create shelters with demands of 50, 60, and 70.
3. Create riders with capacity 40.
4. Run matching.
5. Show multiple delivery tasks and the allocation explanation.

#### Scenario C — AFK rider

1. Claim a delivery.
2. Stop heartbeats using **Simulate AFK**.
3. Advance time or wait for the watchdog.
4. Show the reservation revoked and the task offered to another rider.

#### Scenario D — Shelter closes mid-transit

1. Claim and pick up a delivery to Shelter A.
2. Move the rider partway along the route.
3. Click **Mark Shelter A Full**.
4. Show an automatic reroute to Shelter B.
5. If no safe shelter exists, show a visible recovery failure instead of silently sending expired aid.

### Step 14 — Add validation and error handling

Standardize API errors:

```ts
{
  error: {
    code: 'SHELTER_FULL',
    message: 'Shelter A cannot receive more cooked meals.',
    details?: Record<string, unknown>,
    requestId: string
  }
}
```

Important error codes:

- `BATCH_EXPIRED`
- `UNSAFE_ARRIVAL_TIME`
- `SHELTER_INCOMPATIBLE`
- `SHELTER_FULL`
- `SHELTER_CLOSED`
- `DELIVERY_ALREADY_CLAIMED`
- `CLAIM_WINDOW_EXPIRED`
- `RIDER_UNRESPONSIVE`
- `NO_SAFE_REROUTE`
- `INVALID_STATUS_TRANSITION`

The frontend should show actionable messages and preserve the event timeline for every rejected operation.

### Step 15 — Test the critical behavior

#### Unit tests

Test pure logic first:

- facility compatibility;
- expiry safety buffer;
- quantity splitting;
- rider capacity limits;
- shelter capacity limits;
- delivery status transition rules;
- reroute candidate ranking;
- stale heartbeat detection.

#### API tests

Use Supertest and an isolated MongoDB instance to verify:

- creating a batch;
- matching a batch;
- claiming a delivery atomically;
- rejecting an expired claim;
- marking a shelter full;
- rerouting an in-transit delivery;
- reassigning an AFK rider.

#### Frontend tests

Use React Testing Library to verify:

- countdown and risk badge rendering;
- simulation button calls the correct API;
- shelter full action updates the visible status;
- reroute event appears in the timeline;
- socket invalidation refreshes the relevant query.

#### End-to-end smoke test

The minimum end-to-end path is:

```text
seed scenario -> create batch -> match -> claim -> pickup -> mark shelter full -> reroute -> deliver
```

### Step 16 — Add observability for the demo

Log every decision with:

- request ID;
- entity IDs;
- previous and next status;
- decision rule that passed or failed;
- ETA and expiry values;
- reroute reason.

Create an admin **Decision Inspector** drawer. For a selected delivery it should answer:

```text
Why was this shelter selected?
Why was this rider rejected?
Why was this delivery blocked?
Why was the task rerouted?
```

This makes the prototype credible to judges and makes debugging much faster.

## 6. Suggested implementation order by milestone

### Milestone 1 — Running skeleton

- Monorepo created.
- Web and API both start.
- MongoDB connection and health endpoint work.
- Shared types compile.
- Basic dashboard shell renders.

### Milestone 2 — Core domain

- Mongoose models created.
- Seed data works.
- Donation, shelter, rider, and delivery endpoints work.
- Basic table views render real API data.

### Milestone 3 — Matching and expiry safety

- Compatibility rules are unit tested.
- Batch splitting works.
- Unsafe arrival is blocked.
- Delivery cards show countdown and decision reasons.

### Milestone 4 — Real-time operations

- Socket.IO connection works.
- Events update operations, rider, shelter, and batch views.
- Map markers and delivery routes render.

### Milestone 5 — Failure recovery

- AFK watchdog works.
- Shelter full/closed recovery works.
- Rerouting and no-safe-reroute states work.

### Milestone 6 — Judge-ready simulation

- One-click deterministic scenarios work.
- Activity timeline and decision inspector work.
- Reset and advance-time controls work.
- README includes demo script.

## 7. Git commit workflow

Commit in small, demonstrable slices. Recommended sequence:

```text
chore: initialize monorepo and shared tooling
feat: add express health endpoint and mongodb connection
feat: add domain models and demo seed data
feat: add batch and shelter APIs
feat: implement compatibility and expiry safety rules
feat: implement quantity splitting and delivery creation
feat: add rider claim and heartbeat workflow
feat: add stale rider watchdog and reassignment
feat: add shelter closure recovery and rerouting
feat: add socket event transport
feat: build operations dashboard and tables
feat: add leaflet dispatch map
feat: add judge simulation scenarios
test: cover matching and recovery workflows
docs: add setup and demo instructions
```

Before each commit, run the narrowest relevant check. Before the final demo, run the complete build, lint, unit tests, API tests, and the end-to-end smoke test.

## 8. Environment and deployment plan

### Local development

- MongoDB local container or local service.
- Vite frontend on port 5173.
- Express/Socket.IO API on port 4000.
- OpenStreetMap tiles for development.

### Production-like demo

- Frontend deployed to a static host.
- API deployed to a Node-compatible host.
- MongoDB Atlas or another managed MongoDB deployment.
- Environment variables configured in the host dashboard.
- Restrict CORS to the deployed frontend origin.
- Use HTTPS because geolocation and reliable WebSocket behavior depend on a secure origin.

Do not use a client-side secret. MongoDB credentials and server-side configuration belong only in the API environment.

## 9. Final acceptance checklist

### Functional

- [ ] A donor can create a donation batch.
- [ ] A batch can be split across multiple riders.
- [ ] Shelter facility rules prevent incompatible assignments.
- [ ] Expired or unsafe deliveries cannot be claimed or completed.
- [ ] A rider must heartbeat/check in.
- [ ] AFK riders are automatically released and reassigned.
- [ ] A full/closed shelter triggers cancellation or rerouting.
- [ ] A no-safe-reroute condition is visible and not silently ignored.
- [ ] Operations receive real-time updates.
- [ ] The simulation panel exercises all four judge scenarios.

### Technical

- [ ] Backend owns all safety decisions.
- [ ] Status transitions are validated.
- [ ] Quantity changes are atomic.
- [ ] Geospatial fields have `2dsphere` indexes.
- [ ] Every recovery action creates an audit event.
- [ ] Shared types are used by frontend and backend.
- [ ] Tests cover the four failure scenarios.
- [ ] README explains setup, seed, demo, and test commands.

### Demo script

1. Open the Operations dashboard.
2. Seed the 180-meal scenario.
3. Run matching and explain the split.
4. Claim one delivery as Rider 1.
5. Simulate Rider 1 going AFK and show reassignment.
6. Claim another delivery and move it to transit.
7. Mark Shelter A full.
8. Show the reroute to Shelter B and the event timeline.
9. Create a tight-expiry batch and show the unsafe-arrival block.
10. Reset the scenario and repeat if necessary.

## 10. First implementation slice

The first coding slice should be deliberately small and verifiable:

1. Create the monorepo.
2. Start the API and web app.
3. Add MongoDB connection and `/api/v1/health`.
4. Add shared enums and schemas.
5. Add seed data for donors, riders, shelters, one batch, and demands.
6. Render the dashboard with live batch, shelter, rider, and delivery counts.

Once that slice passes, implement the pure compatibility and matching functions before adding real-time behavior. This keeps the hardest rules deterministic and testable from the beginning.
