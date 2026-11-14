import { useCallback, useEffect, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { api } from '../api';
import { Avatar, PageHeader } from '../components/AdminLayout';
import { Stars } from '../components/ReviewForm';
import { Alert, Loading, Stat, useToast } from '../components/ui';
import { fmtDt, parseDt } from '../utils';

const AREA_LABEL = { login: 'Login page', teacher: 'Teacher pages', student: 'Student quiz/exam links' };
const DEVICE_LABEL = { computer: '💻 Computer', phone: '📱 Phone', tablet: '📟 Tablet' };
const STATUS_LABEL = { new: 'New', read: 'Read', done: 'Done' };

const dayLabel = (d, opts = { month: 'short', day: 'numeric' }) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, opts);

/* ---------- small charts (single series, one color) ---------- */

function VisitsChart({ daily }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...daily.map((d) => d.visits));
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  const last = daily.length - 1;

  return (
    <>
      <div className="card-head">
        <h2>Visits per day <span className="muted small">(last 14 days)</span></h2>
        <button type="button" className="link-btn" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>
      </div>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Day</th><th>Visits</th><th>Unique visitors</th></tr></thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}><td>{dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>{d.visits}</td><td>{d.unique}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="vchart">
          <div className="vchart-grid" aria-hidden="true">
            {[top, top / 2, 0].map((v) => <div key={v}><span>{v}</span></div>)}
          </div>
          <div className="vchart-bars" onMouseLeave={() => setHover(null)}>
            {daily.map((d, i) => (
              <div
                key={d.date}
                className={`vchart-col ${hover === i ? 'is-hover' : ''}`}
                tabIndex={0}
                aria-label={`${dayLabel(d.date)}: ${d.visits} visits, ${d.unique} unique visitors`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {i === last && d.visits > 0 && hover === null && <span className="vchart-val">{d.visits}</span>}
                <div className="vchart-bar" style={{ height: `${(d.visits / top) * 100}%` }} />
                {hover === i && (
                  <div className={`vchart-tip ${i > daily.length - 4 ? 'left' : ''}`}>
                    <b>{dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                    <div><span>Visits</span><b>{d.visits}</b></div>
                    <div><span>Unique visitors</span><b>{d.unique}</b></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="vchart-x" aria-hidden="true">
            {daily.map((d, i) => <span key={d.date}>{i % 2 === last % 2 ? (i === last ? 'Today' : dayLabel(d.date)) : ''}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

function HBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.some((r) => r.n)) return <p className="muted">No visits yet.</p>;
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label} title={`${r.label}: ${r.n}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b className="hbar-n">{r.n}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------- tabs ---------- */

function Overview({ data, openReviews }) {
  const { visits, users, reviews } = data;
  return (
    <>
      <div className="stats">
        <Stat n={visits.today} label={`Visits today · ${visits.today_unique} unique`} icon="👀" />
        <Stat n={visits.week} label={`Last 7 days · ${visits.week_unique} unique`} icon="📅" />
        <Stat n={visits.month} label={`Last 30 days · ${visits.month_unique} unique`} icon="🗓️" />
        <Stat n={visits.total} label={`All time · ${visits.total_unique} unique`} icon="🌍" />
      </div>

      <section className="card"><VisitsChart daily={data.daily} /></section>

      <div className="grid-2">
        <section className="card">
          <h2>Where visitors go <span className="muted small">(30 days)</span></h2>
          <HBars rows={Object.keys(AREA_LABEL).map((k) => ({ label: AREA_LABEL[k], n: data.areas[k] || 0 }))} />
        </section>
        <section className="card">
          <h2>Devices <span className="muted small">(30 days)</span></h2>
          <HBars rows={Object.keys(DEVICE_LABEL).map((k) => ({ label: DEVICE_LABEL[k], n: data.devices[k] || 0 }))} />
        </section>
      </div>

      <div className="stats">
        <Stat n={users.teachers} label={`Teachers · ${users.new_week} new this week`} icon="🧑‍🏫" />
        <Stat n={users.active_week} label="Teachers active (7 days)" icon="⚡" />
        <Stat n={users.quizzes} label={`Quizzes/Exams · ${users.classes} classes`} icon="📝" />
        <Stat n={users.attempts} label={`Attempts · ${users.attempts_week} this week`} icon="🎯" />
        <Stat n={users.students} label="Different students" icon="🎒" />
        <Stat n={reviews.average ?? '–'} label={`Average rating · ${reviews.count} reviews`} icon="⭐" />
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Ratings</h2>
          {reviews.count ? (
            <>
              <div className="rating-big">
                <b>{reviews.average}</b><Stars n={Math.round(reviews.average)} />
                <span className="muted small">{reviews.teachers} teachers · {reviews.students} students · {reviews.suggestions} with suggestions</span>
              </div>
              <HBars rows={[5, 4, 3, 2, 1].map((s) => ({ label: `${s} ★`, n: reviews.stars[s] || 0 }))} />
            </>
          ) : <p className="muted">No reviews yet.</p>}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Latest reviews {reviews.new > 0 && <span className="badge badge-danger">{reviews.new} new</span>}</h2>
            <button className="btn btn-sm" onClick={openReviews}>View all</button>
          </div>
          {!reviews.latest.length ? <p className="muted">No reviews yet.</p> : reviews.latest.map((r) => <ReviewCard key={r.id} r={r} compact />)}
        </section>
      </div>
    </>
  );
}

function Users() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('dev.users').then((r) => setUsers(r.users)).catch((e) => setError(e.message)); }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!users) return <Loading />;
  return (
    <section className="card">
      <h2>Teacher accounts ({users.length})</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Teacher</th><th>Login</th><th>Joined</th><th>Last login</th><th>Classes</th><th>Quizzes/Exams</th><th>Attempts</th><th>Visits</th><th>Rating</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <Avatar user={u} size={32} />
                    <span><b>{u.name}</b> {u.is_me && <span className="badge badge-info">You</span>}<br /><small className="muted">{u.email}</small></span>
                  </div>
                </td>
                <td>{u.login}</td>
                <td>{fmtDt(u.created_at)}</td>
                <td>{u.last_login_at ? fmtDt(u.last_login_at) : '—'}</td>
                <td>{u.classes}</td><td>{u.quizzes}</td><td>{u.attempts}</td><td>{u.visits}</td>
                <td>{u.rating ? <Stars n={u.rating} /> : <span className="muted small">no review yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewCard({ r, compact = false, onStatus, onDelete }) {
  return (
    <div className={`review-item ${r.status === 'new' ? 'is-new' : ''}`}>
      <div className="review-top">
        <Stars n={r.rating} />
        <span className={`badge ${r.role === 'teacher' ? 'badge-info' : 'badge-muted'}`}>{r.role === 'teacher' ? 'Teacher' : 'Student'}</span>
        {r.status === 'new' && <span className="badge badge-danger">NEW</span>}
        {r.status === 'done' && <span className="badge badge-success">Done</span>}
      </div>
      <p className={compact ? 'clamp-2' : ''}>{r.comment}</p>
      {r.suggestion && <p className={`review-suggestion ${compact ? 'clamp-2' : ''}`}>💡 <b>Suggestion:</b> {r.suggestion}</p>}
      <div className="muted small">
        <b>{r.name}</b>{r.detail ? ` · ${r.detail}` : ''} · {fmtDt(r.updated_at)}
        {parseDt(r.updated_at) - parseDt(r.created_at) > 60000 ? ' (edited)' : ''}
      </div>
      {onStatus && (
        <div className="row-actions">
          {r.status !== 'read' && <button className="btn btn-sm" onClick={() => onStatus(r, 'read')}>Mark as read</button>}
          {r.status !== 'done' && <button className="btn btn-sm" onClick={() => onStatus(r, 'done')}>✔ Done</button>}
          {r.status !== 'new' && <button className="btn btn-sm" onClick={() => onStatus(r, 'new')}>Mark as new</button>}
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(r)}>Delete</button>
        </div>
      )}
    </div>
  );
}

function Reviews({ onChange }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ role: '', status: '', with_suggestion: false, q: '' });
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('dev.reviews', filters).then((r) => setList(r.reviews)).catch((e) => setError(e.message));
  }, [filters]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setStatus = async (r, status) => {
    await api('dev.review_status', { id: r.id, status }).catch((e) => toast(e.message));
    load(); onChange();
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete the review from ${r.name}?`)) return;
    await api('dev.review_delete', { id: r.id }).catch((e) => toast(e.message));
    load(); onChange();
  };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <section className="card">
      <div className="filters">
        <input type="search" placeholder="Search name, comment, suggestion…" value={filters.q} onChange={set('q')} />
        <select value={filters.role} onChange={set('role')}>
          <option value="">Teachers & students</option><option value="teacher">Teachers</option><option value="student">Students</option>
        </select>
        <select value={filters.status} onChange={set('status')}>
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={filters.with_suggestion} onChange={set('with_suggestion')} /> With suggestion only</label>
      </div>
      <Alert>{error}</Alert>
      {!list ? <Loading /> : !list.length ? <p className="muted">No reviews match.</p>
        : list.map((r) => <ReviewCard key={r.id} r={r} onStatus={setStatus} onDelete={remove} />)}
    </section>
  );
}

/* ---------- page ---------- */

export default function Developer() {
  const { user } = useOutletContext();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api('dev.overview').then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => {
    if (!user.is_developer) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user.is_developer, load]);

  if (!user.is_developer) return <Navigate to="/" replace />;
  if (error && !data) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;

  const tabs = [['overview', '📊 Overview'], ['users', '🧑‍🏫 Users'], ['reviews', `💬 Reviews${data.reviews.new ? ` (${data.reviews.new} new)` : ''}`]];
  return (
    <>
      <PageHeader title="Developer" />
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview data={data} openReviews={() => setTab('reviews')} />}
      {tab === 'users' && <Users />}
      {tab === 'reviews' && <Reviews onChange={load} />}
    </>
  );
}
