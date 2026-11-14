import { useEffect, useRef, useState } from 'react';

let loader = null;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => {
        loader = null;
        reject(new Error('Could not load Google sign-in. Check your internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return loader;
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

/**
 * Official "Sign in with Google" button (Google Identity Services).
 * Calls onCredential(idToken) after the teacher picks their Google account.
 */
export default function GoogleButton({ clientId, onCredential, text = 'continue_with' }) {
  const ref = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => cb.current(r.credential),
          ux_mode: 'popup',
          auto_select: false,
        });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline', size: 'large', shape: 'pill', text, logo_alignment: 'left',
          width: Math.min(380, Math.max(220, ref.current.offsetWidth || 320)),
        });
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [clientId, text]);

  if (!clientId) {
    return (
      <div className="google-wrap">
        <button type="button" className="google-off" disabled title="Google sign-in is not set up yet">
          <GoogleG /> Continue with Google
        </button>
        <p className="hint center">
          Google sign-in isn&apos;t set up yet. Add your Google Client ID in <code>includes/config.php</code>.
        </p>
      </div>
    );
  }
  return (
    <div className="google-wrap">
      <div ref={ref} className="google-btn" />
      {error && <p className="hint center">{error}</p>}
    </div>
  );
}
