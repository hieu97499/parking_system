import { api } from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
  hourlyTraffic: (date) => api.get(`/dashboard/hourly-traffic${date ? `?date=${date}` : ''}`),
  activeSessions: () => api.get('/dashboard/active-sessions'),
};

export const sessionsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/sessions${q ? '?' + q : ''}`);
  },
  get: (id) => api.get(`/sessions/${id}`),
  forceEnd: (id, reason) => api.patch(`/sessions/${id}/force-end`, { reason }),
};

export const usersApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/users${q ? '?' + q : ''}`);
  },
  get: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleActive: (id) => api.patch(`/users/${id}/toggle-active`),
  remove: (id) => api.delete(`/users/${id}`),
  faceImages: (id) => api.get(`/users/${id}/face-images`),
  updateVehicle: (userId, vehicleId, data) => api.put(`/users/${userId}/vehicles/${vehicleId}`, data),
  adjustWallet: (userId, amount, description) => api.post(`/users/${userId}/wallet/adjust`, { amount, description }),
  deleteFaceImage: (userId, imageId) => api.delete(`/users/${userId}/face-images/${imageId}`),
  pendingTopups: () => api.get('/users/topups/pending'),
};

export const devicesApi = {
  list: () => api.get('/devices'),
  get: (id) => api.get(`/devices/${id}`),
  setStatus: (id, status, note) => api.patch(`/devices/${id}/status`, { status, note }),
};

export const eventLogsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/event-logs${q ? '?' + q : ''}`);
  },
};

export const reportsApi = {
  daily: (from, to) => api.get(`/reports/daily?from=${from}&to=${to}`),
  summary: (from, to) => api.get(`/reports/summary?from=${from}&to=${to}`),
};

export const alertsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/alerts${q ? '?' + q : ''}`);
  },
  resolve: (id, note) => api.patch(`/alerts/${id}/resolve`, { note }),
};

export const configApi = {
  getPricing: () => api.get('/config/pricing'),
  updatePricing: (id, data) => api.put(`/config/pricing/${id}`, data),
  getSystem: () => api.get('/config/system'),
  updateSystem: (data) => api.put('/config/system', data),
  getLot: () => api.get('/config/lot'),
  updateLot: (data) => api.put('/config/lot', data),
};

export const barriersApi = {
  open: (deviceId, reason) => api.post(`/barriers/${deviceId}/open`, { reason }),
  logs: (deviceId) => api.get(`/barriers/logs${deviceId ? `?deviceId=${deviceId}` : ''}`),
};

export const adminsApi = {
  getAll: () => api.get('/admins'),
  create: (data) => api.post('/admins', data),
  update: (id, data) => api.patch(`/admins/${id}`, data),
  changePassword: (id, data) => api.post(`/admins/${id}/change-password`, data),
  remove: (id) => api.delete(`/admins/${id}`),
};
