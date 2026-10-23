# CivicAid Dispatch — REST API & WebSocket Protocol Reference

Base URL: `http://localhost:4000/api/v1`  
Proxy URL (Frontend): `/api/v1`

---

## 1. Protocol Conventions

### 1.1 Standard Response Envelope
All REST API responses adhere to a uniform JSON envelope:

#### Successful Response (`2xx`)
```json
{
  "success": true,
  "data": { ... }
}
```

#### Error Response (`4xx`, `5xx`)
```json
{
  "success": false,
  "error": {
    "code": "DOMAIN_ERROR_CODE",
    "message": "Human-readable explanation of error",
    "details": {}
  }
}
```

### 1.2 Headers
- `Content-Type: application/json`
- `X-Request-Id`: Unique UUID generated per request for end-to-end tracing across server logs.

---

## 2. API Endpoints

### 2.1 Health & Diagnostics

#### `GET /health`
Returns system status, current database connection state, and uptime.

- **Request**: None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-10-23T09:41:22.093Z",
  "uptime": 24.5,
  "database": "connected"
}
```

---

### 2.2 Operations & Auditing

#### `GET /operations/summary`
Returns high-level operational counts for the dashboard KPI cards.

- **Request**: None
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "totalActiveBatches": 1,
    "activeDeliveries": 5,
    "openShelters": 3,
    "availableRiders": 0,
    "atRiskDeliveries": 0,
    "criticalEventsCount": 0
  }
}
```

#### `GET /operations/events`
Returns recent operational audit logs sorted newest first.

- **Query Parameters**:
  - `limit` *(optional, number, default: 30)*: Maximum items to return.
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "6718a5bf...",
      "type": "DELIVERY_REROUTED",
      "severity": "WARNING",
      "message": "Rerouted delivery 6718a5bf... from Shelter Alpha to Shelter Bravo (Shelter became full)",
      "entityType": "Delivery",
      "entityId": "6718a5bf...",
      "metadata": {
        "fromShelterId": "6718a5be...",
        "toShelterId": "6718a5be...",
        "travelMinutes": 18
      },
      "createdAt": "2026-10-23T09:45:00.000Z"
    }
  ]
}
```

---

### 2.3 Donation Batches

#### `GET /batches`
Lists all donation batches sorted by creation time descending.

- **Response `200 OK`**: Array of `DonationBatch` objects.

#### `GET /batches/:id`
Retrieves a specific donation batch by its MongoDB ID.

- **Response `200 OK`**: Single `DonationBatch` object.
- **Response `404 Not Found`**: `{ "code": "BATCH_NOT_FOUND" }`

#### `POST /batches`
Registers a new donation batch.

- **Request Body**:
```json
{
  "donorId": "6718a5be0000000000000001",
  "aidType": "COOKED_MEALS",
  "quantity": 180,
  "unit": "meals",
  "pickupLocation": {
    "type": "Point",
    "coordinates": [77.2195, 28.6328]
  },
  "expiresAt": "2026-10-23T12:00:00.000Z",
  "handling": {
    "requiresCleanWater": false,
    "requiresCookingFuel": false,
    "requiresRefrigeration": false
  },
  "notes": "Hot lentil curry and rice"
}
```
- **Response `201 Created`**: Returns created `DonationBatch`.
- **Response `400 Bad Request`**: If validation fails or expiry timestamp is in the past.

#### `POST /batches/:id/match`
Executes the pure logistics matching engine on the batch. Evaluates all open demands and available riders, calculates capacity splits, generates `Delivery` tasks in `OFFERED` status, reserves riders, and logs audit events.

- **Request**: Empty body
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "plan": {
      "batchId": "6718a5be...",
      "totalAllocated": 180,
      "unallocatedQuantity": 0,
      "allocations": [
        {
          "shelterId": "6718a5be...",
          "demandId": "6718a5be...",
          "riderId": "6718a5be...",
          "quantity": 40,
          "travelMinutes": 15
        }
      ],
      "rejections": []
    },
    "deliveries": [ ... ]
  }
}
```

---

### 2.4 Shelters & Demands

#### `GET /shelters`
Returns all shelters with populated active demands and facility details.

- **Response `200 OK`**: Array of `Shelter` objects.

#### `POST /shelters/:id/demands`
Creates a new aid demand for a specific shelter.

- **Request Body**:
```json
{
  "aidType": "COOKED_MEALS",
  "requestedQuantity": 60,
  "urgency": "HIGH"
}
```
- **Response `201 Created`**: Returns created `Demand` document.

#### `PATCH /shelters/:id`
Updates shelter properties (e.g. status, occupancy, contact info).

- **Request Body**:
```json
{
  "status": "OPEN",
  "currentOccupancy": 45
}
```
- **Response `200 OK`**: Updated `Shelter` document.

#### `POST /shelters/:id/full`
Marks a shelter as `FULL` and triggers immediate dynamic rerouting of all active in-transit deliveries.

- **Request**: Empty body
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "shelter": { "_id": "...", "status": "FULL" },
    "reroutedDeliveries": ["6718a5bf..."],
    "failedDeliveries": []
  }
}
```

#### `POST /shelters/:id/close`
Closes a shelter, releasing all unfilled demands and rerouting any in-flight deliveries.

- **Request**: Empty body
- **Response `200 OK`**: Same structure as `/full`.

---

### 2.5 Riders & Fleet Telemetry

#### `GET /riders`
Returns all riders with populated user information and active delivery reference.

- **Response `200 OK`**: Array of `Rider` objects.

#### `PATCH /riders/:id/location`
Updates rider's current GeoJSON coordinates and refreshes heartbeat timestamp.

- **Request Body**:
```json
{
  "location": {
    "type": "Point",
    "coordinates": [77.2250, 28.6350]
  }
}
```
- **Response `200 OK`**: Updated `Rider` document.

---

### 2.6 Deliveries & Lifecycle Management

#### `GET /deliveries`
Returns delivery tasks. Filterable by status or assigned rider.

- **Query Parameters**:
  - `status` *(optional, string)*: Filter by status (e.g. `OFFERED`, `IN_TRANSIT`, `DELIVERED`).
  - `riderId` *(optional, string)*: Filter by assigned rider.
- **Response `200 OK`**: Array of populated `Delivery` objects.

#### `POST /deliveries/:id/claim`
Allows a rider to claim an offered delivery within the valid claim window.

- **Request Body**:
```json
{
  "riderId": "6718a5be0000000000000010"
}
```
- **Response `200 OK`**: Delivery transitioned to `CLAIMED`, rider set to `BUSY`.
- **Response `400 Bad Request`**: If claim window expired or delivery is not `OFFERED`.

#### `POST /deliveries/:id/heartbeat`
Records an in-transit heartbeat and optional telemetry point.

- **Request Body**:
```json
{
  "location": {
    "type": "Point",
    "coordinates": [77.2201, 28.6340]
  }
}
```
- **Response `200 OK`**: `{ "success": true, "lastHeartbeatAt": "..." }`

#### `POST /deliveries/:id/status`
Advances the delivery along its legal lifecycle state machine.

- **Request Body**:
```json
{
  "status": "IN_TRANSIT",
  "note": "Rider picked up meals and is on the road"
}
```
- **Response `200 OK`**: Updated `Delivery` document.
- **Response `400 Bad Request`**: If transition is illegal (e.g. `OFFERED` directly to `DELIVERED`).

---

### 2.7 Simulation & Judge Demo Endpoints

#### `POST /demo/reset`
Clears all dynamic data and reseeds the platform to the initial deterministic demo state.

- **Response `200 OK`**: Confirmation object with counts of seeded entities.

#### `POST /demo/advance-time`
Simulates the passage of time on the server to test expiry and timeout rules without waiting in real time.

- **Request Body**:
```json
{
  "minutes": 15
}
```
- **Response `200 OK`**: Results from watchdog evaluation showing expired claim offers.

#### `POST /demo/simulate-afk`
Manually triggers an AFK event on a specific rider, revoking their active task and re-offering it.

- **Request Body**:
```json
{
  "riderId": "6718a5be0000000000000010"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "rider": { "_id": "...", "status": "AFK" },
    "watchdogResult": {
      "staleRiders": 1,
      "reassignedDeliveries": 1,
      "expiredOffers": 0
    }
  }
}
```

---

## 3. WebSocket Real-Time Protocol (Socket.IO)

- **Transport**: `websocket`, with fallback to `polling`
- **Path**: `/socket.io/`

### 3.1 Room Management
Clients emit room management messages:
```javascript
socket.emit('join:room', 'operations');
socket.emit('join:room', 'rider:6718a5be...');
socket.emit('leave:room', 'operations');
```

### 3.2 Real-Time Event Catalogue

| Event Name | Trigger | Payload Summary |
|---|---|---|
| `BATCH_CREATED` | New donation batch registered | Batch metadata & quantity |
| `MATCH_PLAN_CREATED` | Batch matched into delivery tasks | Allocations count, total allocated, remaining |
| `DELIVERY_OFFERED` | Delivery task offered to rider | Delivery ID, rider ID, quantity, ETA |
| `DELIVERY_CLAIMED` | Rider accepts delivery | Delivery ID, rider ID, timestamp |
| `DELIVERY_STATUS_CHANGED`| Lifecycle step advanced | Delivery ID, old status, new status |
| `DELIVERY_REROUTED` | In-flight route diverted to new shelter | Delivery ID, from shelter, to shelter, revised ETA |
| `RIDER_DECLARED_AFK` | Watchdog detects silent rider | Rider ID, revoked delivery ID |
| `SHELTER_STATUS_CHANGED` | Shelter marked FULL or CLOSED | Shelter ID, new status, affected count |
| `OPERATION_EVENT_CREATED`| Audit trail entry logged | Event record with severity and metadata |
