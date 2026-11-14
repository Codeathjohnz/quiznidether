export const TYPE_NAMES = { mcq: 'Multiple choice', tf: 'True or False', text: 'Identification' };

/** Parse "YYYY-MM-DD HH:MM:SS" from the server as local time. */
export function parseDt(s) {
  if (!s) return null;
  const [d, t = '00:00:00'] = s.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm, ss);
}

export function fmtDt(s) {
  const d = parseDt(s);
  if (!d) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(secs) {
  secs = Math.max(0, Math.round(secs || 0));
  return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s`;
}

export function fmtClock(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export const TIME_UNITS = { seconds: 1, minutes: 60, hours: 3600 };

/** "1 hr 30 min", "45 min", "1 min 30 sec" */
export function fmtTimer(total) {
  const s = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h > 1 ? 'hrs' : 'hr'}`);
  if (m) parts.push(`${m} min`);
  if (sec) parts.push(`${sec} sec`);
  return parts.length ? parts.join(' ') : '0 sec';
}

/** Value to show in the number box for a stored timer, in the teacher's chosen unit. */
export function timerValue(seconds, unit) {
  const v = seconds / (TIME_UNITS[unit] || 60);
  return String(Math.round(v * 100) / 100);
}

export const plural =(n, word, many = word + 's') => `${n} ${Number(n) === 1 ? word : many}`;

export const RESULT_BADGE = {
  passed: ['Passed', 'badge-success'],
  failed: ['Failed', 'badge-warn'],
  terminated: ['Terminated', 'badge-danger'],
  in_progress: ['In progress', 'badge-info'],
};
