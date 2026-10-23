# CivicAid Dispatch — Layered Build Plan

This document turns the complete workflow into small layers that can be built, tested, and demonstrated independently.

## How to use this plan

- Build one layer at a time.
- Do not start the next layer until the current layer's exit checks pass.
- Keep the backend as the authority for safety, expiry, capacity, and status decisions.
- Build the simplest working version first; add maps, real-time behavior, authentication, and visual polish after the core rules work.
- Each layer should produce something visible or testable.

## Layer overview

| Layer | Name | Main outcome |
|---|---|---|
| 0 | Product contract | Clear scope, roles, scenarios, and demo script |
| 1 | Project foundation | React and Express applications start successfully |
| 2 | Shared domain | Frontend and backend agree on types and validation |
| 3 | Persistence | MongoDB stores users, shelters, riders, batches, demands, and deliveries |
| 4 | Logistics engine | Matching, splitting, compatibility, expiry, and status rules work without HTTP/UI |
| 5 | Backend API | The core workflow is usable through REST endpoints |
| 6 | Frontend shell | Operators can view and create domain data |
| 7 | Real-time operations | Status, heartbeat, and event updates appear live |
| 8 | Maps and routing view | Riders, shelters, pickup points, and routes are visible spatially |
| 9 | Failure simulation | Judges can trigger all required failure scenarios |
| 10 | Hardening and delivery | Tests, observability, deployment, and demo readiness are complete |

---

## Layer 0 — Product contract

### Goal

Agree on what the MVP must prove before writing application code.

### Define

#### Roles

- Donor
- Rider
- Shelter
- Operations/admin

#### Core entities

- Donation batch
- Shelter demand
- Rider
- Delivery task
- Operation event

#### Required judge scenarios

1. Split 180 meals across multiple riders and shelters.
2. Revoke and reassign an unresponsive rider's task.
3. Reroute a delivery when the destination shelter becomes full.
4. Block unsafe deliveries caused by expiry or missing facilities.

#### MVP decisions

- Use seeded demo users instead of production authentication.
- Use deterministic coordinates and demo data.
- Use a server-side simulation clock or time-advance endpoint for repeatable demos.
- Use a greedy matching algorithm rather than a full optimization solver.

### Deliverables

- One-page product brief.
- Entity list and status list.
- Demo script.
- Initial acceptance checklist.

### Exit check

The team can explain the four scenarios without discussing implementation details.

---

## Layer 1 — Project foundation

### Goal

Create a clean monorepo where the frontend and backend can run independently and together.

### Build

```text
apps/web       React + Vite + TypeScript
apps/api       Node.js + Express + TypeScript
packages/shared Shared types, schemas, enums, and logistics helpers
```

Add:

- npm workspaces;
- TypeScript configuration;
- ESLint and Prettier;
- root `.env.example`;
- root `dev`, `build`, `lint`, and `test` scripts;
- API health endpoint;
- basic frontend route and app shell placeholder.

### Suggested checks

```bash
npm run dev
npm run build
npm run lint
```

### Exit check

- Frontend opens at the Vite URL.
- `GET /api/v1/health` returns success.
- The shared package compiles.
- No MongoDB connection is required yet for the health endpoint.

### Do not build yet

- Leaflet map
- Socket.IO
- Authentication
- Complex dashboard pages

---

## Layer 2 — Shared domain contract

### Goal

Prevent frontend/backend disagreement before adding persistence or business logic.

### Build in `packages/shared`

Define:

- `UserRole`;
- `AidType`;
- `BatchStatus`;
- `DeliveryStatus`;
- `RiderStatus`;
- `ShelterStatus`;
- facility requirements;
- GeoJSON point type;
- API error type;
- Socket event payloads.

Add Zod schemas for:

- create donation batch;
- create/update shelter demand;
- rider heartbeat;
- location update;
- delivery status update;
- simulation commands.

### Example status lifecycle

```text
Donation:
DRAFT -> AVAILABLE -> PARTIALLY_ALLOCATED -> ALLOCATED -> EXPIRED

Delivery:
PENDING -> OFFERED -> CLAIMED -> EN_ROUTE_TO_PICKUP
         -> PICKED_UP -> IN_TRANSIT -> DELIVERED
```

Recovery states:

```text
CLAIMED -> REASSIGNED
IN_TRANSIT -> REROUTING -> IN_TRANSIT
IN_TRANSIT -> RECOVERY_REQUIRED
```

### Suggested checks

- Valid payloads pass schema validation.
- Invalid aid types, negative quantities, and past expiry dates fail.
- Status transition tests reject illegal transitions.

### Exit check

The web and API apps import the same enums and request schemas from the shared package.

---

## Layer 3 — Persistence and seed data

### Goal

Store the minimum domain data required for the complete workflow.

### MongoDB collections

Create these Mongoose models:

1. `User`
2. `Rider`
3. `Shelter`
4. `Demand`
5. `DonationBatch`
6. `Delivery`
7. `OperationEvent`

### Important fields

#### Donation batch

```text
aidType
quantity
remainingQuantity
pickupLocation
expiresAt
handling requirements
status
```

#### Rider

```text
status
vehicleCapacity
currentLocation
lastHeartbeatAt
activeDeliveryId
```

#### Shelter

```text
status
location
capacity
currentOccupancy
facilities
acceptedAidTypes
```

#### Delivery

```text
batchId
demandId
riderId
quantity
status
estimatedMinutes
claimExpiresAt
lastHeartbeatAt
rerouteCount
failureReason
```

### Indexes

- `2dsphere` index on rider location.
- `2dsphere` index on shelter location.
- Index donation batches by `status` and `expiresAt`.
- Index deliveries by `status`, `claimExpiresAt`, and `lastHeartbeatAt`.

### Seed data

Seed:

- one donor;
- five riders with capacity 40;
- three shelters with different facility combinations;
- three demands totaling at least 180 meals;
- one sample donation batch;
- operation events describing the seed.

### Suggested checks

```bash
npm run seed -w apps/api
```

Verify the records through a temporary debug endpoint or database inspection script.

### Exit check

The database can be reset and reseeded with the same deterministic IDs and coordinates.

---

## Layer 4 — Pure logistics engine

### Goal

Implement the hardest business rules without Express, React, Socket.IO, or Leaflet.

This is the most important layer. Keep functions deterministic and easy to unit test.

### Build these functions

```ts
isFacilityCompatible(batch, shelter): boolean
canArriveBeforeExpiry(now, expiresAt, travelMinutes, safetyBuffer): boolean
getEligibleShelters(batch, shelters, demands, now): CandidateShelter[]
getEligibleRiders(pickupLocation, riders): CandidateRider[]
splitQuantity(batchQuantity, demandQuantity, riderCapacity): number
rankCandidates(candidates): Candidate[]
buildMatchPlan(input): MatchPlan
canTransitionDelivery(from, to): boolean
findRerouteDestination(input): RerouteDecision
isHeartbeatStale(lastHeartbeatAt, now, timeout): boolean
```

### Rule order

Always apply hard safety filters before ranking:

1. Batch is not expired.
2. Shelter is open.
3. Shelter has demand and capacity.
4. Aid type is accepted.
5. Facility requirements are satisfied.
6. Arrival is before expiry plus the safety buffer.
7. Rider has capacity and is available.

Only then rank by urgency, ETA, and distance.

### Quantity splitting

Use:

```text
allocation = min(batchRemaining, demandRemaining, riderCapacity)
```

Continue until:

- no batch quantity remains;
- no shelter demand remains;
- no rider is eligible; or
- every remaining delivery fails safety checks.

### Example

For 180 meals and rider capacity 40:

```text
40 + 40 + 40 + 40 + 20 = 180
```

The actual plan must still respect shelter demand and safe arrival.

### Tests required before continuing

- Raw ration is rejected without clean water and cooking fuel.
- Expired food is rejected.
- Delivery arriving after expiry is rejected.
- Shelter capacity limits allocation.
- Rider capacity limits allocation.
- 180 meals split into valid portions.
- A full shelter is excluded.
- Reroute chooses only a compatible, reachable shelter.
- No valid reroute returns `RECOVERY_REQUIRED`.

### Exit check

The matching and recovery tests pass without a running server or browser.

---

## Layer 5 — Backend API

### Goal

Expose the domain workflow through REST endpoints.

### Implement in this order

#### 5.1 Read endpoints

```text
GET /api/v1/health
GET /api/v1/batches
GET /api/v1/shelters
GET /api/v1/riders
GET /api/v1/deliveries
GET /api/v1/operations/summary
GET /api/v1/operations/events
```

#### 5.2 Create/update endpoints

```text
POST  /api/v1/batches
POST  /api/v1/shelters/:id/demands
PATCH /api/v1/shelters/:id
PATCH /api/v1/riders/:id/location
```

#### 5.3 Workflow endpoints

```text
POST /api/v1/batches/:id/match
POST /api/v1/deliveries/:id/claim
POST /api/v1/deliveries/:id/heartbeat
POST /api/v1/deliveries/:id/status
POST /api/v1/shelters/:id/full
POST /api/v1/shelters/:id/close
```

#### 5.4 Demo endpoints

```text
POST /api/v1/demo/seed
POST /api/v1/demo/reset
POST /api/v1/demo/advance-time
POST /api/v1/demo/simulate-afk
```

### Backend service boundaries

```text
controllers -> validate input and format response
services    -> perform domain workflow
models      -> read/write MongoDB
events      -> append audit events and publish notifications
```

Controllers must not contain matching or recovery logic.

### Transactions

Use a MongoDB transaction for operations that change multiple records:

- claim delivery and reserve rider;
- create allocation plan and update quantities;
- mark shelter full and process affected deliveries;
- release stale rider and requeue work.

### Suggested checks

Write Supertest cases for the four judge scenarios before building the UI.

### Exit check

The entire MVP workflow can be completed using API requests only.

---

## Layer 6 — Frontend shell and operational views

### Goal

Make the API workflow visible and usable without real-time behavior or maps.

### Build the shell

- Sidebar navigation.
- Top bar with simulation clock, connection status, and active alerts.
- Main content area.
- Toast notifications.
- Shared loading, empty, and error states.

### Build screens in this order

#### 6.1 Overview

Show:

- total active batches;
- active deliveries;
- open shelters;
- available riders;
- at-risk deliveries;
- recent operation events.

#### 6.2 Donations

- Donation table.
- Create donation dialog.
- Quantity remaining.
- Expiry countdown.
- Allocation progress.

#### 6.3 Deliveries

- Delivery table or Kanban view.
- Status badge.
- Rider.
- Shelter.
- Quantity.
- ETA.
- Last heartbeat.

#### 6.4 Shelters and riders

- Shelter demand and facility badges.
- Mark Full and Close actions.
- Rider capacity, status, location, and heartbeat.
- Simulate AFK action.

### UI rule

Every important backend decision should have a visible reason. For example:

```text
Blocked: arrival estimate is 8 minutes after expiry.
Rejected: shelter does not have clean water.
Reassigned: rider heartbeat expired 35 seconds ago.
Rerouted: destination shelter became full.
```

### Exit check

An operator can seed data, create a batch, run matching, claim a delivery, change shelter status, and inspect the result from the browser.

---

## Layer 7 — Real-time operations

### Goal

Make changes appear automatically across dashboards.

### Backend

Add Socket.IO rooms:

```text
operations
rider:<id>
shelter:<id>
batch:<id>
```

Publish events for:

- batch creation/update;
- match plan creation;
- delivery offered/claimed/status change;
- rider location and heartbeat;
- rider declared AFK;
- shelter status change;
- delivery reroute;
- recovery failure;
- operation event creation.

### Frontend

Use socket events to invalidate TanStack Query data. The socket event should trigger a refetch; it should not replace the API as the authoritative data source.

### Exit check

Open two browser windows. A change in one window appears in the other without a manual refresh.

---

## Layer 8 — Leaflet map and route visualization

### Goal

Add spatial context after the operational workflow already works in tables.

### Map elements

- Donor pickup markers.
- Shelter markers colored by `OPEN`, `FULL`, `CLOSED`, and `PAUSED`.
- Rider markers colored by availability.
- Delivery route lines.
- Rerouted route lines.
- Expiry-risk styling.

### Component structure

```text
DispatchMap
├─ PickupMarker
├─ ShelterMarker
├─ RiderMarker
├─ DeliveryPolyline
└─ MapLegend
```

Keep map rendering separate from matching and recovery logic. The map consumes query data; it does not decide where a delivery should go.

### MVP routing approach

- Use deterministic straight-line or mocked route polylines for the hackathon.
- Use a travel-time estimate service abstraction.
- Keep the abstraction ready for a real routing provider later.

### Exit check

The map clearly shows the pickup point, original destination, active rider, and new destination after rerouting.

---

## Layer 9 — Failure simulation and judge controls

### Goal

Turn backend behavior into a repeatable, one-click demonstration.

### Simulation panel sections

#### Scenario setup

- Seed full scenario.
- Reset scenario.
- Advance simulation clock.

#### Failure actions

- Create tight-expiry batch.
- Run 180-meal split.
- Simulate AFK rider.
- Mark Shelter A full.
- Close Shelter A.
- Add direct donation to Shelter A.

#### Evidence panels

- Event timeline.
- Delivery state transition history.
- Decision inspector.
- Active alerts.
- Match plan explanation.

### Scenario implementation order

1. Tight-expiry block.
2. 180-meal split.
3. AFK reassignment.
4. Shelter-full reroute.
5. No-safe-reroute failure.

### Important rule

Simulation buttons must call real backend services. Do not implement a fake frontend-only state change for the demo.

### Exit check

Each judge scenario can be reset and repeated with the same result.

---

## Layer 10 — Hardening and delivery

### Goal

Make the prototype stable, explainable, and easy for another person to run.

### Add tests

#### Unit

- compatibility;
- expiry;
- splitting;
- ranking;
- status transitions;
- stale heartbeat;
- rerouting.

#### API

- create batch;
- match batch;
- claim delivery;
- reject expired claim;
- mark shelter full;
- reassign AFK rider;
- reroute in-transit delivery.

#### Frontend

- countdown and risk badges;
- simulation controls;
- event timeline;
- shelter status updates;
- delivery detail drawer.

### Add observability

For each decision, record:

- request ID;
- entity IDs;
- previous and next status;
- ETA;
- expiry time;
- decision rule;
- rejection or recovery reason.

### Add production safety

- CORS allowlist.
- Server-side environment secrets.
- Request validation.
- Central error handler.
- Rate limits for public endpoints.
- HTTPS in deployed environments.
- MongoDB indexes.
- Graceful shutdown for API and Socket.IO.

### Add documentation

The README should contain:

1. Prerequisites.
2. Environment setup.
3. MongoDB startup instructions.
4. Install and dev commands.
5. Seed/reset commands.
6. Test commands.
7. Judge demo script.
8. Architecture diagram or link to this document.

### Exit check

Another developer can clone the repository, configure the environment, start the app, seed the scenario, and run the complete demo without asking for undocumented steps.

---

## Recommended coding order inside each layer

For each layer, follow this loop:

```text
1. Create the smallest implementation.
2. Add one happy-path test.
3. Add the relevant failure-path test.
4. Run formatting, lint, and the narrow test command.
5. Connect the implementation to the next layer.
6. Commit a focused change.
```

Do not move forward because the UI looks complete. Move forward when the layer's behavior is verified.

## Suggested commit sequence

```text
chore: initialize workspace and app packages
feat: add shared domain enums and schemas
feat: add mongodb models and deterministic seed
feat: implement pure logistics rules
feat: implement matching and quantity splitting
feat: add donation, shelter, rider, and delivery APIs
feat: add claim, heartbeat, and stale rider recovery
feat: add shelter closure and rerouting
feat: build operational dashboard views
feat: add socket event updates
feat: add leaflet dispatch map
feat: add deterministic judge simulations
test: cover failure scenarios end to end
docs: add setup and demo instructions
```

## Fastest path to a working demo

If time is limited, stop after each of these checkpoints:

### Checkpoint A — Data dashboard

Layers 0–3. You have seeded MongoDB data and visible dashboard counts.

### Checkpoint B — Core logistics demo

Layers 4–5. You can create, split, claim, reject, and reroute deliveries through the API.

### Checkpoint C — Browser demo

Layer 6. Judges can operate the workflow from the browser without maps or sockets.

### Checkpoint D — Live demo

Layers 7–9. Updates are real-time, routes are visible, and all four failure scenarios are one-click actions.

### Checkpoint E — Submission-ready

Layer 10. Tests, README, logs, deployment configuration, and the final demo script are complete.

## Final build rule

The dependency order is:

```text
contract -> foundation -> shared types -> database -> pure rules
-> API -> UI -> real-time -> maps -> simulation -> hardening
```

Keep this order unless there is a strong reason to change it. In particular, do not build the map or polished dashboard before the logistics engine can correctly block, split, reassign, and reroute aid.
