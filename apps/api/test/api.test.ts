import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';

describe('Layer 5 — Backend REST API Integration', () => {
  let baseUrl: string;
  let server: any;

  before(async () => {
    await connectDatabase();
    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  after(async () => {
    if (server) server.close();
    await mongoose.disconnect();
  });

  it('1. GET /health returns 200 and healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.database, 'connected');
  });

  it('2. POST /demo/reset resets and reseeds scenario', async () => {
    const res = await fetch(`${baseUrl}/demo/reset`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.success, true);
  });

  it('3. GET /batches, /shelters, /riders return seeded entities', async () => {
    const [bRes, sRes, rRes] = await Promise.all([
      fetch(`${baseUrl}/batches`),
      fetch(`${baseUrl}/shelters`),
      fetch(`${baseUrl}/riders`),
    ]);

    assert.equal(bRes.status, 200);
    assert.equal(sRes.status, 200);
    assert.equal(rRes.status, 200);

    const batches = (await bRes.json()).data;
    const shelters = (await sRes.json()).data;
    const riders = (await rRes.json()).data;

    assert.equal(batches.length, 1);
    assert.equal(batches[0].quantity, 180);
    assert.equal(shelters.length, 3);
    assert.equal(riders.length, 5);
  });

  it('4. POST /batches/:id/match matches the 180-meal batch and creates delivery tasks', async () => {
    const bRes = await fetch(`${baseUrl}/batches`);
    const batches = (await bRes.json()).data;
    const batchId = batches[0]._id;

    const matchRes = await fetch(`${baseUrl}/batches/${batchId}/match`, { method: 'POST' });
    assert.equal(matchRes.status, 200);
    const matchBody = await matchRes.json();

    assert.ok(matchBody.data.plan);
    assert.ok(matchBody.data.deliveries.length > 0);
    assert.ok(matchBody.data.plan.totalAllocated > 0);
  });

  it('5. POST /deliveries/:id/claim allows rider to claim an offered delivery', async () => {
    const delRes = await fetch(`${baseUrl}/deliveries?status=OFFERED`);
    const deliveries = (await delRes.json()).data;
    assert.ok(deliveries.length > 0, 'Must have at least one offered delivery');

    const targetDelivery = deliveries[0];
    const claimRes = await fetch(`${baseUrl}/deliveries/${targetDelivery._id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riderId: targetDelivery.riderId._id || targetDelivery.riderId }),
    });

    assert.equal(claimRes.status, 200);
    const claimBody = await claimRes.json();
    assert.equal(claimBody.data.status, 'CLAIMED');
  });

  it('6. POST /deliveries/:id/heartbeat records heartbeat timestamp and coordinates', async () => {
    const delRes = await fetch(`${baseUrl}/deliveries?status=CLAIMED`);
    const deliveries = (await delRes.json()).data;
    assert.ok(deliveries.length > 0);
    const target = deliveries[0];

    const hbRes = await fetch(`${baseUrl}/deliveries/${target._id}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { type: 'Point', coordinates: [77.2200, 28.6330] },
      }),
    });

    assert.equal(hbRes.status, 200);
    const hbBody = await hbRes.json();
    assert.equal(hbBody.data.success, true);
    assert.ok(hbBody.data.lastHeartbeatAt);
  });

  it('7. POST /deliveries/:id/status advances delivery lifecycle', async () => {
    const delRes = await fetch(`${baseUrl}/deliveries?status=CLAIMED`);
    const target = (await delRes.json()).data[0];

    // CLAIMED -> EN_ROUTE_TO_PICKUP
    const s1 = await fetch(`${baseUrl}/deliveries/${target._id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'EN_ROUTE_TO_PICKUP' }),
    });
    assert.equal(s1.status, 200);
    assert.equal((await s1.json()).data.status, 'EN_ROUTE_TO_PICKUP');

    // EN_ROUTE_TO_PICKUP -> PICKED_UP
    const s2 = await fetch(`${baseUrl}/deliveries/${target._id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PICKED_UP' }),
    });
    assert.equal(s2.status, 200);
    assert.equal((await s2.json()).data.status, 'PICKED_UP');

    // PICKED_UP -> IN_TRANSIT
    const s3 = await fetch(`${baseUrl}/deliveries/${target._id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_TRANSIT' }),
    });
    assert.equal(s3.status, 200);
    assert.equal((await s3.json()).data.status, 'IN_TRANSIT');
  });

  it('8. POST /shelters/:id/full marks shelter full and reroutes in-transit delivery', async () => {
    // Find delivery that is IN_TRANSIT
    const delRes = await fetch(`${baseUrl}/deliveries?status=IN_TRANSIT`);
    const inTransit = (await delRes.json()).data;
    assert.ok(inTransit.length > 0);
    const delivery = inTransit[0];

    // Find destination shelter for this delivery
    const demand = delivery.demandId;
    const targetShelterId = demand.shelterId?._id || demand.shelterId;

    const fullRes = await fetch(`${baseUrl}/shelters/${targetShelterId}/full`, {
      method: 'POST',
    });
    assert.equal(fullRes.status, 200);
    const fullBody = await fullRes.json();
    assert.equal(fullBody.data.shelter.status, 'FULL');
    assert.ok(fullBody.data.reroutedDeliveries.length > 0, 'Must have rerouted affected delivery');
  });

  it('9. POST /demo/simulate-afk revokes assignment from unresponsive rider', async () => {
    // Claim another offered delivery
    const offRes = await fetch(`${baseUrl}/deliveries?status=OFFERED`);
    const offered = (await offRes.json()).data;
    if (offedDelivery(offered)) {
      const del = offered[0];
      const riderId = del.riderId._id || del.riderId;
      await fetch(`${baseUrl}/deliveries/${del._id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      });

      const afkRes = await fetch(`${baseUrl}/demo/simulate-afk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      });
      assert.equal(afkRes.status, 200);
      const afkBody = await afkRes.json();
      assert.equal(afkBody.data.success, true);
      assert.ok(afkBody.data.watchdogResult.afkRiders > 0);
    }
  });

  it('10. GET /operations/summary and /operations/events return operational metrics', async () => {
    const [sumRes, evRes] = await Promise.all([
      fetch(`${baseUrl}/operations/summary`),
      fetch(`${baseUrl}/operations/events`),
    ]);

    assert.equal(sumRes.status, 200);
    assert.equal(evRes.status, 200);

    const summary = (await sumRes.json()).data;
    const events = (await evRes.json()).data;

    assert.ok('totalActiveBatches' in summary);
    assert.ok('activeDeliveries' in summary);
    assert.ok('openShelters' in summary);
    assert.ok('availableRiders' in summary);
    assert.ok(events.length > 0, 'Audit event log must contain operation events');
  });
});

function offedDelivery(arr: any[]): boolean {
  return Array.isArray(arr) && arr.length > 0;
}
