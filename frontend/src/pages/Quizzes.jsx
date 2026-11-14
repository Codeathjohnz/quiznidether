import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import { Alert, Loading, ShareLinks, useToast } from '../components/ui';

export default function Quizzes() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const classId = Number(params.get('class') || 0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('quizzes.list', { class_id: classId }).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action, q, confirmMsg, okMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await api(action, { id: q.id });
      toast(okMsg);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  const { quizzes, classes } = data;

  return (
    <>
      <PageHeader title="Quizzes & Exams">
        <Link className="btn btn-primary" to={`/quizzes/new${classId ? `?class=${classId}` : ''}`}>+ New quiz/exam</Link>
      </PageHeader>
      <Alert>{error}</Alert>
      <div className="filters">
        <select value={classId} onChange={(e) => setParams(e.target.value !== '0' ? { class: e.target.value } : {})}>
          <option value="0">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!classes.length ? (
        <div className="card empty"><p>You need a class before creating a quiz/exam.<Link to="/classes">Create a class</Link>.</p></div>
      ) : !quizzes.length ? (
        <div className="card empty"><p>No quizzes/exams yet. <Link to={`/quizzes/new${classId ? `?class=${classId}` : ''}`}>Create your first quiz/exam</Link>.</p></div>
      ) : null}

      {quizzes.map((q) => (
        <section className="card quiz-card" key={q.id}>
          <div className="quiz-card-head">
            <div>
              <div className="eyebrow">{q.class_name}</div>
              <h2>{q.title}</h2>
              <div className="chips">
                <span className={`badge ${q.is_open ? 'badge-success' : 'badge-muted'}`}>{q.is_open ? 'Open' : 'Closed'}</span>
                <span className="chip">{q.timer_mode === 'per_question' ? `⏱ ${q.timer_label} per question` : `⏰ ${q.timer_label} whole quiz/exam`}</span>
                <span className="chip chip-time">⌛ Total: {q.total_label}</span>
                <span className="chip">{q.question_count} questions · {q.total_points} pts</span>
                <span className="chip">Passing: {q.passing_mode === 'manual' ? 'Manual' : 'Auto'} · {q.passing}%</span>
                <span className="chip">{q.submitted_count} submitted</span>
                {q.terminated_count > 0 && <span className="chip chip-danger">{q.terminated_count} terminated</span>}
                {q.live_count > 0 && <span className="chip chip-live">{q.live_count} taking now</span>}
              </div>
            </div>
            <div className="list-actions">
              <Link className="btn btn-sm btn-primary" to={`/quizzes/${q.id}/questions`}>Questions</Link>
              <Link className="btn btn-sm" to={`/quizzes/${q.id}/edit`}>Edit</Link>
              <Link className="btn btn-sm" to={`/results?quiz=${q.id}`}>Results</Link>
              <button className="btn btn-sm" onClick={() => act('quizzes.toggle', q, null, q.is_open ? 'Quiz/exam closed.' : 'Quiz/exam opened.')}>
                {q.is_open ? 'Close' : 'Open'}
              </button>
              <button className="btn btn-sm btn-danger"
                onClick={() => act('quizzes.delete', q, `Delete quiz/exam "${q.title}"? All its questions and student results will be deleted and cannot be recovered.`, 'Quiz/exam deleted.')}>
                Delete
              </button>
            </div>
          </div>
          <div className="share">
            <ShareLinks links={q.links} />
            <button className="link-btn"
              onClick={() => act('quizzes.regen', q, 'Generate a new link? The current link will stop working.', 'New link generated.')}>
              Generate a new link
            </button>
            {!q.question_count && <span className="warn-text"> · Add questions before sending the link.</span>}
          </div>
        </section>
      ))}
    </>
  );
}
