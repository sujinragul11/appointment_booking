// Load test (section 11): browse + slot lookups for many virtual users, plus a booking stream.
//   k6 run -e BASE_URL=http://localhost:8080 -e LOGIN_EMAIL=... -e LOGIN_PASSWORD=... \
//          -e PROVIDER_ID=... -e SERVICE_ID=... loadtest/k6-booking.js
// Thresholds encode NFR-1 (API p95 < 500 ms) and a <1% error rate.
// Needs an existing customer account and a provider with a bookable service (there is no sample data).
// Run against a staging copy; disable rate limiting
// (RATE_LIMIT_ENABLED=false) or run from several IPs, otherwise 429s are expected by design.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const PROVIDER_ID = Number(__ENV.PROVIDER_ID);
const SERVICE_ID = Number(__ENV.SERVICE_ID);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },
        { duration: '3m', target: 1000 },
        { duration: '1m', target: 0 },
      ],
      exec: 'browse',
    },
    book: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '4m',
      preAllocatedVUs: 20,
      exec: 'book',
      startTime: '30s',
    },
  },
  thresholds: {
    'http_req_duration{kind:api}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

function isoDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function setup() {
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: __ENV.LOGIN_EMAIL, password: __ENV.LOGIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } });
  return { token: res.json('accessToken') };
}

export function browse() {
  const tags = { kind: 'api' };
  const list = http.get(`${BASE}/api/providers?size=12`, { tags });
  check(list, { 'providers 200': (r) => r.status === 200 });
  http.get(`${BASE}/api/categories`, { tags });
  http.get(`${BASE}/api/services?q=hair`, { tags });
  const providers = list.json('content') || [];
  if (providers.length) {
    const p = providers[Math.floor(Math.random() * providers.length)];
    const detail = http.get(`${BASE}/api/providers/${p.id}`, { tags });
    check(detail, { 'provider 200': (r) => r.status === 200 });
    const slots = http.get(`${BASE}/api/providers/${p.id}/slots?date=${isoDate(1 + Math.floor(Math.random() * 10))}`, { tags });
    check(slots, { 'slots 200': (r) => r.status === 200 });
  }
  sleep(1 + Math.random() * 2);
}

export function book(data) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` };
  const tags = { kind: 'api' };
  const date = isoDate(2 + Math.floor(Math.random() * 20));
  const slots = http.get(`${BASE}/api/slots?providerId=${PROVIDER_ID}&serviceId=${SERVICE_ID}&date=${date}`, { tags }).json('slots') || [];
  const free = slots.filter((s) => s.status === 'AVAILABLE');
  if (!free.length) return;
  const s = free[Math.floor(Math.random() * free.length)];
  const res = http.post(`${BASE}/api/appointments`, JSON.stringify({
    providerId: PROVIDER_ID, serviceId: SERVICE_ID, date, startTime: s.startTime, paymentMethod: 'PAY_AT_VENUE',
  }), { headers, tags });
  // 409 = another virtual user won the race for this slot: the double-booking guard working as intended
  check(res, { 'booked or lost race': (r) => r.status === 201 || r.status === 409 });
}
