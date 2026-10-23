# CivicAid Dispatch — Judge Demonstration & Evaluation Runbook

This document is the official evaluation script for hackathon judges, technical evaluators, and demonstrators testing **CivicAid Dispatch**.

---

## 🧭 Evaluation Premise

CivicAid Dispatch coordinates emergency aid distribution under extreme real-world uncertainty. Unlike standard e-commerce delivery platforms, our logistics coordinator:
1. **Never delivers spoiled food**: Mathematical safe arrival equation $t_{\text{now}} + t_{\text{travel}} + t_{\text{buffer}} < t_{\text{expiry}}$.
2. **Never overloads vehicles**: Mathematical capacity splitting $\min(Q_{\text{batch}}, Q_{\text{demand}}, C_{\text{rider}})$.
3. **Never loses food mid-transit**: Dynamic rerouting when shelters become full or close.
4. **Never leaves tasks abandoned**: Silent rider watchdog ($>60\text{s}$) with automated reclamation.

---

## 🛠️ Pre-Flight Verification

1. Open **`http://localhost:5173`** in your browser.
2. Verify the top-right status indicator displays:
   - 🟢 **`Real-Time Connected`** (proves live Socket.IO connection to backend on port 4000).
3. Click the **`Reset Demo Data`** button at the bottom of the left sidebar.
   - A toast notification will confirm: *"Scenario reset to clean deterministic state"*.
4. Verify the Overview KPI cards:
   - **Active Batches**: `1` (180 cooked meals)
   - **Active Deliveries**: `0`
   - **Open Shelters**: `3` (Shelter Alpha, Bravo, Charlie)
   - **Available Riders**: `5` (Capacity 40 each)

---

## 🎬 1-Click Evaluation Scenarios

Navigate to the **`Judge Scenarios`** tab in the sidebar. All 5 test scenarios can be triggered with one click.

---

### Scenario 1 — 180-Meal Multi-Rider Capacity Split
**Challenge**: A donor gives 180 hot cooked meals. 3 shelters need food (50, 60, 70 meals). Standard bike riders can only carry 40 meals. How do you legally distribute this?

1. Click **`Execute Scenario 1`**.
2. **What happens automatically**:
   - The platform resets to clean state.
   - Executes the pure matching engine on Batch `#affcd8` (180 meals).
   - Automatically navigates to the **Deliveries** tab.
3. **What to verify**:
   - 5 separate delivery tasks are generated:
     - Task 1: 40 meals $\to$ Shelter Alpha
     - Task 2: 40 meals $\to$ Shelter Bravo
     - Task 3: 40 meals $\to$ Shelter Charlie
     - Task 4: 40 meals (split to fulfill remainder)
     - Task 5: 20 meals (split to fulfill remainder)
   - Total allocated = **180 meals** ($40 + 40 + 40 + 40 + 20 = 180$).
   - Switch to **Live Map** tab: 5 route polylines are visible connecting the Central Hub (📦) to the 3 shelters.

---

### Scenario 2 — Unresponsive Rider (AFK) Watchdog
**Challenge**: A rider claims a delivery, but their phone runs out of battery or they lose connectivity in a dead zone. The perishable food cannot sit idle.

1. Ensure at least one delivery is offered or claimed.
2. Click **`Execute Scenario 2`**.
3. **What happens automatically**:
   - The rider claims the task.
   - Simulates $>60\text{s}$ elapsed since their last heartbeat.
   - The server watchdog detects staleness.
4. **What to verify**:
   - Real-time toast alert: *"⚠️ Real-Time: Rider #... marked AFK!"*
   - Switch to **Riders** tab: The target rider is marked in red with status **`AFK`**.
   - Switch to **Deliveries** tab: The delivery was revoked from the unresponsive rider and is back in **`OFFERED`** status, ready for assignment to an active rider.
   - Switch to **Overview** tab: The audit log records: `RIDER_DECLARED_AFK`.

---

### Scenario 3 — Shelter Full Mid-Transit Dynamic Reroute
**Challenge**: Rider is in transit carrying 40 cooked meals to Shelter Alpha. Suddenly, Shelter Alpha calls to report they received unexpected aid and are at 100% capacity.

1. Click **`Execute Scenario 3`**.
2. **What happens automatically**:
   - Claims an offered delivery, picks up the aid, and moves into **`IN_TRANSIT`**.
   - Marks Shelter Alpha as **`FULL`**.
   - Engine dynamically calculates travel time from current rider coordinates to alternative shelters with open demand and matching facilities.
   - Diverts the rider to Shelter Bravo or Charlie.
3. **What to verify**:
   - Real-time toast alert: *"⚡ Real-Time: Delivery #... rerouted to new shelter!"*
   - Switch to **Deliveries** tab:
     - The delivery destination is now updated to the alternative shelter.
     - The **Reroutes** column displays: `1 rerouted`.
   - Switch to **Live Map** tab:
     - Shelter Alpha marker displays red **`🛑 FULL`**.
     - The rerouted path polyline is highlighted in **Amber/Orange**.

---

### Scenario 4 — Unsafe / Expiry Delivery Hard Block
**Challenge**: A donor attempts to donate 100 kits of raw ration requiring clean water and cooking fuel. Shelters in the area lack clean water and fuel. Will the platform dispatch it anyway?

1. Click **`Execute Scenario 4`**.
2. **What happens automatically**:
   - Creates a donation batch of `RAW_RATION` with requirements: `requiresCleanWater: true`, `requiresCookingFuel: true`.
   - Runs the matching engine against all open shelters.
3. **What to verify**:
   - Toast alert: *"Safety check: batch blocked! Shelter does not have clean water and cooking fuel"*.
   - Switch to **Donations** tab: The batch remains `AVAILABLE` with 0 deliveries generated.
   - Proves **hard safety invariants cannot be bypassed**.

---

### Scenario 5 — No Safe Alternative (Escalation to Human Recovery)
**Challenge**: Food is on the road, destination becomes full, but ALL alternative shelters in the city are also full or closed. What does the system do?

1. Click **`Execute Scenario 5`**.
2. **What happens automatically**:
   - Closes alternative shelters and marks destination full.
   - The rerouting engine searches for viable alternatives and determines none exist.
3. **What to verify**:
   - The delivery status changes to **`RECOVERY_REQUIRED`** with failure reason:
     *"No reachable shelter with compatible facilities and capacity"*.
   - Overview KPI card **At-Risk Deliveries** increments in red.
   - Audit trail logs a **`CRITICAL`** event requiring immediate human dispatcher intervention.

---

## 🔍 Interactive Features to Explore

| Feature | Where to Test | What to Look For |
|---|---|---|
| **Basemap Switcher** | Top-right of Live Map | Toggle between `🌙 Dark` (Esri Canvas), `🗺️ Streets` (OpenStreetMap), and `🛰️ Satellite` (Esri Imagery). Zero API keys required. |
| **Interactive Map Popups** | Live Map | Click on 📦 Central Hub, 🏠 Shelters, 🏍️ Riders, or dashed route lines to inspect live telemetry and occupancy percentages. |
| **Simulation Clock** | Topbar `+15m Clock` button | Advances server simulation clock by 15 minutes, triggering automated expiration of stale claim windows. |
| **Create Custom Batch** | Donations tab $\to$ `Create Batch` | Enter custom aid types, quantities, and handling checkboxes. |
| **Add Shelter Demand** | Shelters tab $\to$ `+ Add Demand` | Add custom demand directly to any shelter facility. |
| **Lifecycle Actions** | Deliveries tab | Manually step any delivery through `Claim` $\to$ `En Route` $\to$ `Pick Up` $\to$ `In Transit` $\to$ `Deliver`. |
