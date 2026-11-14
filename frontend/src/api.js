// In dev (npm run dev) Vite proxies /api to XAMPP; in the build the app lives in /app next to /api.
export const API_URL = import.meta.env.DEV ? '/api/index.php' : '../api/index.php';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(action, data = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'QND' },
      body: JSON.stringify(data),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that XAMPP Apache is running and your connection is OK.', 0);
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Server error (${res.status}). Is MySQL running in XAMPP?`, res.status);
  }
  if (!json.ok) {
    if (res.status === 401 && !action.startsWith('auth.') && !action.startsWith('take.')) {
      window.location.hash = '#/login';
    }
    throw new ApiError(json.error || 'Request failed.', res.status);
  }
  return json;
}

/** URL for GET downloads (CSV export). */
export function apiUrl(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  return `${API_URL}?${qs.toString()}`;
}

/** Counts a visit for the developer dashboard (an anonymous random id per browser, never personal data). */
export function trackVisit(area, path = '') {
  let vid = '';
  try {
    vid = localStorage.getItem('qnd_vid') || '';
    if (!/^[a-z0-9]{16,64}$/.test(vid)) {
      vid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
      localStorage.setItem('qnd_vid', vid);
    }
  } catch {
    vid = Math.random().toString(36).slice(2).padEnd(16, '0');
  }
  api('track.visit', { area, path, vid }).catch(() => {});
}

/** Fire-and-forget request that survives the page closing (used for terminations). */
export function beacon(action, data) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => fd.append(k, v));
  const url = `${API_URL}?action=${encodeURIComponent(action)}`;
  let sent = false;
  try {
    sent = navigator.sendBeacon && navigator.sendBeacon(url, fd);
  } catch {
    sent = false;
  }
  if (!sent) fetch(url, { method: 'POST', body: fd, keepalive: true, credentials: 'same-origin' }).catch(() => {});
}
