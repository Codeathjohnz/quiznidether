import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import { Alert, Loading, useToast } from '../components/ui';
import { plural, timerValue } from '../utils';
import TimerInput from '../components/TimerInput';

const EMPTY = { id: 0, name: '', description: '', timer_value: '30', timer_unit: 'minutes', apply_timer: false };

export default function Classes() {
  const toast = useToast();
  const [classes, setClasses] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = () => api('classes.list').then((r) => setClasses(r.classes)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('classes.save', form);
      toast(form.id ? 'Class updated.' : 'Class created. You can now add quizzes/exams to it.');
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete class "${c.name}"? All of its quizzes/exams, questions and student results will be deleted too.`)) return;
    await api('classes.delete', { id: c.id }).catch((e) => setError(e.message));
    if (form.id === c.id) setForm(EMPTY);
    toast('Class deleted.');
    load();
  };

  if (!classes) return error ? <Alert>{error}</Alert> : <Loading />;

  return (
    <>
      <PageHeader title="Classes" />
      <div className="grid-2">
        <form className="card" onSubmit={save}>
          <h2>{form.id ? 'Edit class' : 'Create a class'}</h2>
          <Alert>{error}</Alert>
          <label>Class name
            <input value={form.name} onChange={set('name')} required maxLength={150} placeholder="e.g. ICT 11 – Programming" />
          </label>
          <label>Description <small className="muted">(optional)</small>
            <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Subject, schedule, notes…" />
          </label>
          <TimerInput label="Default quiz/exam timer" value={form.timer_value} unit={form.timer_unit}
            onChange={({ value, unit }) => setForm({ ...form, timer_value: value, timer_unit: unit })} />
          <p className="hint">New quizzes/exams in this class start with this timer. You can still change it for each quiz/exam.</p>
          {form.id > 0 && (
            <label className="check">
              <input type="checkbox" checked={form.apply_timer} onChange={set('apply_timer')} />
              Also apply this timer to all existing quizzes/exams in this class
            </label>
          )}
          <div className="row-actions">
            <button className="btn btn-primary">{form.id ? 'Save changes' : 'Create class'}</button>
            {form.id > 0 && <button type="button" className="btn" onClick={() => setForm(EMPTY)}>Cancel</button>}
          </div>
        </form>

        <section className="card">
          <h2>Your classes</h2>
          {!classes.length && <p className="muted">No classes yet. Create one using the form.</p>}
          <div className="list">
            {classes.map((c) => (
              <div className="list-item" key={c.id}>
                <div className="list-main">
                  <div className="list-title">{c.name}</div>
                  {c.description && <div className="muted small" style={{ whiteSpace: 'pre-line' }}>{c.description}</div>}
                  <div className="chips">
                    <span className="chip">⏱ {c.timer_label} timer</span>
                    <span className="chip">{plural(c.quiz_count, 'quiz/exam', 'quizzes/exams')}</span>
                    <span className="chip">{plural(c.attempt_count, 'attempt')}</span>
                  </div>
                </div>
                <div className="list-actions">
                  <Link className="btn btn-sm" to={`/quizzes?class=${c.id}`}>Quizzes/Exams</Link>
                  <Link className="btn btn-sm" to={`/quizzes/new?class=${c.id}`}>+ Quiz/Exam</Link>
                  <button className="btn btn-sm" onClick={() => {
                    setForm({ ...c, timer_value: timerValue(c.timer_seconds, c.timer_unit), apply_timer: false });
                    window.scrollTo(0, 0);
                  }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
