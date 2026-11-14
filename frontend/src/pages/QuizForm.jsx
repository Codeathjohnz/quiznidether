import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import { Alert, Loading, useToast } from '../components/ui';
import TimerInput from '../components/TimerInput';
import { TIME_UNITS, fmtTimer, timerValue } from '../utils';

const DEFAULT_INSTRUCTIONS = 'Read each question carefully and choose the best answer.\nAnswer all questions before the timer runs out.';

export default function QuizForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [classes, setClasses] = useState(null);
  const [autoPassing, setAutoPassing] = useState(75);
  const [form, setForm] = useState(null);
  const [timerTouched, setTimerTouched] = useState(!!id);
  const [error, setError] = useState('');

  useEffect(() => {
    api('quizzes.form', { id: Number(id || 0) })
      .then((r) => {
        if (!r.classes.length) {
          toast('Create a class first.');
          navigate('/classes');
          return;
        }
        setClasses(r.classes);
        setAutoPassing(r.autoPassing);
        if (r.quiz) {
          setForm({ ...r.quiz, timer_value: timerValue(r.quiz.timer_seconds, r.quiz.timer_unit) });
        } else {
          const pre = r.classes.find((c) => c.id === Number(params.get('class'))) || r.classes[0];
          setForm({
            id: 0, class_id: pre.id, title: '', instructions: DEFAULT_INSTRUCTIONS,
            timer_mode: 'per_question', timer_value: '30', timer_unit: 'seconds',
            passing_mode: 'auto', passing_score: String(r.autoPassing), shuffle_questions: false, show_result: true, is_open: true,
          });
        }
      })
      .catch((e) => setError(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return error ? <Alert>{error}</Alert> : <Loading />;

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const next = { ...form, [k]: v };
    if (k === 'class_id') {
      next.class_id = Number(v);
      const cls = classes.find((c) => c.id === Number(v));
      if (!timerTouched && cls && form.timer_mode === 'whole') {
        next.timer_value = timerValue(cls.timer_seconds, cls.timer_unit);
        next.timer_unit = cls.timer_unit;
      }
    }
    setForm(next);
  };

  const setTimer = ({ value, unit }) => {
    setTimerTouched(true);
    setForm({ ...form, timer_value: value, timer_unit: unit });
  };

  const setMode = (mode) => {
    const next = { ...form, timer_mode: mode };
    if (!timerTouched && !form.id) {
      const cls = classes.find((c) => c.id === form.class_id);
      if (mode === 'per_question') Object.assign(next, { timer_value: '30', timer_unit: 'seconds' });
      else if (cls) Object.assign(next, { timer_value: timerValue(cls.timer_seconds, cls.timer_unit), timer_unit: cls.timer_unit });
    }
    setForm(next);
  };

  // Expected total time of the quiz (sum of every question's time in per-question mode).
  const perQ = form.timer_mode === 'per_question';
  const secs = Math.round((Number(form.timer_value) || 0) * (TIME_UNITS[form.timer_unit] || 60));
  const n = form.question_count || 0;
  const custom = form.custom_time_count || 0;
  const totalSecs = perQ
    ? (form.id ? (form.total_seconds - (n - custom) * form.timer_seconds) + (n - custom) * secs : 0)
    : secs;

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api('quizzes.save', form);
      if (form.id) {
        toast('Quiz/exam settings saved.');
        navigate(`/quizzes?class=${form.class_id}`);
      } else {
        toast('Quiz/exam created. Now add your questions.');
        navigate(`/quizzes/${r.id}/questions`);
      }
    } catch (err) {
      setError(err.message);
      window.scrollTo(0, 0);
    }
  };

  const manual = form.passing_mode === 'manual';

  return (
    <>
      <PageHeader title={form.id ? 'Edit quiz/exam' : 'New quiz/exam'} />
      <Alert>{error}</Alert>
      <form className="card form-wide" onSubmit={save}>
        <label>Class
          <select value={form.class_id} onChange={set('class_id')}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <fieldset className="fieldset">
          <legend>Timer</legend>
          <div className="mode-cards">
            <label className="radio-card">
              <input type="radio" name="tm" checked={perQ} onChange={() => setMode('per_question')} />
              <span><b>⏱ Timer per question</b><small>One question at a time. When its time runs out, it moves to the next question automatically. No going back.</small></span>
            </label>
            <label className="radio-card">
              <input type="radio" name="tm" checked={!perQ} onChange={() => setMode('whole')} />
              <span><b>⏰ One timer for the whole quiz/exam</b><small>All questions on one page. Students can answer in any order until the time is up.</small></span>
            </label>
          </div>
          <TimerInput label={perQ ? 'Time for each question' : 'Time for the whole quiz/exam'} value={form.timer_value} unit={form.timer_unit}
            onChange={setTimer} who={perQ ? 'each question' : 'the whole quiz/exam'} />
          {!perQ && secs > 0 && secs < 180 && n !== 1 && (
            <div className="alert alert-warning">
              ⚠ {fmtTimer(secs)} is the time for the <b>whole quiz/exam</b>{n > 1 ? ` (all ${n} questions together)` : ''}.
              Did you mean {fmtTimer(secs)} for <b>each question</b>?{' '}
              <button type="button" className="link-btn" onClick={() => setForm({ ...form, timer_mode: 'per_question' })}>
                Switch to timer per question
              </button>
            </div>
          )}
          <div className="total-time">
            <span className="total-icon">⌛</span>
            {perQ ? (
              n > 0 ? (
                <span>Expected total: <b>{fmtTimer(totalSecs)}</b> for {n} question{n === 1 ? '' : 's'}
                  {custom > 0 && <small className="muted"> ({custom} with their own time)</small>}</span>
              ) : (
                <span>Expected total = <b>{fmtTimer(secs)}</b> × number of questions. <small className="muted">Shown here after you add questions.</small></span>
              )
            ) : (
              <span>Expected total: <b>{fmtTimer(totalSecs)}</b></span>
            )}
          </div>
        </fieldset>
        <label>Title
          <input required maxLength={200} value={form.title} onChange={set('title')} placeholder="e.g. Midterm Exam – Chapter 1 to 4" />
        </label>
        <label>Instructions shown to students
          <textarea rows={5} value={form.instructions} onChange={set('instructions')} />
        </label>

        <fieldset className="fieldset">
          <legend>Passing score</legend>
          <label className="radio-card">
            <input type="radio" name="pm" checked={!manual} onChange={() => setForm({ ...form, passing_mode: 'auto' })} />
            <span><b>Automatic</b><small>Uses the standard passing rate of {autoPassing}%.</small></span>
          </label>
          <label className="radio-card">
            <input type="radio" name="pm" checked={manual} onChange={() => setForm({ ...form, passing_mode: 'manual' })} />
            <span><b>Manual</b><small>Set your own passing percentage.</small></span>
          </label>
          <label className={manual ? '' : 'is-disabled'}>Passing percentage
            <span className="input-suffix">
              <input type="number" min={1} max={100} step="0.01" disabled={!manual} required={manual}
                value={form.passing_score} onChange={set('passing_score')} />
              <span>%</span>
            </span>
          </label>
          <p className="hint">Changing this later re-evaluates Passed/Failed for everyone who already took the quiz/exam.</p>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Options</legend>
          <label className="check"><input type="checkbox" checked={form.is_open} onChange={set('is_open')} /> Open — students can use the link to take this quiz/exam</label>
          <label className="check"><input type="checkbox" checked={form.shuffle_questions} onChange={set('shuffle_questions')} /> Shuffle question and choice order for each student</label>
          <label className="check"><input type="checkbox" checked={form.show_result} onChange={set('show_result')} /> Show the score to the student after submitting</label>
        </fieldset>

        <div className="row-actions">
          <button className="btn btn-primary">{form.id ? 'Save changes' : 'Create quiz/exam & add questions'}</button>
          <Link className="btn" to="/quizzes">Cancel</Link>
          {form.id > 0 && <Link className="btn" to={`/quizzes/${form.id}/questions`}>Manage questions</Link>}
        </div>
      </form>
    </>
  );
}
