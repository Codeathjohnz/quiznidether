import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import { Alert, Loading, ShareLinks, useToast } from '../components/ui';
import { TYPE_NAMES, timerValue } from '../utils';
import ImportQuestions from '../components/ImportQuestions';
import TimerInput from '../components/TimerInput';

const blankChoices = (n = 4) => Array.from({ length: n }, () => ({ id: 0, text: '', correct: false }));
const EMPTY = {
  id: 0, type: 'mcq', question: '', points: '1', choices: blankChoices(), tf_answer: 'true', accepted: '',
  custom_time: false, q_timer_value: '', q_timer_unit: 'seconds',
};

export default function Questions() {
  const { id } = useParams();
  const quizId = Number(id);
  const toast = useToast();
  const formRef = useRef(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [panel, setPanel] = useState(null); // 'import' | null

  const load = () => api('questions.list', { quiz_id: quizId }).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [quizId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  const { quiz, questions, attempt_count: attemptCount } = data;
  const totalPoints = questions.reduce((s, q) => s + Number(q.points), 0);
  const perQ = quiz.timer_mode === 'per_question';
  const toggleCustomTime = (on) => setForm({
    ...form, custom_time: on,
    q_timer_value: on && !form.q_timer_value ? timerValue(quiz.timer_seconds, quiz.timer_unit) : form.q_timer_value,
    q_timer_unit: on && !form.q_timer_value ? quiz.timer_unit : form.q_timer_unit,
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setChoice = (i, patch) => setForm({ ...form, choices: form.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const markCorrect = (i) => setForm({ ...form, choices: form.choices.map((c, j) => ({ ...c, correct: j === i })) });
  const removeChoice = (i) => {
    if (form.choices.length <= 2) return toast('A multiple choice question needs at least 2 choices.');
    setForm({ ...form, choices: form.choices.filter((_, j) => j !== i) });
  };

  const edit = (q) => {
    setFormError('');
    setForm({
      id: q.id, type: q.type, question: q.question, points: q.points,
      choices: q.type === 'mcq' ? q.choices.map((c) => ({ ...c })) : blankChoices(),
      tf_answer: q.tf_answer, accepted: q.accepted.join('\n'),
      custom_time: q.custom_time, q_timer_value: timerValue(q.time_seconds, q.time_unit), q_timer_unit: q.time_unit,
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError('');
    if (form.type === 'mcq' && !form.choices.some((c) => c.correct && c.text.trim())) {
      setFormError('Select the correct choice (click the circle beside it).');
      return;
    }
    try {
      await api('questions.save', { ...form, quiz_id: quizId });
      toast(form.id ? 'Question saved.' : 'Question added.');
      setForm({
        ...EMPTY, type: form.type, points: form.points, choices: blankChoices(),
        custom_time: form.custom_time, q_timer_value: form.q_timer_value, q_timer_unit: form.q_timer_unit,
      });
      load();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const remove = async (q, i) => {
    if (!window.confirm(`Delete question ${i + 1}?`)) return;
    await api('questions.delete', { quiz_id: quizId, id: q.id }).catch((e) => setError(e.message));
    if (form.id === q.id) setForm(EMPTY);
    toast('Question deleted.');
    load();
  };

  const move = async (q, direction) => {
    await api('questions.move', { quiz_id: quizId, id: q.id, direction }).catch((e) => setError(e.message));
    load();
  };

  return (
    <>
      <PageHeader title="Questions">
        <button className="btn btn-primary" onClick={() => setPanel('import')}>📥 Import TQ</button>
        <Link className="btn" to={`/quizzes/${quizId}/edit`}>Quiz/exam settings</Link>
        <Link className="btn" to={`/results?quiz=${quizId}`}>Results</Link>
      </PageHeader>
      <Alert>{error}</Alert>

      <section className="card quiz-summary">
        <div>
          <div className="eyebrow">{quiz.class_name}</div>
          <h2>{quiz.title}</h2>
          <div className="chips">
            <span className={`badge ${quiz.is_open ? 'badge-success' : 'badge-muted'}`}>{quiz.is_open ? 'Open' : 'Closed'}</span>
            <span className="chip">{perQ ? `⏱ ${quiz.timer_label} per question` : `⏰ ${quiz.timer_label} whole quiz/exam`}</span>
            <span className="chip">{questions.length} questions · {totalPoints} pts</span>
            <span className="chip chip-time">⌛ Expected total: {quiz.total_label}</span>
            <span className="chip">Passing: {quiz.passing_mode === 'manual' ? 'Manual' : 'Auto'} · {quiz.passing}%</span>
          </div>
        </div>
        <div className="share compact">
          <ShareLinks links={{ main: quiz.links.lan || quiz.links.main }} compact />
        </div>
      </section>
      {attemptCount > 0 && (
        <Alert type="warning">{attemptCount} student attempt(s) exist. Editing questions or answers automatically re-grades them.</Alert>
      )}

      {panel === 'import' && (
        <ImportQuestions quiz={quiz} existingCount={questions.length} attemptCount={attemptCount}
          onClose={() => setPanel(null)} onImported={load} />
      )}

      <div className="grid-2 questions-layout">
        <section>
          {!questions.length && (
            <div className="card empty">
              <p>No questions yet. Add them one by one with the form, or import a whole questionnaire at once.</p>
              {!panel && <button className="btn btn-primary" onClick={() => setPanel('import')}>📥 Import a TQ</button>}
            </div>
          )}
          {questions.map((q, i) => (
            <article key={q.id} className={`card question ${form.id === q.id ? 'is-editing' : ''}`}>
              <div className="question-head">
                <span className="q-badge">{i + 1}</span>
                <span className="chip">{TYPE_NAMES[q.type]}</span>
                <span className="chip">{q.points} pt{q.points === '1' ? '' : 's'}</span>
                {perQ && <span className={`chip ${q.custom_time ? 'chip-time' : ''}`} title={q.custom_time ? 'This question has its own time' : 'Uses the quiz/exam time per question'}>⏱ {q.time_label}</span>}
                <div className="spacer" />
                <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => move(q, 'up')}>↑</button>
                <button className="icon-btn" title="Move down" disabled={i === questions.length - 1} onClick={() => move(q, 'down')}>↓</button>
                <button className="btn btn-sm" onClick={() => edit(q)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(q, i)}>Delete</button>
              </div>
              <div className="question-text" style={{ whiteSpace: 'pre-wrap' }}>{q.question}</div>
              {q.type === 'mcq' && (
                <ul className="choice-list">
                  {q.choices.map((c, j) => (
                    <li key={c.id} className={c.correct ? 'correct' : ''}>
                      <span className="opt-letter">{String.fromCharCode(65 + j)}</span>
                      {c.text} {c.correct && <b>✓</b>}
                    </li>
                  ))}
                </ul>
              )}
              {q.type === 'tf' && <p className="answer-line">Answer: <b>{q.tf_answer === 'false' ? 'False' : 'True'}</b></p>}
              {q.type === 'text' && (
                <p className="answer-line">Accepted: {q.accepted.map((a) => <span key={a} className="chip chip-ok" style={{ marginRight: 4 }}>{a}</span>)}</p>
              )}
            </article>
          ))}
        </section>

        <form className="card sticky" onSubmit={save} ref={formRef}>
          <h2>{form.id ? 'Edit question' : 'Add a question'}</h2>
          <Alert>{formError}</Alert>
          <div className="grid-2 tight">
            <label>Type
              <select value={form.type} onChange={set('type')}>
                {Object.entries(TYPE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Points
              <input type="number" min="0.5" step="0.5" required value={form.points} onChange={set('points')} />
            </label>
          </div>
          <label>Question
            <textarea rows={3} required value={form.question} onChange={set('question')} placeholder="Type the question…" />
          </label>

          {form.type === 'mcq' && (
            <div>
              <div className="label">Choices <small className="muted">— click the circle of the correct one</small></div>
              {form.choices.map((c, i) => (
                <div className="choice-row" key={i}>
                  <input type="radio" name="correct" checked={c.correct} onChange={() => markCorrect(i)} title="Mark as correct" />
                  <input value={c.text} onChange={(e) => setChoice(i, { text: e.target.value })} placeholder={`Choice ${String.fromCharCode(65 + i)}`} />
                  <button type="button" className="icon-btn" onClick={() => removeChoice(i)} title="Remove">✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, choices: [...form.choices, { id: 0, text: '', correct: false }] })}>
                + Add choice
              </button>
            </div>
          )}

          {form.type === 'tf' && (
            <div>
              <div className="label">Correct answer</div>
              <label className="check"><input type="radio" checked={form.tf_answer === 'true'} onChange={() => setForm({ ...form, tf_answer: 'true' })} /> True</label>
              <label className="check"><input type="radio" checked={form.tf_answer === 'false'} onChange={() => setForm({ ...form, tf_answer: 'false' })} /> False</label>
            </div>
          )}

          {form.type === 'text' && (
            <label>Accepted answers <small className="muted">(one per line — not case-sensitive)</small>
              <textarea rows={3} value={form.accepted} onChange={set('accepted')} placeholder={'e.g.\nJose Rizal\nRizal'} />
            </label>
          )}

          {perQ && (
            <div className="q-time-box">
              <label className="check">
                <input type="checkbox" checked={form.custom_time} onChange={(e) => toggleCustomTime(e.target.checked)} />
                <span>Give this question its own time <small className="muted">(otherwise {quiz.timer_label}, the quiz/exam time per question)</small></span>
              </label>
              {form.custom_time && (
                <TimerInput label="Time for this question" value={form.q_timer_value} unit={form.q_timer_unit} who="this question"
                  onChange={({ value, unit }) => setForm({ ...form, q_timer_value: value, q_timer_unit: unit })} />
              )}
            </div>
          )}

          <div className="row-actions">
            <button className="btn btn-primary">{form.id ? 'Save question' : 'Add question'}</button>
            {form.id > 0 && <button type="button" className="btn" onClick={() => setForm(EMPTY)}>Cancel</button>}
          </div>
        </form>
      </div>
    </>
  );
}
