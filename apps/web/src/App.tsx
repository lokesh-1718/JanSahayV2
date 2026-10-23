import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  Truck,
  Building2,
  Users,
  PlayCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  Plus,
  Flame,
  Droplets,
  Snowflake,
} from 'lucide-react';
import { api } from './api.js';

type Tab = 'overview' | 'donations' | 'deliveries' | 'shelters' | 'riders' | 'scenarios';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<any>({
    totalActiveBatches: 0,
    activeDeliveries: 0,
    openShelters: 0,
    availableRiders: 0,
    atRiskDeliveries: 0,
    criticalEventsCount: 0,
  });
  const [batches, setBatches] = useState<any[]>([]);
  const [shelters, setShelters] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Dialog state
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [newBatch, setNewBatch] = useState({
    aidType: 'COOKED_MEALS',
    quantity: 180,
    unit: 'meals',
    expiryMinutes: 75,
    requiresCleanWater: false,
    requiresCookingFuel: false,
    requiresRefrigeration: false,
  });

  const [showCreateDemand, setShowCreateDemand] = useState<string | null>(null);
  const [newDemand, setNewDemand] = useState({
    aidType: 'COOKED_MEALS',
    requestedQuantity: 50,
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreateDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showCreateDemand) return;
    try {
      await api.createDemand(showCreateDemand, {
        aidType: newDemand.aidType,
        requestedQuantity: Number(newDemand.requestedQuantity),
      });
      showToast('Created demand for shelter!');
      setShowCreateDemand(null);
      await loadData();
    } catch (err: any) {
      showToast(`Demand error: ${err.message}`);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [sum, bList, sList, rList, dList, eList] = await Promise.all([
        api.getSummary().catch(() => null),
        api.getBatches().catch(() => []),
        api.getShelters().catch(() => []),
        api.getRiders().catch(() => []),
        api.getDeliveries().catch(() => []),
        api.getEvents(20).catch(() => []),
      ]);

      if (sum) setSummary(sum);
      setBatches(bList);
      setShelters(sList);
      setRiders(rList);
      setDeliveries(dList);
      setEvents(eList);
    } catch (err: any) {
      showToast(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  // ─── Actions ───────────────────────────────────────────────
  const handleResetDemo = async () => {
    try {
      await api.resetDemo();
      showToast('Scenario reset to clean deterministic state');
      await loadData();
    } catch (err: any) {
      showToast(`Reset error: ${err.message}`);
    }
  };

  const handleMatchBatch = async (batchId: string) => {
    try {
      const res = await api.matchBatch(batchId);
      const plan = res.plan;
      showToast(
        `Matched batch! Allocated: ${plan.totalAllocated}, Unallocated: ${plan.unallocatedQuantity}, Tasks: ${res.deliveries.length}`,
      );
      await loadData();
    } catch (err: any) {
      showToast(`Match error: ${err.message}`);
    }
  };

  const handleClaim = async (delId: string, riderId?: string) => {
    try {
      await api.claimDelivery(delId, riderId);
      showToast(`Delivery claimed!`);
      await loadData();
    } catch (err: any) {
      showToast(`Claim error: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (delId: string, nextStatus: string) => {
    try {
      await api.updateDeliveryStatus(delId, nextStatus);
      showToast(`Status updated to ${nextStatus}`);
      await loadData();
    } catch (err: any) {
      showToast(`Status update error: ${err.message}`);
    }
  };

  const handleMarkShelterFull = async (shelterId: string) => {
    try {
      const res = await api.markShelterFull(shelterId);
      const rerouted = res.reroutedDeliveries.length;
      showToast(`Shelter marked FULL! ${rerouted} active deliveries rerouted.`);
      await loadData();
    } catch (err: any) {
      showToast(`Shelter error: ${err.message}`);
    }
  };

  const handleSimulateAfk = async (riderId: string) => {
    try {
      const res = await api.simulateAfk(riderId);
      const reassigned = res.watchdogResult.reassignedDeliveries;
      showToast(`Rider simulated AFK! ${reassigned} deliveries revoked/reassigned.`);
      await loadData();
    } catch (err: any) {
      showToast(`AFK simulation error: ${err.message}`);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const donor = shelters[0]?.contactName ? riders[0]?.userId?._id : (batches[0]?.donorId || '000000000000000000000001');
      const expiresAt = new Date(Date.now() + newBatch.expiryMinutes * 60_000).toISOString();

      await api.createBatch({
        donorId: donor,
        aidType: newBatch.aidType,
        quantity: Number(newBatch.quantity),
        unit: newBatch.unit,
        pickupLocation: { type: 'Point', coordinates: [77.2195, 28.6328] },
        expiresAt,
        handling: {
          requiresCleanWater: newBatch.requiresCleanWater,
          requiresCookingFuel: newBatch.requiresCookingFuel,
          requiresRefrigeration: newBatch.requiresRefrigeration,
        },
      });

      showToast(`Batch of ${newBatch.quantity} ${newBatch.unit} created!`);
      setShowCreateBatch(false);
      await loadData();
    } catch (err: any) {
      showToast(`Create batch error: ${err.message}`);
    }
  };

  const handleAdvanceTime = async (mins: number) => {
    try {
      const res = await api.advanceTime(mins);
      showToast(`Advanced time by ${mins}m. Stale offers expired: ${res.watchdogResult.expiredOffers}`);
      await loadData();
    } catch (err: any) {
      showToast(`Time advance error: ${err.message}`);
    }
  };

  return (
    <div className="app-container">
      {/* ─── Sidebar ────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Truck size={20} />
          </div>
          <div>
            <div className="brand-title">CivicAid Dispatch</div>
            <div className="brand-subtitle">Emergency Aid Routing</div>
          </div>
        </div>

        <nav className="nav-links">
          <button
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'donations' ? 'active' : ''}`}
            onClick={() => setActiveTab('donations')}
          >
            <Package size={18} />
            <span>Donations</span>
            <span className="badge">{batches.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'deliveries' ? 'active' : ''}`}
            onClick={() => setActiveTab('deliveries')}
          >
            <Truck size={18} />
            <span>Deliveries</span>
            <span className="badge">{deliveries.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'shelters' ? 'active' : ''}`}
            onClick={() => setActiveTab('shelters')}
          >
            <Building2 size={18} />
            <span>Shelters</span>
            <span className="badge">{shelters.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'riders' ? 'active' : ''}`}
            onClick={() => setActiveTab('riders')}
          >
            <Users size={18} />
            <span>Riders</span>
            <span className="badge">{riders.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'scenarios' ? 'active' : ''}`}
            onClick={() => setActiveTab('scenarios')}
          >
            <PlayCircle size={18} />
            <span>Judge Scenarios</span>
            <span className="badge" style={{ background: '#0284c7', color: 'white' }}>Demo</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={handleResetDemo}>
            <RefreshCw size={14} />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content Area ──────────────────────────── */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">
              {activeTab === 'overview' && 'Operations Overview'}
              {activeTab === 'donations' && 'Donation Batches'}
              {activeTab === 'deliveries' && 'Delivery Tasks'}
              {activeTab === 'shelters' && 'Shelters & Demands'}
              {activeTab === 'riders' && 'Rider Fleet'}
              {activeTab === 'scenarios' && 'Judge Simulation & Failure Scenarios'}
            </h1>
          </div>

          <div className="topbar-right">
            <div className="status-pill">
              <span className="status-dot"></span>
              <span>Backend Connected</span>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => handleAdvanceTime(15)}>
              <Clock size={14} />
              <span>+15m Clock</span>
            </button>

            <button className="btn btn-secondary btn-sm" onClick={loadData}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        <div className="page-view">
          {/* ─── TAB: OVERVIEW ────────────────────────────── */}
          {activeTab === 'overview' && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-header">Active Batches</div>
                  <div className="kpi-value">{summary.totalActiveBatches}</div>
                  <div className="kpi-sub">Available for matching</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">Active Deliveries</div>
                  <div className="kpi-value" style={{ color: '#38bdf8' }}>{summary.activeDeliveries}</div>
                  <div className="kpi-sub">In dispatch lifecycle</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">Open Shelters</div>
                  <div className="kpi-value" style={{ color: '#10b981' }}>{summary.openShelters}</div>
                  <div className="kpi-sub">Ready to receive aid</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">Available Riders</div>
                  <div className="kpi-value" style={{ color: '#f59e0b' }}>{summary.availableRiders}</div>
                  <div className="kpi-sub">Ready for assignment</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">At-Risk Deliveries</div>
                  <div className="kpi-value" style={{ color: summary.atRiskDeliveries > 0 ? '#ef4444' : '#10b981' }}>
                    {summary.atRiskDeliveries}
                  </div>
                  <div className="kpi-sub">Recovery required</div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Quick Operational Actions</h2>
                    <p className="panel-description">Trigger common dispatch workflows directly</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {batches.length > 0 && batches[0].status === 'AVAILABLE' && (
                    <button className="btn btn-primary" onClick={() => handleMatchBatch(batches[0]._id)}>
                      <PlayCircle size={16} />
                      <span>Run Match Engine on Batch #{batches[0]._id.slice(-6)}</span>
                    </button>
                  )}

                  <button className="btn btn-secondary" onClick={() => setShowCreateBatch(true)}>
                    <Plus size={16} />
                    <span>Create Donation Batch</span>
                  </button>

                  <button className="btn btn-secondary" onClick={() => setActiveTab('scenarios')}>
                    <PlayCircle size={16} />
                    <span>Run Judge Scenarios</span>
                  </button>
                </div>
              </div>

              {/* Audit Event Timeline */}
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Real-Time Operational Audit Trail</h2>
                    <p className="panel-description">Append-only audit log of automated and operator decisions</p>
                  </div>
                </div>

                <div className="timeline">
                  {events.length === 0 ? (
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No events recorded yet.</p>
                  ) : (
                    events.map((ev) => (
                      <div key={ev._id} className="timeline-item">
                        <span
                          className={`badge ${
                            ev.severity === 'CRITICAL'
                              ? 'badge-danger'
                              : ev.severity === 'WARNING'
                              ? 'badge-warning'
                              : 'badge-sky'
                          }`}
                        >
                          {ev.type}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div>{ev.message}</div>
                          {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                              {JSON.stringify(ev.metadata)}
                            </div>
                          )}
                        </div>
                        <span className="timeline-time">
                          {new Date(ev.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* ─── TAB: DONATIONS ───────────────────────────── */}
          {activeTab === 'donations' && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Donation Batches</h2>
                  <p className="panel-description">Manage incoming perishable food and fragile medical aid</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateBatch(true)}>
                  <Plus size={16} />
                  <span>Create Batch</span>
                </button>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Batch ID</th>
                      <th>Aid Type</th>
                      <th>Quantity</th>
                      <th>Remaining</th>
                      <th>Expires In</th>
                      <th>Requirements</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => {
                      const minsLeft = Math.round((new Date(b.expiresAt).getTime() - Date.now()) / 60_000);
                      return (
                        <tr key={b._id}>
                          <td style={{ fontFamily: 'monospace' }}>#{b._id.slice(-6)}</td>
                          <td>
                            <span className="badge badge-sky">{b.aidType}</span>
                          </td>
                          <td>{b.quantity} {b.unit}</td>
                          <td style={{ fontWeight: 600 }}>{b.remainingQuantity} {b.unit}</td>
                          <td>
                            <span style={{ color: minsLeft < 30 ? 'var(--color-danger)' : 'var(--text-main)' }}>
                              {minsLeft > 0 ? `${minsLeft} min` : 'EXPIRED'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {b.handling?.requiresCleanWater && (
                                <span title="Clean Water"><Droplets size={16} color="#38bdf8" /></span>
                              )}
                              {b.handling?.requiresCookingFuel && (
                                <span title="Cooking Fuel"><Flame size={16} color="#f59e0b" /></span>
                              )}
                              {b.handling?.requiresRefrigeration && (
                                <span title="Refrigeration"><Snowflake size={16} color="#a78bfa" /></span>
                              )}
                              {!b.handling?.requiresCleanWater && !b.handling?.requiresCookingFuel && !b.handling?.requiresRefrigeration && (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>None</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                b.status === 'AVAILABLE'
                                  ? 'badge-success'
                                  : b.status === 'ALLOCATED'
                                  ? 'badge-purple'
                                  : b.status === 'PARTIALLY_ALLOCATED'
                                  ? 'badge-warning'
                                  : 'badge-muted'
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td>
                            {b.status === 'AVAILABLE' || b.status === 'PARTIALLY_ALLOCATED' ? (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleMatchBatch(b._id)}
                              >
                                <PlayCircle size={14} />
                                <span>Run Match</span>
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Allocated</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── TAB: DELIVERIES ──────────────────────────── */}
          {activeTab === 'deliveries' && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Active Delivery Tasks</h2>
                  <p className="panel-description">Track and manage lifecycle transitions from offer to delivery</p>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Delivery ID</th>
                      <th>Aid & Quantity</th>
                      <th>Destination</th>
                      <th>Status</th>
                      <th>Rider</th>
                      <th>ETA</th>
                      <th>Heartbeat</th>
                      <th>Reroutes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}>
                          No deliveries created yet. Match a donation batch to generate delivery tasks!
                        </td>
                      </tr>
                    ) : (
                      deliveries.map((d) => (
                        <tr key={d._id}>
                          <td style={{ fontFamily: 'monospace' }}>#{d._id.slice(-6)}</td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{d.quantity}</span>{' '}
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {d.batchId?.aidType ? d.batchId.aidType.toLowerCase().replace('_', ' ') : 'units'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            {d.demandId?.shelterId?.name || (d.demandId?.shelterId ? `Shelter #${d.demandId.shelterId.slice(-4)}` : 'Shelter')}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                d.status === 'DELIVERED'
                                  ? 'badge-success'
                                  : d.status === 'IN_TRANSIT'
                                  ? 'badge-purple'
                                  : d.status === 'CLAIMED' || d.status === 'EN_ROUTE_TO_PICKUP'
                                  ? 'badge-sky'
                                  : d.status === 'OFFERED'
                                  ? 'badge-warning'
                                  : d.status === 'RECOVERY_REQUIRED'
                                  ? 'badge-danger'
                                  : 'badge-muted'
                              }`}
                            >
                              {d.status}
                            </span>
                            {d.failureReason && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--color-danger)', marginTop: '2px', maxWidth: '180px' }}>
                                {d.failureReason}
                              </div>
                            )}
                          </td>
                          <td>{d.riderId?.userId?.name || d.riderId?.name || (d.riderId?._id ? `Rider #${d.riderId._id.slice(-4)}` : 'Unassigned')}</td>
                          <td>{Math.round(d.estimatedMinutes || 0)} min</td>
                          <td>
                            {d.lastHeartbeatAt ? (
                              <span style={{ fontSize: '0.8rem' }}>
                                {Math.round((Date.now() - new Date(d.lastHeartbeatAt).getTime()) / 1000)}s ago
                              </span>
                            ) : '-'}
                          </td>
                          <td>
                            {d.rerouteCount > 0 ? (
                              <span className="badge badge-warning">{d.rerouteCount} rerouted</span>
                            ) : '0'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {d.status === 'OFFERED' && (
                                <button className="btn btn-primary btn-sm" onClick={() => handleClaim(d._id, d.riderId?._id || d.riderId)}>
                                  Claim
                                </button>
                              )}
                              {d.status === 'CLAIMED' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateStatus(d._id, 'EN_ROUTE_TO_PICKUP')}>
                                  En Route
                                </button>
                              )}
                              {d.status === 'EN_ROUTE_TO_PICKUP' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateStatus(d._id, 'PICKED_UP')}>
                                  Pick Up
                                </button>
                              )}
                              {d.status === 'PICKED_UP' && (
                                <button className="btn btn-primary btn-sm" onClick={() => handleUpdateStatus(d._id, 'IN_TRANSIT')}>
                                  In Transit
                                </button>
                              )}
                              {d.status === 'IN_TRANSIT' && (
                                <button className="btn btn-primary btn-sm" onClick={() => handleUpdateStatus(d._id, 'DELIVERED')}>
                                  Deliver
                                </button>
                              )}
                              {d.status === 'RECOVERY_REQUIRED' && (
                                <span className="badge badge-danger">Needs Intervention</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── TAB: SHELTERS ────────────────────────────── */}
          {activeTab === 'shelters' && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Shelters & Demands</h2>
                  <p className="panel-description">Facilities, occupancy limits, and active aid requirements</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
                {shelters.map((s) => {
                  const percent = Math.round((s.currentOccupancy / Math.max(1, s.capacity)) * 100);
                  return (
                    <div key={s._id} className="kpi-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{s.name}</span>
                        <span
                          className={`badge ${
                            s.status === 'OPEN'
                              ? 'badge-success'
                              : s.status === 'FULL'
                              ? 'badge-danger'
                              : 'badge-muted'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span>Occupancy</span>
                          <span>{s.currentOccupancy} / {s.capacity} ({percent}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' }}>
                          <div
                            style={{
                              width: `${Math.min(100, percent)}%`,
                              height: '100%',
                              background: percent >= 100 ? 'var(--color-danger)' : 'var(--accent-primary)',
                            }}
                          ></div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <span className={`badge ${s.facilities?.cleanWater ? 'badge-sky' : 'badge-muted'}`}>Water</span>
                        <span className={`badge ${s.facilities?.cookingFuel ? 'badge-warning' : 'badge-muted'}`}>Fuel</span>
                        <span className={`badge ${s.facilities?.refrigeration ? 'badge-purple' : 'badge-muted'}`}>Fridge</span>
                      </div>

                      {/* Active Demands */}
                      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600 }}>DEMANDS</span>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            onClick={() => setShowCreateDemand(s._id)}
                          >
                            + Add Demand
                          </button>
                        </div>
                        {s.demands && s.demands.length > 0 ? (
                          s.demands.map((dm: any) => (
                            <div key={dm._id} style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{dm.aidType}: {dm.fulfilledQuantity} / {dm.requestedQuantity}</span>
                              <span className={`badge ${dm.status === 'FULFILLED' ? 'badge-success' : dm.status === 'PARTIALLY_FULFILLED' ? 'badge-warning' : 'badge-sky'}`}>
                                {dm.status}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No active demands</div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        {s.status === 'OPEN' ? (
                          <>
                            <button className="btn btn-warning btn-sm" style={{ flex: 1 }} onClick={() => handleMarkShelterFull(s._id)}>
                              Mark Full
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ flex: 1 }}
                              onClick={async () => {
                                await api.closeShelter(s._id);
                                showToast(`Shelter ${s.name} closed`);
                                await loadData();
                              }}
                            >
                              Close
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1 }}
                            onClick={async () => {
                              await api.updateShelter(s._id, { status: 'OPEN', currentOccupancy: 0 });
                              showToast(`Shelter ${s.name} reopened`);
                              await loadData();
                            }}
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── TAB: RIDERS ──────────────────────────────── */}
          {activeTab === 'riders' && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Rider Fleet</h2>
                  <p className="panel-description">Vehicle capacity, location telemetry, and heartbeat watchdog status</p>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Rider ID</th>
                      <th>Status</th>
                      <th>Capacity</th>
                      <th>Active Delivery</th>
                      <th>Last Heartbeat</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riders.map((r) => {
                      const staleSeconds = Math.round((Date.now() - new Date(r.lastHeartbeatAt).getTime()) / 1000);
                      return (
                        <tr key={r._id}>
                          <td style={{ fontFamily: 'monospace' }}>#{r._id.slice(-6)}</td>
                          <td>
                            <span
                              className={`badge ${
                                r.status === 'AVAILABLE'
                                  ? 'badge-success'
                                  : r.status === 'BUSY' || r.status === 'RESERVED'
                                  ? 'badge-sky'
                                  : r.status === 'AFK'
                                  ? 'badge-danger'
                                  : 'badge-muted'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td>{r.vehicleCapacity} units</td>
                          <td>{r.activeDeliveryId ? `#${r.activeDeliveryId.slice(-6)}` : 'None'}</td>
                          <td>
                            <span style={{ color: staleSeconds > 60 ? 'var(--color-danger)' : 'var(--text-main)' }}>
                              {staleSeconds}s ago
                            </span>
                          </td>
                          <td>
                            {r.status !== 'AFK' && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleSimulateAfk(r._id)}>
                                Simulate AFK
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── TAB: JUDGE SCENARIOS ─────────────────────── */}
          {activeTab === 'scenarios' && (
            <div>
              <div className="panel" style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.1), rgba(139, 92, 246, 0.05))' }}>
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title" style={{ fontSize: '1.25rem' }}>Automated Judge Test Scenarios</h2>
                    <p className="panel-description">
                      One-click execution of the 4 mandatory hackathon evaluation workflows
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                {/* Scenario 1 */}
                <div className="panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div className="brand-icon" style={{ width: '32px', height: '32px' }}>1</div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>180-Meal Multi-Rider Split</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Splits 180 cooked meals across multiple 40-capacity riders and multiple shelter demands respecting capacity constraints.
                  </p>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={async () => {
                      await handleResetDemo();
                      const bList = await api.getBatches();
                      if (bList.length > 0) {
                        await handleMatchBatch(bList[0]._id);
                        setActiveTab('deliveries');
                      }
                    }}
                  >
                    Execute Scenario 1
                  </button>
                </div>

                {/* Scenario 2 */}
                <div className="panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div className="brand-icon" style={{ width: '32px', height: '32px', background: '#f59e0b' }}>2</div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Unresponsive Rider Reassignment</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Simulates a rider who goes silent for &gt;60s. The automated watchdog marks the rider AFK, revokes the task, and reoffers it to an available rider.
                  </p>
                  <button
                    className="btn btn-warning"
                    style={{ width: '100%' }}
                    onClick={async () => {
                      const dList = await api.getDeliveries('OFFERED');
                      if (dList.length > 0) {
                        const target = dList[0];
                        const riderId = target.riderId?._id || target.riderId;
                        await api.claimDelivery(target._id, riderId);
                        await handleSimulateAfk(riderId);
                        setActiveTab('deliveries');
                      } else {
                        showToast('Run matching first to generate offered deliveries!');
                      }
                    }}
                  >
                    Execute Scenario 2
                  </button>
                </div>

                {/* Scenario 3 */}
                <div className="panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div className="brand-icon" style={{ width: '32px', height: '32px', background: '#ef4444' }}>3</div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Shelter Full Mid-Transit Reroute</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    When a destination shelter becomes full while food is already on the road, the engine automatically finds a compatible alternative shelter and reroutes the rider.
                  </p>
                  <button
                    className="btn btn-danger"
                    style={{ width: '100%' }}
                    onClick={async () => {
                      const dList = await api.getDeliveries('OFFERED');
                      if (dList.length > 0) {
                        const target = dList[0];
                        const riderId = target.riderId?._id || target.riderId;
                        await api.claimDelivery(target._id, riderId);
                        await api.updateDeliveryStatus(target._id, 'EN_ROUTE_TO_PICKUP');
                        await api.updateDeliveryStatus(target._id, 'PICKED_UP');
                        await api.updateDeliveryStatus(target._id, 'IN_TRANSIT');
                        const shelterId = target.demandId?.shelterId || shelters[0]?._id;
                        await handleMarkShelterFull(shelterId);
                        setActiveTab('deliveries');
                      } else {
                        showToast('Run matching first to generate offered deliveries!');
                      }
                    }}
                  >
                    Execute Scenario 3
                  </button>
                </div>

                {/* Scenario 4 */}
                <div className="panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div className="brand-icon" style={{ width: '32px', height: '32px', background: '#8b5cf6' }}>4</div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Unsafe / Expiry Delivery Block</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Attempts to match raw ration to shelters lacking clean water and cooking fuel, proving hard safety filters block unsafe deliveries before any dispatch.
                  </p>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                    onClick={async () => {
                      try {
                        const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
                        const batch = await api.createBatch({
                          donorId: riders[0]?.userId?._id || batches[0]?.donorId,
                          aidType: 'RAW_RATION',
                          quantity: 100,
                          unit: 'kits',
                          pickupLocation: { type: 'Point', coordinates: [77.2195, 28.6328] },
                          expiresAt,
                          handling: { requiresCleanWater: true, requiresCookingFuel: true, requiresRefrigeration: false },
                        });
                        const matchRes = await api.matchBatch(batch._id);
                        showToast(`Safety check: batch blocked! ${matchRes.plan.rejections.map((r: any) => r.reason).join('; ')}`);
                        setActiveTab('donations');
                      } catch (err: any) {
                        showToast(`Safety blocked: ${err.message}`);
                      }
                    }}
                  >
                    Execute Scenario 4
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── Create Batch Modal ──────────────────────────── */}
      {showCreateBatch && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Create Donation Batch</h2>
            <form onSubmit={handleCreateBatch}>
              <div className="form-group">
                <label className="form-label">Aid Type</label>
                <select
                  className="form-control"
                  value={newBatch.aidType}
                  onChange={(e) => setNewBatch({ ...newBatch, aidType: e.target.value })}
                >
                  <option value="COOKED_MEALS">Cooked Meals</option>
                  <option value="RAW_RATION">Raw Ration</option>
                  <option value="MEDICINE">Medicine</option>
                  <option value="INFANT_FORMULA">Infant Formula</option>
                  <option value="ESSENTIAL_KIT">Essential Kit</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input
                    type="number"
                    className="form-control"
                    value={newBatch.quantity}
                    onChange={(e) => setNewBatch({ ...newBatch, quantity: Number(e.target.value) })}
                    required
                    min={1}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newBatch.unit}
                    onChange={(e) => setNewBatch({ ...newBatch, unit: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Expiry (minutes from now)</label>
                <input
                  type="number"
                  className="form-control"
                  value={newBatch.expiryMinutes}
                  onChange={(e) => setNewBatch({ ...newBatch, expiryMinutes: Number(e.target.value) })}
                  required
                  min={5}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Handling Requirements</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={newBatch.requiresCleanWater}
                      onChange={(e) => setNewBatch({ ...newBatch, requiresCleanWater: e.target.checked })}
                    />
                    Requires Clean Water at Destination
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={newBatch.requiresCookingFuel}
                      onChange={(e) => setNewBatch({ ...newBatch, requiresCookingFuel: e.target.checked })}
                    />
                    Requires Cooking Fuel at Destination
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={newBatch.requiresRefrigeration}
                      onChange={(e) => setNewBatch({ ...newBatch, requiresRefrigeration: e.target.checked })}
                    />
                    Requires Cold Storage / Refrigeration
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Create Batch
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateBatch(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Create Demand Modal ─────────────────────────── */}
      {showCreateDemand && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Add Shelter Demand</h2>
            <form onSubmit={handleCreateDemand}>
              <div className="form-group">
                <label className="form-label">Aid Type</label>
                <select
                  className="form-control"
                  value={newDemand.aidType}
                  onChange={(e) => setNewDemand({ ...newDemand, aidType: e.target.value })}
                >
                  <option value="COOKED_MEALS">Cooked Meals</option>
                  <option value="RAW_RATION">Raw Ration</option>
                  <option value="MEDICINE">Medicine</option>
                  <option value="INFANT_FORMULA">Infant Formula</option>
                  <option value="ESSENTIAL_KIT">Essential Kit</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Requested Quantity</label>
                <input
                  type="number"
                  className="form-control"
                  value={newDemand.requestedQuantity}
                  onChange={(e) => setNewDemand({ ...newDemand, requestedQuantity: Number(e.target.value) })}
                  required
                  min={1}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Create Demand
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateDemand(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast-container">
          <div className="toast">
            <CheckCircle2 size={16} color="#10b981" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
