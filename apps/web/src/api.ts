const API_BASE = '/api/v1';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `HTTP error ${res.status}`);
  }
  return json.data !== undefined ? json.data : json;
}

export const api = {
  // Health
  getHealth: () => request<any>('/health'),

  // Operations
  getSummary: () =>
    request<{
      totalActiveBatches: number;
      activeDeliveries: number;
      openShelters: number;
      availableRiders: number;
      atRiskDeliveries: number;
      criticalEventsCount: number;
    }>('/operations/summary'),

  getEvents: (limit: number = 30) => request<any[]>(`/operations/events?limit=${limit}`),

  // Batches
  getBatches: () => request<any[]>('/batches'),
  createBatch: (data: any) =>
    request<any>('/batches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  matchBatch: (id: string) =>
    request<{ plan: any; deliveries: any[] }>(`/batches/${id}/match`, {
      method: 'POST',
    }),

  // Shelters
  getShelters: () => request<any[]>('/shelters'),
  createDemand: (shelterId: string, data: any) =>
    request<any>(`/shelters/${shelterId}/demands`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateShelter: (shelterId: string, data: any) =>
    request<any>(`/shelters/${shelterId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  markShelterFull: (id: string) =>
    request<any>(`/shelters/${id}/full`, { method: 'POST' }),
  closeShelter: (id: string) =>
    request<any>(`/shelters/${id}/close`, { method: 'POST' }),

  // Riders
  getRiders: () => request<any[]>('/riders'),
  updateRiderLocation: (id: string, location: any) =>
    request<any>(`/riders/${id}/location`, {
      method: 'PATCH',
      body: JSON.stringify({ location }),
    }),

  // Deliveries
  getDeliveries: (status?: string) =>
    request<any[]>(status ? `/deliveries?status=${status}` : '/deliveries'),
  claimDelivery: (id: string, riderId?: string) =>
    request<any>(`/deliveries/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ riderId }),
    }),
  recordHeartbeat: (id: string, location?: any) =>
    request<any>(`/deliveries/${id}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ location }),
    }),
  updateDeliveryStatus: (id: string, status: string, note?: string) =>
    request<any>(`/deliveries/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),

  // Demo & Simulation
  seedDemo: () => request<any>('/demo/seed', { method: 'POST' }),
  resetDemo: () => request<any>('/demo/reset', { method: 'POST' }),
  advanceTime: (minutes: number) =>
    request<any>('/demo/advance-time', {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    }),
  simulateAfk: (riderId: string) =>
    request<any>('/demo/simulate-afk', {
      method: 'POST',
      body: JSON.stringify({ riderId }),
    }),
};
