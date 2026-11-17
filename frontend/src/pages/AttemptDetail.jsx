import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import Figure from '../components/Figure';
import { Alert, Loading, ResultBadge } from '../components/ui';
import { fmtDt, fmtDuration } from '../utils';

const STATE_LABEL = { right: '✓ Correct', wrong: '✗ Wrong', blank: '— No answer' };

export default function AttemptDetail() {
  const { id } = useParams();
  const { refreshNav } = useOutletContext();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('attempts.get', { id: Number(id) })
      .then((r) => { setData(r); refreshNav(); })
      .catch((e) => setError(e.message));
  }, [id, refreshNav]);

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  const { attempt: a, answers } = data;

  return (
    <>
      <PageHeader title={a.full_name}>
        <Link className="btn" to={`/results?quiz=${a.quiz_id}`}>← Back to results</Link>
      </PageHeader>

      {a.status === 'terminated' && (
        <section className="card violation-card">
          <div className="violation-icon">⚠</div>
          <div>
            <h2>Quiz terminated</h2>
            <p className="violation-reason">{a.reason_text}</p>
            {a.detail && <p className="small">{a.detail}</p>}
            <p className="small muted">Terminated on {fmtDt(a.finished_at)}, {fmtDuration(a.duration)} after starting.</p>
          </div>
        </section>
      )}

      <section className="card">
        <dl className="details">
          <div><dt>Student</dt><dd>{a.full_name}</dd></div>
          <div><dt>Section</dt><dd>{a.section}</dd></div>
          <div><dt>Quiz</dt><dd>{a.quiz_title} <span className="muted">({a.class_name})</span></dd></div>
          <div><dt>Status</dt><dd><ResultBadge result={a.result} /> {a.submit_note && <span className="muted small">{a.submit_note}</span>}</dd></div>
          <div><dt>Score</dt><dd><b>{a.score} / {a.total}</b> ({a.percentage}%) · passing {a.passing}%</dd></div>
          <div><dt>Started</dt><dd>{fmtDt(a.started_at)}</dd></div>
          <div><dt>Finished</dt><dd>{fmtDt(a.finished_at)} <span className="muted">({fmtDuration(a.duration)})</span></dd></div>
          <div><dt>Answered</dt><dd>{a.answered} of {answers.length}</dd></div>
          <div><dt>Internet</dt><dd>
            {a.offline_count > 0
              ? <>📴 Lost connection {a.offline_count} time{a.offline_count === 1 ? '' : 's'}, about {fmtDuration(a.offline_seconds)} offline in total. <span className="muted small">Answers made while offline were sent when it came back.</span></>
              : <span className="muted">No connection problems reported</span>}
            {a.no_signal && <> · <span className="badge badge-warn">No signal since {fmtDt(a.last_seen)}</span></>}
          </dd></div>
          <div><dt>Device</dt><dd className="small muted">{a.ip} · {a.user_agent}{a.client_note && <><br />{a.client_note}</>}</dd></div>
        </dl>
      </section>

      <h2 className="section-title">Answers</h2>
      {answers.map((q, i) => (
        <article key={q.id} className={`card answer answer-${q.state}`}>
          <div className="question-head">
            <span className="q-badge">{i + 1}</span>
            <span className="chip">{STATE_LABEL[q.state]}</span>
            <span className="chip">{q.earned} / {q.points} pts</span>
          </div>
          <div className="question-text" style={{ whiteSpace: 'pre-wrap' }}>{q.question}</div>
          {q.figure && <Figure figureKey={q.figure} small />}
          <p className="answer-line">Student's answer: <b>{q.given ? q.given : <span className="muted">(none)</span>}</b></p>
          {q.state !== 'right' && <p className="answer-line">Correct answer: <b>{q.correct}</b></p>}
        </article>
      ))}
    </>
  );
}
