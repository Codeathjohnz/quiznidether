import { useState } from 'react';
import { Alert } from './ui';

const STAR_WORDS = ['', 'Needs a lot of work', 'Could be better', "It's okay", 'I like it!', 'I love it!'];

export function StarPicker({ value, onChange, size = 'lg' }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className={`star-picker star-picker-${size}`} role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= shown ? 'on' : ''}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
      <span className="star-word">{STAR_WORDS[shown] || 'Tap a star'}</span>
    </div>
  );
}

export function Stars({ n }) {
  return (
    <span className="stars-static" aria-label={`${n} out of 5 stars`}>
      {'★★★★★'.slice(0, n)}<span className="off">{'★★★★★'.slice(n)}</span>
    </span>
  );
}

/**
 * Rating (required) + comment (required) + suggestion (optional).
 * onSubmit receives { rating, comment, suggestion } and should throw on error.
 */
export default function ReviewForm({ initial, onSubmit, submitLabel = 'Send review', who = 'teacher', extra }) {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [comment, setComment] = useState(initial?.comment || '');
  const [suggestion, setSuggestion] = useState(initial?.suggestion || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Please choose 1 to 5 stars.');
    if (comment.trim().length < 3) return setError('Please write a short comment.');
    setError('');
    setBusy(true);
    try {
      await onSubmit({ rating, comment: comment.trim(), suggestion: suggestion.trim() });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="review-form" onSubmit={submit}>
      <Alert>{error}</Alert>
      <div className="label">How do you like Quiz ni Dether? <span className="req">*</span></div>
      <StarPicker value={rating} onChange={setRating} />
      <label>
        Your comment <span className="req">*</span>
        <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={who === 'student' ? 'What was it like taking the quiz/exam here?' : 'What do you like or dislike about the system?'} />
      </label>
      <label>
        Suggestion <span className="muted small">(optional — only if you have one)</span>
        <textarea rows={2} maxLength={2000} value={suggestion} onChange={(e) => setSuggestion(e.target.value)}
          placeholder="A feature you want, something to fix or improve…" />
      </label>
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : submitLabel}</button>
        {extra}
      </div>
    </form>
  );
}
