import api from './client';

/*
 * Provider portal (/api/provider/**, ROLE_PROVIDER), availability (/api/availability/**, PROVIDER or
 * STAFF), staff portal (/api/staff-portal/**, ROLE_STAFF) and the appointment actions both use.
 * Every function resolves to the response body, except the file downloads which resolve to the
 * whole axios response (blob + headers).
 */

const body = (request) => request.then((r) => r.data);

/** PageResponse -> always { content: [], page, size, totalElements, totalPages }. */
export function asPage(data) {
  const content = Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : [];
  return {
    content,
    page: Number(data?.page) || 0,
    size: Number(data?.size) || content.length,
    totalElements: Number(data?.totalElements ?? content.length) || 0,
    totalPages: Number(data?.totalPages) || (content.length ? 1 : 0)
  };
}

const asList = (data) => (Array.isArray(data) ? data : []);

/** Drops empty filter values so they are not sent as `status=` etc. */
export function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

export const providerApi = {
  me: () => body(api.get('/provider/me')),
  updateMe: (payload) => body(api.put('/provider/me', payload)),
  stats: () => body(api.get('/provider/stats')),

  appointments: (params) => body(api.get('/provider/appointments', { params: cleanParams(params) })).then(asPage),
  day: (date) => body(api.get('/provider/appointments/day', { params: { date } })).then(asList),
  exportAppointments: (params) => api.get('/provider/appointments/export', { params: cleanParams(params), responseType: 'blob' }),
  collect: (appointmentId) => body(api.post(`/provider/appointments/${appointmentId}/collect`)),

  services: () => body(api.get('/provider/services')).then(asList),
  createService: (payload) => body(api.post('/provider/services', payload)),
  updateService: (id, payload) => body(api.put(`/provider/services/${id}`, payload)),
  setServiceActive: (id, active) => body(api.patch(`/provider/services/${id}/active`, { active })),

  staff: () => body(api.get('/provider/staff')).then(asList),
  createStaff: (payload) => body(api.post('/provider/staff', payload)),
  updateStaff: (id, payload) => body(api.put(`/provider/staff/${id}`, payload)),
  deactivateStaff: (id) => api.delete(`/provider/staff/${id}`),

  reviews: () => body(api.get('/provider/reviews')).then(asList),
  reply: (id, reply) => body(api.put(`/provider/reviews/${id}/reply`, { reply })),

  earnings: () => body(api.get('/provider/earnings')),
  reports: (params) => body(api.get('/provider/reports', { params: cleanParams(params) })),

  branches: () => body(api.get('/provider/branches')).then(asList),
  addBranch: (payload) => body(api.post('/provider/branches', payload)),
  deleteBranch: (id) => api.delete(`/provider/branches/${id}`)
};

export const availabilityApi = {
  mine: () => body(api.get('/availability/me')),
  /** Replaces the weekly windows of the business (staffId null) or of one staff member. */
  saveWeek: (staffId, windows) => body(api.put('/availability/week', { staffId: staffId ?? null, windows })),
  block: (payload) => body(api.post('/availability/blocked', payload)),
  unblock: (id) => api.delete(`/availability/blocked/${id}`)
};

export const staffPortalApi = {
  me: () => body(api.get('/staff-portal/me')),
  appointments: (scope = 'upcoming') => body(api.get('/staff-portal/appointments', { params: { scope } })).then(asList)
};

export const appointmentApi = {
  /** Provider / staff status change: CONFIRMED, CANCELLED (with reason), COMPLETED, NO_SHOW. */
  setStatus: (id, status, reason) => body(api.put(`/appointments/${id}/status`, reason ? { status, reason } : { status })),
  invoice: (id) => api.get(`/appointments/${id}/invoice`, { responseType: 'blob' })
};

export const catalogApi = {
  categories: () => body(api.get('/categories')).then(asList),
  /** Multipart image upload -> { url, filename, size, contentType }. */
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    // An explicit multipart type stops axios from JSON-encoding the FormData (the instance
    // default is application/json); the browser then adds the boundary itself.
    return body(api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  }
};
