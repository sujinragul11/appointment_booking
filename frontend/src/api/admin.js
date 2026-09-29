import api from './client';

/* Admin panel API (all routes under /api/admin require ROLE_ADMIN) plus the helpers the
 * admin pages share: filter -> query params, and file downloads (CSV / PDF exports). */

/**
 * Turns a filter object into axios `params`: strings are trimmed and empty values
 * ('' / null / undefined / NaN) are dropped, so the backend never sees `?q=&role=`.
 */
export function toQueryParams(filters = {}) {
  const params = {};
  Object.entries(filters || {}).forEach(([key, raw]) => {
    if (raw === undefined || raw === null) return;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === '' || (typeof value === 'number' && Number.isNaN(value))) return;
    params[key] = value;
  });
  return params;
}

/**
 * File name from a Content-Disposition header. Understands RFC 5987 `filename*=UTF-8''...`,
 * quoted and bare `filename=`; path separators are stripped. Falls back to `fallback`.
 */
export function filenameFromDisposition(header, fallback = 'download') {
  const value = String(header || '');
  let name = null;
  const extended = /filename\*\s*=\s*([^;]+)/i.exec(value);
  if (extended) {
    const raw = extended[1].trim().replace(/^"(.*)"$/, '$1');
    const encoded = raw.includes("''") ? raw.slice(raw.indexOf("''") + 2) : raw;
    try {
      name = decodeURIComponent(encoded);
    } catch {
      name = encoded;
    }
  }
  if (!name) {
    const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(value);
    const bare = /filename\s*=\s*([^;]+)/i.exec(value);
    if (quoted) name = quoted[1].replace(/\\(.)/g, '$1');
    else if (bare) name = bare[1].trim();
  }
  const safe = name ? name.split(/[\\/]/).pop().trim() : '';
  return safe || fallback;
}

/** Hands a Blob to the browser as a download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readBlobText(blob) {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * With responseType 'blob' an error body arrives as a Blob too; parse it back into JSON so
 * getErrorMessage() can show the backend `message`.
 */
export async function withJsonErrorBody(error) {
  const data = error?.response?.data;
  if (data && typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await readBlobText(data));
    } catch {
      error.response.data = {};
    }
  }
  return error;
}

/**
 * GETs a file (responseType 'blob') and triggers a download named after the
 * Content-Disposition header. Resolves to the file name.
 */
export async function downloadFile(url, params, fallbackName) {
  let response;
  try {
    response = await api.get(url, { params: toQueryParams(params), responseType: 'blob' });
  } catch (error) {
    throw await withJsonErrorBody(error);
  }
  const headers = response.headers || {};
  const disposition = typeof headers.get === 'function'
    ? headers.get('content-disposition')
    : headers['content-disposition'];
  const filename = filenameFromDisposition(disposition, fallbackName);
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
  saveBlob(blob, filename);
  return filename;
}

const data = (promise) => promise.then((r) => r.data);
const get = (url, params) => data(api.get(url, { params: toQueryParams(params) }));

/* ---------- stats (FR-44..48) ---------- */
export const fetchStats = () => get('/admin/stats');

/* ---------- users (FR-44) ---------- */
export const fetchUsers = (params) => get('/admin/users', params);
export const setUserActive = (id, active) => data(api.patch(`/admin/users/${id}/active`, { active }));
export const deleteUser = (id) => api.delete(`/admin/users/${id}`);
export const exportUsers = (format) => downloadFile('/admin/users/export', { format }, `users.${format}`);

/* ---------- providers ---------- */
export const fetchProviders = (params) => get('/admin/providers', params);
export const decideProvider = (id, status, note) =>
  data(api.put(`/admin/providers/${id}/decision`, { status, note: note && note.trim() ? note.trim() : null }));

/* ---------- services (FR-9..11) ---------- */
export const fetchServices = (params) => get('/admin/services', params);
export const createService = (payload) => data(api.post('/admin/services', payload));
export const updateService = (id, payload) => data(api.put(`/admin/services/${id}`, payload));
export const setServiceActive = (id, active) => data(api.patch(`/admin/services/${id}/active`, { active }));
export const assignService = (id, providerId) => data(api.post(`/admin/services/${id}/assign`, { providerId }));
export const deleteService = (id) => api.delete(`/admin/services/${id}`);

/** POST /uploads (multipart `file`) -> { url, filename, size, contentType } */
export function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  // An explicit multipart type stops axios from JSON-encoding the FormData (the instance
  // default is application/json); the browser then adds the boundary itself.
  return data(api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
}

/* ---------- categories (FR-12) ---------- */
export const fetchCategories = () => get('/categories');
export const createCategory = (payload) => data(api.post('/admin/categories', payload));
export const updateCategory = (id, payload) => data(api.put(`/admin/categories/${id}`, payload));
export const deleteCategory = (id) => api.delete(`/admin/categories/${id}`);

/* ---------- appointments (FR-45, FR-47) ---------- */
export const fetchAppointments = (params) => get('/admin/appointments', params);
export const exportAppointments = (format, filters) =>
  downloadFile('/admin/appointments/export', { ...filters, format }, `appointments.${format}`);

/* ---------- reports (FR-46, FR-47) ---------- */
export const fetchReport = (params) => get('/admin/reports/bookings', params);
export const exportReport = (format, params) =>
  downloadFile('/admin/reports/bookings/export', { ...params, format }, `booking-report.${format}`);

/* ---------- reviews (FR-42) ---------- */
export const fetchReviews = (params) => get('/admin/reviews', params);
export const moderateReview = (id, status, note) =>
  data(api.put(`/admin/reviews/${id}/moderate`, { status, note: note && note.trim() ? note.trim() : null }));

/* ---------- coupons ---------- */
export const fetchCoupons = () => get('/admin/coupons');
export const createCoupon = (payload) => data(api.post('/admin/coupons', payload));
export const updateCoupon = (id, payload) => data(api.put(`/admin/coupons/${id}`, payload));
export const deleteCoupon = (id) => api.delete(`/admin/coupons/${id}`);

/* ---------- audit log (FR-48) ---------- */
export const fetchAuditLogs = (params) => get('/admin/audit-logs', params);
