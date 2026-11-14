import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api';
import Mascot from '../components/Mascot';
import { PageHeader } from '../components/AdminLayout';
import { Alert, Loading, ResultBadge, Stat } from '../components/ui';
import { fmtDt, fmtDuration } from '../utils';

export default function Dashboard() {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api('dashboard').then(setData).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  const { stats, live, violations, recent } = data;

  return (
    <>
      <PageHeader title="Dashboard" />
      <section className="card hero">
        <Mascot mood={violations.some((v) => v.is_new) ? 'wow' : live.length ? 'think' : 'cheer'} size={120} />
        <div>
          <h2>Hello, {user.name.split(' ')[0]}! 👋</h2>
          <p>
            {live.length
              ? `${live.length} student${live.length === 1 ? ' is' : 's are'} taking a quiz/exam right now. Dethy is watching! 👀`
              : violations.some((v) => v.is_new)
                ? 'Uh-oh! Some students broke the quiz/exam rules. Check the violations below.'
                : 'Ready to make learning fun? Create a quiz/exam and share the link with your class.'}
          </p>
        </div>
      </section>
      <div className="stats">
        <Stat n={stats.classes} label="Classes" icon="🏫" />
        <Stat n={stats.quizzes} label="Quizzes/Exams" icon="📝" />
        <Stat n={stats.submitted} label="Submitted" icon="🎯" />
        <Stat n={stats.terminated} label="Terminated" icon="🚨" variant={stats.terminated ? 'stat-danger' : ''} />
      </div>

      {!stats.classes && (
        <div className="card empty">
          <h3>Welcome! Let's set up your first quiz/exam.</h3>
          <ol className="steps">
            <li>Create a <Link to="/classes">class</Link> (with its default timer).</li>
            <li>Create a <Link to="/quizzes/new">quiz / exam</Link> and set the passing score.</li>
            <li>Add questions, then copy the student link and send it to your class.</li>
          </ol>
        </div>
      )}

      {live.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2><span className="dot-live" /> Taking a quiz/exam right now</h2>
            <Link className="btn btn-sm" to="/results?status=in_progress">Open live view</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Section</th><th>Quiz/Exam</th><th>Started</th><th>Time left</th></tr></thead>
              <tbody>
                {live.map((a) => (
                  <tr key={a.id}>
                    <td>{a.full_name}</td><td>{a.section}</td><td>{a.quiz_title}</td>
                    <td>{fmtDt(a.started_at)}</td><td>{fmtDuration(a.seconds_left)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>⚠ Recent violations (terminated attempts)</h2>
          <Link className="btn btn-sm" to="/results?status=terminated">View all</Link>
        </div>
        {!violations.length ? (
          <p className="muted">No terminated attempts. 🎉</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Section</th><th>Quiz/Exam</th><th>Reason</th><th>When</th><th /></tr></thead>
              <tbody>
                {violations.map((a) => (
                  <tr key={a.id} className={a.is_new ? 'row-new' : ''}>
                    <td><b>{a.full_name}</b> {a.is_new && <span className="badge badge-danger">NEW</span>}</td>
                    <td>{a.section}</td><td>{a.quiz_title}</td>
                    <td className="reason">{a.reason_text}</td>
                    <td>{fmtDt(a.finished_at)}</td>
                    <td><Link className="btn btn-sm" to={`/attempts/${a.id}`}>Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Recent submissions</h2>
          <Link className="btn btn-sm" to="/results">All results</Link>
        </div>
        {!recent.length ? (
          <p className="muted">No submissions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Section</th><th>Quiz/Exam</th><th>Score</th><th>Result</th><th>Submitted</th></tr></thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}>
                    <td>{a.full_name}</td><td>{a.section}</td><td>{a.quiz_title}</td>
                    <td>{a.score}/{a.total} ({a.percentage}%)</td>
                    <td><ResultBadge result={a.result} /></td>
                    <td>{fmtDt(a.finished_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
