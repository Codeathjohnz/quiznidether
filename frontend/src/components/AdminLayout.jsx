import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, trackVisit } from '../api';
import { Loading, Modal, useToast } from './ui';
import Logo from './Logo';
import Mascot from './Mascot';
import ReviewForm from './ReviewForm';
import Tour from './Tour';

function tourSteps(user, navigate) {
  const first = user.name.split(' ')[0];
  return [
    { title: `Hi ${first}! I'm Dethy! 👋`, mood: 'cheer',
      text: "Welcome to Quiz ni Dether! Let me show you around — it only takes a minute. Use Next, or the → arrow key." },
    { target: 'nav-dashboard', title: 'Dashboard', mood: 'happy',
      text: 'Your home base. See who is taking a quiz/exam right now, the latest violations, and recent scores.' },
    { target: 'nav-classes', title: 'Step 1: Classes 🏫', mood: 'think',
      text: 'Start here! Make a class (like "BSIT 1-A") and give it a default timer in seconds, minutes or hours.' },
    { target: 'nav-quizzes', title: 'Step 2: Quizzes & Exams 📝',
      text: 'Create a quiz/exam inside a class. Choose the passing score (automatic or your own), and a timer for the whole quiz or per question.' },
    { target: 'nav-quizzes', title: 'Add questions fast ⚡', mood: 'wow',
      text: 'Type questions one by one, or click "📥 Import TQ" to upload a whole questionnaire with its answer key. Then copy the student link and send it to your class!' },
    { target: 'nav-results', title: 'Step 3: Results 🎯',
      text: 'Scores appear here as students submit. Watch students live, open each attempt, and export everything to Excel (CSV).' },
    { target: 'nav-violations', title: 'Violations 🚨', mood: 'wow',
      text: 'The quiz/exam runs in full screen. If a student leaves it, opens a new tab or closes the browser, it ends right away — and the reason shows up here.' },
    { target: 'nav-feedback', title: 'Review & Suggestions 💬', mood: 'happy',
      text: 'Tell us what you think! Leave a rating and a comment — and a suggestion if you have one. It helps us make the system better.' },
    ...(user.is_developer ? [{ target: 'nav-developer', title: 'Developer 🛠️', mood: 'cheer',
      text: 'Only you can see this: visits, all teacher accounts, and every review and suggestion.' }] : []),
    { target: 'user-chip', title: 'Your account ⚙️',
      text: 'Change your name, email or password, or link your Google account so you can sign in with Gmail.' },
    { target: 'guide-btn', title: 'Need me again?', mood: 'happy',
      text: 'Click "Guide" anytime and I will show you around again. Have fun teaching! 🎉' },
    { title: "Let's make your first class!", mood: 'cheer',
      text: 'Everything starts with a class. Ready?',
      action: { label: 'Create a class', run: () => navigate('/classes') } },
  ];
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ googleClientId: '' });
  const [counts, setCounts] = useState({ unseen: 0, live: 0 });
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const [touring, setTouring] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // phone menu drawer

  // Close the phone menu after choosing a page.
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    api('auth.status')
      .then((r) => {
        if (!r.user) return navigate('/login', { replace: true });
        setConfig({ googleClientId: r.googleClientId });
        setUser(r.user);
        setReviewNeeded(!!r.reviewNeeded);
        if (!r.user.tour_done) setTouring(true);
        trackVisit('teacher');
      })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const refreshNav = useCallback(() => {
    api('nav')
      .then((r) => {
        setCounts(r);
        setReviewNeeded(!!r.reviewNeeded);
      })
      .catch(() => {});
  }, []);

  const steps = useMemo(() => (user ? tourSteps(user, navigate) : []), [user, navigate]);

  const startTour = () => {
    if (location.pathname !== '/') navigate('/');
    setTouring(true);
  };
  const endTour = () => {
    setTouring(false);
    if (!user.tour_done) {
      setUser({ ...user, tour_done: true });
      api('auth.tour_done').catch(() => {});
    }
  };

  const sendReview = async (v) => {
    await api('review.save', v);
    setReviewNeeded(false);
    toast('Thank you for your review! 💜');
  };

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
    { to: '/', label: 'Dashboard', icon: '▦', end: true, tour: 'nav-dashboard' },
    { to: '/classes', label: 'Classes', icon: '◫', tour: 'nav-classes' },
    { to: '/quizzes', label: 'Quizzes & Exams', icon: '✎', tour: 'nav-quizzes' },
    { to: '/results', label: 'Results', icon: '☰', badge: counts.live ? `${counts.live} live` : null, live: true, off: isViolations, tour: 'nav-results' },
    { to: '/results?status=terminated', label: 'Violations', icon: '⚠', badge: counts.unseen || null, on: isViolations, tour: 'nav-violations' },
    { to: '/feedback', label: 'Review & Suggest', icon: '★', tour: 'nav-feedback' },
    ...(user.is_developer ? [{ to: '/developer', label: 'Developer', icon: '⚒', badge: counts.newReviews || null, tour: 'nav-developer' }] : []),
    { to: '/account', label: 'Account', icon: '⚙' },
  ];

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen || touring ? 'menu-open' : ''}`}>
        <div className="sidebar-top">
          <NavLink className="brand" to="/">
            <Logo size="sm" />
          </NavLink>
          <button type="button" className="menu-btn" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? '✕' : '☰'}
            {!menuOpen && (counts.unseen > 0 || counts.newReviews > 0) && <span className="menu-dot" />}
          </button>
        </div>
        <div className="sidebar-body">
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              end={l.end}
              data-tour={l.tour}
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
          <NavLink to="/account" className="user-chip" title="Account settings" data-tour="user-chip">
            <Avatar user={user} size={38} />
            <span className="user-chip-text">
              <b>{user.name}</b>
              {user.email && <small>{user.email}</small>}
            </span>
          </NavLink>
          <div className="foot-links">
            <button className="link-btn" onClick={startTour} data-tour="guide-btn">❓ Guide</button>
            <button className="link-btn" onClick={logout}>Log out</button>
          </div>
        </div>
        </div>
      </aside>
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
      <main className="main">
        <Outlet context={{ user, setUser, refreshNav, config, setReviewNeeded }} />
      </main>

      {touring && <Tour steps={steps} onClose={endTour} />}

      {/* Every teacher leaves one review (after making their first quiz/exam). */}
      <Modal open={reviewNeeded && !touring && location.pathname !== '/feedback'}>
        <div className="review-modal">
          <Mascot mood="happy" size={96} />
          <h2>Quick review, please! ⭐</h2>
          <p className="muted">
            You made your first quiz/exam — awesome! Before you continue, please rate Quiz ni Dether and leave a short comment.
            Add a suggestion if you have one. It takes 30 seconds and helps us improve the system.
          </p>
          <ReviewForm onSubmit={sendReview} />
        </div>
      </Modal>
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
