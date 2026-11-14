import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import { Alert, useToast } from '../components/ui';
import GoogleButton from '../components/GoogleButton';
import { Avatar } from '../components/AdminLayout';

export default function Account() {
  const { user, setUser, config } = useOutletContext();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', new: '', confirm: '', current: '' });
  const [error, setError] = useState('');
  const [gError, setGError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api('auth.account', form);
      setUser(r.user);
      setForm({ name: r.user.name, email: r.user.email || '', new: '', confirm: '', current: '' });
      toast('Account updated. ✅');
    } catch (err) {
      setError(err.message);
    }
  };

  const link = async (credential) => {
    setGError('');
    try {
      const r = await api('auth.google', { credential });
      setUser(r.user);
      setForm((f) => ({ ...f, email: r.user.email || f.email }));
      toast('Google account linked! 🎉');
    } catch (err) {
      setGError(err.message);
    }
  };

  const unlink = async () => {
    if (!window.confirm('Unlink your Google account? You will need your email and password to log in.')) return;
    setGError('');
    try {
      const r = await api('auth.unlink_google');
      setUser(r.user);
      toast('Google account unlinked.');
    } catch (err) {
      setGError(err.message);
    }
  };

  return (
    <>
      <PageHeader title="Account" />
      <div className="grid-2">
        <form className="card" onSubmit={submit}>
          <h2>Profile &amp; password</h2>
          <Alert>{error}</Alert>
          <label>Your name<input value={form.name} onChange={set('name')} required /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} required placeholder="you@gmail.com" /></label>
          <hr />
          <label>
            {user.has_password ? 'New password' : 'Set a password'} <small className="muted">({user.has_password ? 'leave blank to keep current' : 'optional — lets you log in without Google'})</small>
            <input type="password" value={form.new} onChange={set('new')} autoComplete="new-password" />
          </label>
          <label>Confirm password<input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></label>
          {user.has_password && (
            <>
              <hr />
              <label>
                Current password <small className="muted">(required to save)</small>
                <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
              </label>
            </>
          )}
          <button className="btn btn-primary">Save changes</button>
        </form>

        <section className="card">
          <h2>Google sign-in</h2>
          <Alert>{gError}</Alert>
          {user.google_linked ? (
            <>
              <div className="linked-box">
                <Avatar user={user} size={44} />
                <div>
                  <b>Linked to Google ✅</b>
                  <div className="muted small">You can log in with “Continue with Google” using {user.email}.</div>
                </div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={unlink} disabled={!user.has_password}
                title={user.has_password ? '' : 'Set a password first'}>
                Unlink Google
              </button>
              {!user.has_password && <p className="hint" style={{ marginTop: 8 }}>Set a password first if you want to unlink Google.</p>}
            </>
          ) : (
            <>
              <p className="muted">Link your Gmail so you can log in with one click.</p>
              <GoogleButton clientId={config.googleClientId} onCredential={link} text="continue_with" />
            </>
          )}
        </section>
      </div>
    </>
  );
}
