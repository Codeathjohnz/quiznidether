import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, apiUrl } from '../api';
import { PageHeader } from '../components/AdminLayout';
import { Alert, Loading, ResultBadge, Stat, useToast } from '../components/ui';
import { fmtDt, fmtDuration } from '../utils';

function readAutoRefresh() {
  try { return localStorage.getItem('qnd_autorefresh') === '1'; } catch { return false; }
}

export default function Results() {
  const { refreshNav } = useOutletContext();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const quizId = Number(params.get('quiz') || 0);
  const status = params.get('status') || '';
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(readAutoRefresh);

  const load = () =>
    api('results.list', { quiz_id: quizId, status, q })
      .then((r) => { setData(r); refreshNav(); })
      .catch((e) => setError(e.message));

  useEffect(() => { setSearch(q); load(); }, [quizId, status, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem('qnd_autorefresh', auto ? '1' : '0'); } catch { /* ignore */ }
    if (!auto) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [auto, quizId, status, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (patch) => {
    const next = { quiz: quizId || '', status, q, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v && v !== '0')));
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete this attempt by ${a.full_name}? They will be able to take the quiz/exam again.`)) return;
    await api('attempts.delete', { id: a.id }).catch((e) => setError(e.message));
    toast('Attempt deleted. The student can now retake the quiz/exam.');
    load();
  };

  const regrade = async () => {
    await api('results.regrade', { quiz_id: quizId }).catch((e) => setError(e.message));
    toast('All attempts re-graded.');
    load();
  };

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  const { rows, summary: s, quiz, quizzes } = data;
  const title = status === 'terminated' ? 'Violations' : quiz ? `Results: ${quiz.title}` : 'Results';
  const exportHref = apiUrl('results.export', { quiz_id: quizId, status, q });

  return (
    <>
      <PageHeader title={title}>
        <a className="btn" href={exportHref}>Export CSV</a>
      </PageHeader>
      <Alert>{error}</Alert>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); setFilter({ q: search.trim() }); }}>
        <select value={quizId} onChange={(e) => setFilter({ quiz: e.target.value })}>
          <option value="0">All quizzes/exams</option>
          {quizzes.map((x) => <option key={x.id} value={x.id}>{x.class_name} — {x.title}</option>)}
        </select>
        <select value={status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="terminated">Terminated</option>
          <option value="in_progress">In progress</option>
        </select>
        <input placeholder="Search name or section" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn">Search</button>
        <label className="check auto-refresh">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh (live)
        </label>
      </form>

      <div className="stats">
        <Stat n={s.total} label="Attempts" icon="🧑‍🎓" />
        <Stat n={s.submitted} label="Submitted" icon="🎯" />
        <Stat n={s.terminated} label="Terminated" icon="🚨" variant={s.terminated ? 'stat-danger' : ''} />
        <Stat n={s.pass_rate !== null ? `${s.pass_rate}%` : '—'} label={`Pass rate (${s.passed} passed)`} icon="🏆" />
        <Stat n={s.average !== null ? `${s.average}%` : '—'} label="Average score" icon="⭐" />
        {s.live > 0 && <Stat n={s.live} label="Taking now" icon="⏳" variant="stat-live" />}
      </div>

      {quiz && (
        <p className="muted small">
          Passing score: <b>{quiz.passing_mode === 'manual' ? 'Manual' : 'Auto'} · {quiz.passing}%</b> ·{' '}
          <Link to={`/quizzes/${quiz.id}/edit`}>change</Link> · <button className="link-btn" onClick={regrade}>Re-grade all</button>
        </p>
      )}

      <section className="card">
        {!rows.length ? (
          <p className="muted">No attempts found.</p>
        ) : (
          <div className="table-wrap">
            <table className="results">
              <thead>
                <tr>
                  <th>Student</th><th>Section</th>{!quizId && <th>Quiz/Exam</th>}<th>Status</th><th>Score</th><th>Result</th>
                  <th>Reason / note</th><th>Started</th><th>Duration</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={`${a.status === 'terminated' ? 'row-terminated' : ''} ${a.is_new ? 'row-new' : ''}`}>
                    <td><b>{a.full_name}</b> {a.is_new && <span className="badge badge-danger">NEW</span>}</td>
                    <td>{a.section}</td>
                    {!quizId && <td>{a.quiz_title}<div className="muted small">{a.class_name}</div></td>}
                    <td>
                      <span className={`badge ${a.status === 'submitted' ? 'badge-muted' : a.status === 'terminated' ? 'badge-danger' : 'badge-info'}`}>
                        {a.status === 'in_progress' ? 'In progress' : a.status[0].toUpperCase() + a.status.slice(1)}
                      </span>
                    </td>
                    <td className="nowrap">{a.score}/{a.total} <span className="muted">({a.percentage}%)</span></td>
                    <td><ResultBadge result={a.result} /></td>
                    <td className="reason">
                      {a.status === 'terminated' ? <b className="danger-text">{a.reason_text}</b>
                        : a.status === 'in_progress' ? (
                          <span className="muted">
                            {fmtDuration(a.seconds_left)} left
                            {a.no_signal && <span className="badge badge-warn" title={`Last signal: ${fmtDt(a.last_seen)}. The quiz keeps running on the device; answers arrive when it is back online.`}> 📴 No signal</span>}
                          </span>
                        )
                        : <span className="muted">{a.submit_note}</span>}
                    </td>
                    <td className="nowrap small">{fmtDt(a.started_at)}</td>
                    <td className="nowrap small">{fmtDuration(a.duration)}</td>
                    <td className="nowrap">
                      <Link className="btn btn-sm" to={`/attempts/${a.id}`}>View</Link>{' '}
                      <button className="btn btn-sm btn-danger" title="Delete attempt / allow retake" onClick={() => remove(a)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="muted small">Tip: Deleting an attempt allows that student to retake the quiz/exam (each name + section can only take a quiz/exam once).</p>
    </>
  );
}
