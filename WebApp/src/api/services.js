import { api } from './client';

export const authApi = {
  login:          (phone_number, password) => api.post('/auth/login', { phone_number, password }),
  register:       (data)                   => api.post('/auth/register', data),
  logout:         ()                       => api.post('/auth/logout'),
  me:             ()                       => api.get('/auth/me'),
  updateProfile:  (data)                   => api.put('/auth/profile', data),
  changePassword: (data)                   => api.put('/auth/change-password', data),
};

export const vehiclesApi = {
  list:   ()         => api.get('/vehicles'),
  add:    (data)     => api.post('/vehicles', data),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  remove: (id)       => api.delete(`/vehicles/${id}`),
  uploadPlateImage: (id, imageData) => api.post(`/vehicles/${id}/plate-image`, { image_data: imageData }),
  removePlateImage: (id)            => api.delete(`/vehicles/${id}/plate-image`),
};

export const walletApi = {
  info:         ()     => api.get('/wallet'),
  transactions: (page, limit) => api.get(`/wallet/transactions?page=${page}&limit=${limit}`),
  topup:        (data) => api.post('/wallet/topup', data),
};

export const sessionsApi = {
  list:   (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/sessions?${q}`);
  },
  active: ()   => api.get('/sessions/active'),
  detail: (id) => api.get(`/sessions/${id}`),
};

export const authorizationsApi = {
  list:   ()   => api.get('/authorizations'),
  detail: (id) => api.get(`/authorizations/${id}`),
  revoke: (id) => api.delete(`/authorizations/${id}`),
};

export const notificationsApi = {
  list:    (page, limit) => api.get(`/notifications?page=${page}&limit=${limit}`),
  markRead:(id)          => api.patch(`/notifications/${id}/read`),
  readAll: ()            => api.patch('/notifications/read-all'),
};

export const faceImagesApi = {
  list:   ()          => api.get('/face-images'),
  upload: (imageData) => api.post('/face-images', { image_data: imageData }),
  remove: (id)        => api.delete(`/face-images/${id}`),
};

export const monthlyPassesApi = {
  list:    ()          => api.get('/monthly-passes'),
  price:   ()          => api.get('/monthly-passes/price'),
  buy:     (data)      => api.post('/monthly-passes', data),
  cancel:  (id)        => api.delete(`/monthly-passes/${id}`),
};

export const withdrawApi = {
  history: ()     => api.get('/wallet/withdrawals'),
  request: (data) => api.post('/wallet/withdraw', data),
};
