import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Loading } from './ui';
import Logo from './Logo';
import Mascot from './Mascot';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ googleClientId: '' });
  const [counts, setCounts] = useState({ unseen: 0, live: 0 });

  useEffect(() => {
    api('auth.status')
      .then((r) => {
        if (!r.user) return navigate('/login', { replace: true });
        setConfig({ googleClientId: r.googleClientId });
        setUser(r.user);
      })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const refreshNav = useCallback(() => {
    api('nav').then(setCounts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshNav();
    const t = setInterval(refreshNav, 15000);
    return () => clearInterval(t);
  }, [user, refreshNav, location.pathname, location.search]);

  const logout = async () => {
    await api('auth.logout').catch(() => {});
    navigate('/login');
  };

  if (!user) return <Loading />;

  const isViolations = location.pathname === '/results' && new URLSearchParams(location.search).get('status') === 'terminated';
  const links = [
    { to: '/', label: 'Dashboard', icon: '▦', end: true },
    { to: '/classes', label: 'Classes', icon: '◫' },
    { to: '/quizzes', label: 'Quizzes & Exams', icon: '✎' },
    { to: '/results', label: 'Results', icon: '☰', badge: counts.live ? `${counts.live} live` : null, live: true, off: isViolations },
    { to: '/results?status=terminated', label: 'Violations', icon: '⚠', badge: counts.unseen || null, on: isViolations },
    { to: '/account', label: 'Account', icon: '⚙' },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <Logo size="sm" />
        </NavLink>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              end={l.end}
              className={({ isActive }) => {
                if (l.on !== undefined) return l.on ? 'active' : '';
                return isActive && !l.off ? 'active' : '';
              }}
            >
              <span className="nav-icon">{l.icon}</span>
              <span>{l.label}</span>
              {l.badge && <span className={`nav-badge ${l.live ? 'live' : ''}`}>{l.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-mascot">
          <Mascot mood={counts.unseen ? 'wow' : 'happy'} size={96} />
        </div>
        <div className="sidebar-foot">
          <NavLink to="/account" className="user-chip" title="Account settings">
            <Avatar user={user} size={38} />
            <span className="user-chip-text">
              <b>{user.name}</b>
              {user.email && <small>{user.email}</small>}
            </span>
          </NavLink>
          <button className="link-btn" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet context={{ user, setUser, refreshNav, config }} />
      </main>
    </div>
  );
}

export function Avatar({ user, size = 36 }) {
  const [broken, setBroken] = useState(false);
  if (user.avatar && !broken) {
    return (
      <img className="avatar" src={user.avatar} alt="" width={size} height={size} referrerPolicy="no-referrer"
        onError={() => setBroken(true)} />
    );
  }
  return (
    <span className="avatar avatar-letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {(user.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function PageHeader({ title, children }) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      {children && <div className="row-actions" style={{ marginTop: 0 }}>{children}</div>}
    </header>
  );
}
