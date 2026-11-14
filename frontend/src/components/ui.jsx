import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { RESULT_BADGE } from '../utils';

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const timer = useRef(null);
  const toast = useCallback((m) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2500);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- Small pieces ---------- */
export function Alert({ type = 'danger', children }) {
  if (!children) return null;
  return <div className={`alert alert-${type}`}>{children}</div>;
}

export function ResultBadge({ result }) {
  const [label, cls] = RESULT_BADGE[result] || [result, 'badge-muted'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Loading() {
  return (
    <div className="loading-screen">
      <BouncyLoader />
    </div>
  );
}

export function Modal({ open, children }) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-box">{children}</div>
    </div>
  );
}

export function BouncyLoader() {
  return (
    <div className="bouncy-loader" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Stat({ n, label, variant = '', icon }) {
  return (
    <div className={`stat ${variant}`}>
      {icon && <span className="stat-icon" aria-hidden="true">{icon}</span>}
      <div className="stat-n">{n}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

export function CopyButton({ text }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const done = () => {
    toast('Link copied — send it to your students.');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const copy = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      window.prompt('Copy this link:', text);
    }
    ta.remove();
  };
  return (
    <button type="button" className="btn btn-sm" onClick={copy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function ShareLinks({ links, compact = false }) {
  return (
    <>
      <div className="share-label">Student link</div>
      <div className="share-row">
        <input readOnly value={links.main} onFocus={(e) => e.target.select()} />
        <CopyButton text={links.main} />
      </div>
      {links.lan && !compact && (
        <>
          <div className="share-label">For students on other devices (same Wi-Fi / network)</div>
          <div className="share-row">
            <input readOnly value={links.lan} onFocus={(e) => e.target.select()} />
            <CopyButton text={links.lan} />
          </div>
        </>
      )}
    </>
  );
}
