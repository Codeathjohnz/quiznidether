import { useState } from 'react';
import { api } from '../api';
import { TYPE_NAMES, plural } from '../utils';
import { Alert, useToast } from './ui';
import Mascot from './Mascot';
import Figure from './Figure';

function answerOf(q) {
  if (q.type === 'mcq') {
    return q.choices.map((c, i) => (c.correct ? `${String.fromCharCode(65 + i)}. ${c.text}` : null)).filter(Boolean).join(' / ');
  }
  if (q.type === 'tf') return q.tf_answer === 'true' ? 'True' : 'False';
  return q.accepted.join(' | ');
}

/** A Word picture is a data URL; an SVG drawing is text. */
function figureSrc(img) {
  if (!img || img.startsWith('unsupported:')) return '';
  return img.startsWith('data:') ? img : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img)}`;
}

/** Shows parsed questions (from an upload or the AI) and imports them into the quiz. */
export default function QuestionPreview({ preview, text, images = {}, quiz, existingCount, attemptCount, onImported, onClose, title, note }) {
  const toast = useToast();
  const [mode, setMode] = useState('append');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = preview.questions.length;
  const bad = preview.errors.length;

  const doImport = async () => {
    if (mode === 'replace' && existingCount > 0
      && !window.confirm(`Delete the ${existingCount} existing question(s) and replace them with these?`
        + (attemptCount ? `\n\n${attemptCount} student attempt(s) will be re-graded.` : ''))) return;
    setBusy(true);
    setError('');
    try {
      const r = await api('questions.import', { quiz_id: quiz.id, text, images, commit: true, mode });
      toast(`🎉 Added ${plural(r.imported, 'question')} to the quiz!`);
      onImported();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-preview">
      <div className="preview-head">
        <Mascot mood={bad ? 'think' : 'cheer'} size={84} />
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div className="chips">
            <span className="chip chip-ok">✅ {plural(ready, 'question')} ready</span>
            {bad > 0 && <span className="chip chip-danger">⚠ {plural(bad, 'problem')}</span>}
            <span className="chip">{preview.questions.reduce((s, q) => s + Number(q.points), 0)} pts total</span>
          </div>
          {note && <div className="muted small" style={{ marginTop: 4 }}>{note}</div>}
        </div>
      </div>

      {bad > 0 && (
        <div className="alert alert-danger" style={{ animation: 'none' }}>
          <b>These items will be skipped:</b>
          <ul className="issue-list">{preview.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}
      {preview.warnings.length > 0 && (
        <div className="alert alert-warning">
          <ul className="issue-list">
            {preview.warnings.map((w, i) => <li key={i}>{w.line ? `Line ${w.line}: ` : ''}{w.message}</li>)}
          </ul>
        </div>
      )}

      <ol className="preview-list">
        {preview.questions.map((q, i) => (
          <li key={i}>
            <div className="pv-top">
              <span className="chip">{TYPE_NAMES[q.type]}</span>
              <span className="chip">{q.points} pt{Number(q.points) === 1 ? '' : 's'}</span>
            </div>
            <div className="pv-q">{q.question}</div>
            {q.figure && <Figure small src={q.figure.startsWith('@') ? figureSrc(images[q.figure.slice(1)]) : q.figure} />}
            {q.type === 'mcq' && (
              <div className="pv-choices">
                {q.choices.map((c, j) => (
                  <span key={j} className={c.correct ? 'ok' : ''}>{String.fromCharCode(65 + j)}. {c.text}</span>
                ))}
              </div>
            )}
            <div className="pv-ans">✔ Answer: <b>{answerOf(q)}</b></div>
          </li>
        ))}
      </ol>

      <Alert>{error}</Alert>
      {ready > 0 && (
        <div className="import-actions">
          {existingCount > 0 ? (
            <div className="mode-pick">
              <label className="check"><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> Add to the {plural(existingCount, 'existing question')}</label>
              <label className="check"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace all existing questions</label>
            </div>
          ) : <span />}
          <button type="button" className="btn btn-success btn-lg" onClick={doImport} disabled={busy}>
            Add {plural(ready, 'question')} to quiz 🚀
          </button>
        </div>
      )}
    </div>
  );
}
