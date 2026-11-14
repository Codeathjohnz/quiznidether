import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Mascot from './Mascot';

const GAP = 14;
const PAD = 6;

/**
 * Guided tour: Dethy points at one part of the screen per step and explains it in a speech balloon.
 * steps: [{ target?: 'data-tour value', title, text, mood?, action?: { label, run } }]
 */
export default function Tour({ steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const bubble = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const findTarget = useCallback(() => {
    if (!step.target) return null;
    const els = [...document.querySelectorAll(`[data-tour="${step.target}"]`)];
    return els.find((el) => el.getClientRects().length > 0) || null;
  }, [step.target]);

  // Measure the highlighted element (and keep measuring on scroll / resize).
  useLayoutEffect(() => {
    const el = findTarget();
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const measure = () => {
      const t = findTarget();
      setRect(t ? t.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [findTarget]);

  // Place the balloon beside the target: right, below, above — whichever fits.
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const clampX = (x) => Math.max(10, Math.min(x, vw - bw - 10));
    const clampY = (y) => Math.max(10, Math.min(y, vh - bh - 10));
    if (!rect) return setPos({ left: (vw - bw) / 2, top: Math.max(10, (vh - bh) / 2), side: 'none' });
    if (rect.right + GAP + bw <= vw - 10) {
      const top = clampY(rect.top + rect.height / 2 - bh / 2);
      return setPos({ left: rect.right + GAP + PAD, top, side: 'left', tail: rect.top + rect.height / 2 - top });
    }
    if (rect.bottom + GAP + bh <= vh - 10) {
      const left = clampX(rect.left + rect.width / 2 - bw / 2);
      return setPos({ left, top: rect.bottom + GAP + PAD, side: 'top', tail: rect.left + rect.width / 2 - left });
    }
    const left = clampX(rect.left + rect.width / 2 - bw / 2);
    setPos({ left, top: clampY(rect.top - GAP - PAD - bh), side: 'bottom', tail: rect.left + rect.width / 2 - left });
  }, [rect, i]);

  const next = useCallback(() => (last ? onClose(true) : setI((n) => n + 1)), [last, onClose]);
  const back = () => setI((n) => Math.max(0, n - 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, onClose]);

  const tailStyle = pos?.tail !== undefined
    ? (pos.side === 'left' ? { top: Math.max(24, Math.min(pos.tail, (bubble.current?.offsetHeight || 0) - 24)) }
      : { left: Math.max(24, Math.min(pos.tail, (bubble.current?.offsetWidth || 0) - 24)) })
    : undefined;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Quick guide">
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={bubble}
        key={i}
        className={`tour-bubble side-${pos?.side || 'none'}`}
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      >
        <div className="tour-mascot"><Mascot mood={step.mood || 'happy'} size={86} /></div>
        <div className="tour-balloon">
          {pos?.side !== 'none' && <span className={`tour-tail tail-${pos?.side}`} style={tailStyle} />}
          <div className="tour-step">Step {i + 1} of {steps.length}</div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <div className="tour-dots" aria-hidden="true">
            {steps.map((_, n) => <i key={n} className={n === i ? 'now' : n < i ? 'done' : ''} />)}
          </div>
          <div className="tour-actions">
            {!last && <button type="button" className="link-btn" onClick={() => onClose(false)}>Skip guide</button>}
            <span className="spacer" />
            {i > 0 && <button type="button" className="btn btn-sm" onClick={back}>Back</button>}
            {step.action ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { onClose(true); step.action.run(); }}>{step.action.label}</button>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={next} autoFocus>{last ? "Let's go!" : 'Next ›'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
