import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Alert, Loading, useToast } from '../components/ui';
import Logo from '../components/Logo';
import Mascot from '../components/Mascot';
import GoogleButton from '../components/GoogleButton';
import { SkyBackground } from '../components/Fx';

const EMPTY = { name: '', email: '', password: '', confirm: '' };

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState('login'); // login | signup
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('auth.status')
      .then((r) => {
        if (r.user) return navigate('/', { replace: true });
        setStatus(r);
        if (!r.hasAccounts) setMode('signup');
      })
      .catch((e) => {
        setError(e.message);
        setStatus({ hasAccounts: true, allowSignup: false, googleClientId: '' });
      });
  }, [navigate]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const switchMode = (m) => {
    setMode(m);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(mode === 'login' ? 'auth.login' : 'auth.signup', form);
      toast(mode === 'login' ? `Welcome back, ${r.user.name}! 👋` : `Welcome, ${r.user.name}! 🎉`);
      navigate(mode === 'login' ? '/' : '/classes');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const google = async (credential) => {
    setBusy(true);
    setError('');
    try {
      const r = await api('auth.google', { credential });
      toast(r.created ? `Welcome, ${r.user.name}! 🎉` : `Welcome back, ${r.user.name}! 👋`);
      navigate(r.created ? '/classes' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <Loading />;
  const signup = mode === 'signup';
  const domains = status.allowedDomains ? status.allowedDomains.split(',').map((d) => '@' + d.trim()).join(', ') : '';

  return (
    <div className="auth-page">
      <SkyBackground />
      <div className="auth-inner">
        <div className="logo-wrap">
          <Logo size="lg" />
          <div><span className="logo-tag">Teacher&apos;s Corner</span></div>
        </div>
        <div className="mascot-perch"><Mascot mood={error ? 'wow' : signup ? 'cheer' : 'happy'} size={110} /></div>
        <div className="card auth-card">
          {status.allowSignup && status.hasAccounts && (
            <div className="auth-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={!signup} className={!signup ? 'active' : ''} onClick={() => switchMode('login')}>Log in</button>
              <button type="button" role="tab" aria-selected={signup} className={signup ? 'active' : ''} onClick={() => switchMode('signup')}>Sign up</button>
            </div>
          )}
          <h2>{signup ? (status.hasAccounts ? 'Create your teacher account' : 'Create the first teacher account') : 'Welcome back, teacher!'}</h2>
          {signup && <p className="muted center small">Use your Gmail with Google, or sign up with your email and a password.</p>}

          <Alert>{error}</Alert>
          <GoogleButton clientId={status.googleClientId} onCredential={google} text={signup ? 'signup_with' : 'continue_with'} />
          <div className="divider"><span>or use your email</span></div>

          <form onSubmit={submit}>
            {signup && (
              <label>Your name
                <input value={form.name} onChange={set('name')} required autoComplete="name" placeholder="e.g. Ma'am Dela Cruz" />
              </label>
            )}
            <label>Email
              <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" placeholder="you@gmail.com" />
              {signup && domains && <small className="muted">Allowed: {domains}</small>}
            </label>
            <label>Password
              <input type="password" value={form.password} onChange={set('password')} required
                autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 6 : undefined} />
            </label>
            {signup && (
              <label>Confirm password
                <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
              </label>
            )}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {signup ? 'Create account' : "Let's go!"}
            </button>
          </form>

          {status.allowSignup && status.hasAccounts && (
            <p className="center small" style={{ marginTop: 14, marginBottom: 0 }}>
              {signup ? 'Already have an account? ' : 'New teacher? '}
              <button type="button" className="link-btn" onClick={() => switchMode(signup ? 'login' : 'signup')}>
                {signup ? 'Log in' : 'Create an account'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
