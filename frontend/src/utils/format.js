export function formatMoney(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatDateTime(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

export function formatDate(s) {
  if (!s) return '-';
  const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(t) {
  if (!t) return '-';
  const [h, m] = String(t).slice(0, 5).split(':');
  let hh = Number(h);
  const am = hh < 12;
  if (hh === 0) hh = 12;
  if (hh > 12) hh -= 12;
  return `${hh}:${m} ${am ? 'AM' : 'PM'}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function nextDays(count, offset = 1) {
  const out = [];
  for (let i = offset; i < offset + count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      dow: DAYS[d.getDay()].slice(0, 3),
      day: d.getDate(),
      month: MONTHS[d.getMonth()],
      isToday: i === offset
    });
  }
  return out;
}

export function initials(name = '') {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}