import api from './client';

/* API helpers for the public site, authentication and the customer area. */

export const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
export const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';

const DEFAULT_CONFIG = {
  appName: 'Sloto', googleClientId: '', onlinePayments: true, paymentsDemoMode: false, razorpayKeyId: '', currency: 'INR'
};

let configPromise = null;

/** GET /config once per page load (feature flags, public keys). Never rejects. */
export function getConfig() {
  if (!configPromise) {
    configPromise = api.get('/config', { skipAuth: true })
      .then((r) => ({ ...DEFAULT_CONFIG, ...(r.data && typeof r.data === 'object' ? r.data : {}) }))
      .catch(() => {
        configPromise = null; // try again next time
        return { ...DEFAULT_CONFIG };
      });
  }
  return configPromise;
}

/** Tests only: forget the cached configuration. */
export function resetConfigCache() {
  configPromise = null;
}

const scripts = new Map();

/** Loads an external script once; resolves when it has loaded. */
export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        el.remove();
        reject(new Error(`Could not load ${src}`));
      };
      document.head.appendChild(el);
    }));
  }
  return scripts.get(src);
}

/** Filename from a Content-Disposition header ("attachment; filename=invoice-BK1.pdf"). */
export function filenameFromDisposition(header, fallback) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(String(header || ''));
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return match[1].trim();
  }
}

/** Downloads an authenticated file (invoice PDF, .ics) through the API client and saves it. */
export async function downloadFile(url, fallbackName) {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
  const name = filenameFromDisposition(res.headers?.['content-disposition'], fallbackName);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return name;
}

export const downloadInvoice = (appointmentId, bookingRef) =>
  downloadFile(`/appointments/${appointmentId}/invoice`, `invoice-${bookingRef || appointmentId}.pdf`);

export const downloadIcs = (appointmentId, bookingRef) =>
  downloadFile(`/appointments/${appointmentId}/ics`, `appointment-${bookingRef || appointmentId}.ics`);

/* ---------- Checkout ---------- */

/** POST /slots/hold -> { holdToken, date, startTime, endTime, staffId, expiresAt } (+ the response Date header). */
export async function holdSlot(payload) {
  const res = await api.post('/slots/hold', payload);
  return { ...res.data, serverDate: res.headers?.date };
}

/** Best effort: a hold also expires by itself after 10 minutes. */
export function releaseHold(token) {
  if (!token) return Promise.resolve();
  return api.delete(`/slots/hold/${encodeURIComponent(token)}`).catch(() => {});
}

/** CreateOrderResponse (+ the response Date header, for the countdown). */
export const createPaymentOrder = (appointmentId) =>
  api.post('/payments/create-order', null, { params: { appointmentId } })
    .then((r) => ({ ...r.data, serverDate: r.headers?.date }));

export const completeDemoPayment = (appointmentId) =>
  api.post('/payments/demo/complete', null, { params: { appointmentId } }).then((r) => r.data);

export const verifyPayment = (payload) => api.post('/payments/verify', payload).then((r) => r.data);

/** Uploads an image (multipart field `file`) and returns its public URL. */
export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  // The client defaults to JSON; multipart keeps axios from serialising the form (the browser adds the boundary).
  const { data } = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data?.url;
}
