import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, beacon, figureUrl, trackVisit } from '../api';
import ReviewForm from '../components/ReviewForm';
import Figure from '../components/Figure';
import { Alert, BouncyLoader, Modal, useToast } from '../components/ui';
import Logo from '../components/Logo';
import Mascot from '../components/Mascot';
import { Confetti, SkyBackground, StarRow } from '../components/Fx';
import { isMuted, setMuted, sfx } from '../sound';
import { fmtClock, plural } from '../utils';

/* ---------- full screen helpers ---------- */
const docEl = document.documentElement;
const fsSupported = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requestFs() {
  try {
    const r = docEl.requestFullscreen ? docEl.requestFullscreen({ navigationUI: 'hide' }) : docEl.webkitRequestFullscreen();
    return Promise.resolve(r).then(() => sleep(250));
  } catch (e) {
    return Promise.reject(e);
  }
}
function exitFs() {
  try {
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } catch { /* ignore */ }
}

// When several events fire together (e.g. blur + hidden), report the most specific one.
const PRIORITY = ['page_unload', 'second_screen', 'tab_hidden', 'fullscreen_exit', 'window_resized', 'window_blur'];

/* ---------- one screen only ---------- */
// Chrome / Edge tell a page when the computer uses more than one monitor (Firefox / Safari: unknown = allowed).
const hasSecondScreen = () => window.screen && window.screen.isExtended === true;
// Mouse-and-keyboard devices only: phones rotate and resize, so the size check would cause false alarms.
const finePointer = () => window.matchMedia && window.matchMedia('(pointer: fine)').matches;
// The full-screen window must really cover the screen (not snapped / split next to another window).
const windowTooSmall = () => {
  const sw = window.screen.width;
  const sh = window.screen.height;
  return !!sw && !!sh && (window.outerWidth < sw * 0.85 || window.outerHeight < sh * 0.85);
};
const SECOND_SCREEN_MSG = 'A second monitor is connected. Unplug it (or set Windows to show only one screen: press Windows key + P → "PC screen only"), then try again.';
const BLOCKED_KEYS = ['r', 'p', 's', 'u', 'c', 'x', 'v', 'a', 'f', 'g'];

function Message({ mood, title, children, className = '', confetti = false }) {
  return (
    <div className={`student-root ${className}`}>
      <SkyBackground />
      {confetti && <Confetti />}
      <div className="center-screen">
        <div className="logo-wrap"><Logo size="md" /></div>
        <div className="mascot-perch"><Mascot mood={mood} size={130} /></div>
        <div className="card message-card">
          <h1>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Rating + comment (+ optional suggestion) about the system, shown after finishing. */
function StudentReview({ token }) {
  const [sent, setSent] = useState(false);
  if (!token) return null;
  if (sent) return <div className="alert alert-success">Thanks for your feedback! 💜</div>;
  return (
    <div className="student-review">
      <h3>Rate Quiz ni Dether ⭐</h3>
      <p className="muted small">Tell us how it was to take your quiz/exam here (not about your score).</p>
      <ReviewForm who="student" submitLabel="Send feedback"
        onSubmit={async (v) => { await api('take.review', { token, ...v }); setSent(true); }} />
    </div>
  );
}

/** Shown while the device has no internet: the quiz goes on, answers are sent later. */
function NetBanner({ net, pending, waiting }) {
  if (net !== 'offline' && !waiting) return null;
  return (
    <div className="net-banner" role="status">
      <b>📴 No internet connection</b>
      <span>
        {waiting
          ? 'Your answer is locked in and safe. It will be sent automatically, then the next question appears.'
          : 'Keep answering! Your answers stay on this page and are sent automatically when the connection is back.'}
        {pending > 0 && ` (${pending} waiting to send)`} <b>Do not close or reload this page.</b>
      </span>
    </div>
  );
}

/** After the quiz: internet problems are no longer an excuse. */
function OfflineReminder() {
  return (
    <div className="offline-reminder">
      📶 <b>Reminder:</b> this quiz system keeps working even when the internet drops — your answers are kept on your
      device and sent once you are back online. <b>Losing your internet connection is no longer a valid excuse</b> for
      missing or incomplete answers. Just keep the quiz page open until it says your answers were sent.
    </div>
  );
}

function starsFor(r) {
  const pct = Number(r.percentage);
  if (pct >= 90) return 3;
  if (r.passed) return 2;
  return pct >= 50 ? 1 : 0;
}

export default function TakeQuiz() {
  const { code } = useParams();
  const storeKey = `qnd_attempt_${code}`;
  const toast = useToast();

  const [view, setView] = useState('loading'); // loading | error | landing | quiz | done | terminated | blocked
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ full_name: '', section: '', agree: false });
  const [formError, setFormError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(0);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [doneNote, setDoneNote] = useState('');
  const [termText, setTermText] = useState('');
  const [blocked, setBlocked] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  // Per-question mode: the one question on screen.
  const [pq, setPq] = useState(null); // { index, count, question, later, answer }
  const [pqSending, setPqSending] = useState(false);
  // Internet: 'online' | 'offline'. While offline the quiz goes on; answers wait on this page and are sent later.
  const [net, setNet] = useState('online');
  const [pending, setPending] = useState(0);
  const [pqWait, setPqWait] = useState(false);

  // Mutable proctoring state (read by browser event listeners, so kept outside React state).
  const st = useRef({
    token: null, monitoring: false, ended: false, deadline: 0, fsRequired: true, warned: false, lastTick: null,
    events: [], vTimer: null, answers: {}, total: 0, timerId: null, hbId: null,
    mode: 'whole', pqIndex: 0, pqQid: null, pqAnswer: '', pqSending: false,
    // offline handling
    dirty: {}, flushTimer: null, flushing: false, lastFlush: 0, lastProbe: 0,
    offSince: null, offN: 0, offS: 0, waiting: false, wake: null,
  });
  const reasons = useRef({});
  const fn = useRef({});

  /* ---------- core logic ---------- */
  const secondsLeft = () => Math.max(0, Math.round((st.current.deadline - Date.now()) / 1000));
  const answeredCount = () => Object.values(st.current.answers).filter((v) => String(v).trim() !== '').length;

  function stopAll() {
    const s = st.current;
    s.ended = true;
    s.monitoring = false;
    clearInterval(s.timerId);
    clearInterval(s.hbId);
    clearTimeout(s.vTimer);
    clearTimeout(s.flushTimer);
    setSubmitOpen(false);
  }

  /* ---------- internet loss: keep going, send later ---------- */
  /** How often / how long this device was offline (sent with every request, shown to the teacher). */
  function offStats() {
    const s = st.current;
    const now = s.offSince ? (Date.now() - s.offSince) / 1000 : 0;
    return { off_n: s.offN, off_s: Math.round(s.offS + now) };
  }
  function markOffline() {
    const s = st.current;
    if (s.offSince) return;
    s.offSince = Date.now();
    s.offN += 1;
    setNet('offline');
  }
  function markOnline() {
    const s = st.current;
    if (!s.offSince) return;
    s.offS += (Date.now() - s.offSince) / 1000;
    s.offSince = null;
    setNet('online');
    if (!s.ended) toast('✅ Back online! Your answers are being sent.');
  }
  /** API call that notices a lost connection (no status = the request never reached the server). */
  async function call(action, data) {
    try {
      const r = await api(action, { ...data, ...offStats() });
      markOnline();
      return r;
    } catch (e) {
      if (!e.status) markOffline();
      throw e;
    }
  }
  /** Waits a few seconds, or less if the browser says the internet is back. */
  function waitForNet(ms = 4000) {
    return new Promise((resolve) => {
      const s = st.current;
      const done = () => { clearTimeout(t); s.wake = null; resolve(); };
      const t = setTimeout(done, ms);
      s.wake = done;
    });
  }
  /** Sends every answer that the server does not have yet, all in one request. */
  async function flush() {
    const s = st.current;
    if (s.ended || s.flushing || s.mode !== 'whole') return;
    const qids = Object.keys(s.dirty);
    if (!qids.length) return;
    s.flushing = true;
    s.lastFlush = Date.now();
    const batch = {};
    qids.forEach((q) => { batch[q] = s.answers[q] ?? ''; });
    try {
      const r = await call('take.save', { token: s.token, answers: batch });
      qids.forEach((q) => { if (s.answers[q] === batch[q]) delete s.dirty[q]; });
      handleServerState(r);
    } catch (e) {
      if (e.status && e.status < 500) qids.forEach((q) => delete s.dirty[q]); // refused (e.g. time up): the final submit sends them
    } finally {
      s.flushing = false;
      setPending(Object.keys(s.dirty).length);
    }
  }

  function showTerminated(reasonCode, text) {
    setTermText(text || reasons.current[reasonCode] || 'The quiz rules were broken.');
    setView('terminated');
    sfx.buzz();
  }

  function showDone(r) {
    setResult(r);
    setView('done');
    if (r && r.show_result && r.score !== undefined) (r.passed ? sfx.win : sfx.lose)();
    else sfx.okay();
  }

  function handleServerState(r) {
    const s = st.current;
    if (!r || s.ended) return;
    if (r.status === 'terminated') {
      stopAll();
      exitFs();
      showTerminated(r.reason, r.reason_text);
    } else if (r.status === 'submitted') {
      stopAll();
      exitFs();
      showDone(r);
    } else if (s.mode === 'per_question') {
      if (r.question && r.index !== s.pqIndex) applyPq(r);                    // server moved on (time ran out)
      else if (typeof r.question_seconds_left === 'number') s.deadline = Date.now() + r.question_seconds_left * 1000;
    } else if (typeof r.seconds_left === 'number') {
      s.deadline = Date.now() + r.seconds_left * 1000;
    }
  }

  /** Shows a question sent by the server (per-question mode) and starts its countdown. */
  function applyPq(r) {
    const s = st.current;
    s.pqIndex = r.index;
    s.pqQid = r.question.id;
    s.pqAnswer = '';
    s.deadline = Date.now() + r.question_seconds_left * 1000;
    s.lastTick = null;
    setPq({ index: r.index, count: r.count, question: r.question, later: r.total_seconds_left - r.question_seconds_left, answer: '' });
    setLeft(r.question_seconds_left);
    window.scrollTo(0, 0);
  }

  function setPqAnswer(value, isClick) {
    const s = st.current;
    if (s.ended || s.pqSending) return;
    if (isClick) sfx.pop();
    s.pqAnswer = value;
    setPq((p) => (p ? { ...p, answer: value } : p));
  }

  /** Sends the current answer (or nothing) and loads the next question. No going back. */
  async function nextQuestion(timedOut) {
    const s = st.current;
    if (s.ended || s.pqSending) return;
    s.pqSending = true;
    setPqSending(true);
    const qid = s.pqQid;
    const answer = s.pqAnswer;
    if (String(answer).trim() !== '') s.answers = { ...s.answers, [qid]: answer };
    if (timedOut) toast(String(answer).trim() ? "⏰ Time's up! Your answer is locked in." : "⏰ Time's up! Moving to the next question.");
    let res = null;
    let fails = 0;
    // No internet: the answer stays locked in on this page and is sent as soon as the connection is back.
    // The next question waits on the server, so its time does not run while offline.
    while (!res && !s.ended) {
      try {
        res = await call('take.next', { token: s.token, question_id: qid, answer });
      } catch (e) {
        if (e.status && e.status < 500 && ++fails >= 3) break;
        if (!e.status) { s.waiting = true; setPqWait(true); }
        await waitForNet(e.status ? 1500 : 4000);
      }
    }
    s.waiting = false;
    setPqWait(false);
    s.pqSending = false;
    setPqSending(false);
    if (!res) {
      if (s.ended) return;
      toast('Something went wrong… trying again.');
      s.deadline = Date.now() + 3000; // try again in a few seconds
      heartbeat();
      return;
    }
    if (res.done || res.status !== 'in_progress') {
      stopAll();
      exitFs();
      if (res.status === 'terminated') showTerminated(res.reason, res.reason_text);
      else showDone(res);
      return;
    }
    applyPq(res);
  }

  function terminate() {
    const s = st.current;
    if (s.ended) return;
    const codes = s.events.map((e) => e.code);
    const main = PRIORITY.find((p) => codes.includes(p)) || codes[0] || 'page_unload';
    const detail = `Detected: ${s.events.map((e) => `${e.code.replace('_', ' ')} at ${e.at}`).join(', ')}`
      + ` | Time left: ${fmtClock(secondsLeft())} | Answered: ${answeredCount()}/${s.total}`;
    stopAll();
    beacon('take.terminate', { token: s.token, reason: main, detail, ...offStats() });
    exitFs();
    showTerminated(main);
    if (main !== 'page_unload') confirmTermination(main, detail);
  }

  /** Makes sure the server hears about the termination, even if the internet was down at that moment. */
  async function confirmTermination(reason, detail) {
    const s = st.current;
    for (let i = 0; i < 400; i++) {
      try {
        await call('take.terminate', { token: s.token, reason, detail });
        return;
      } catch (e) {
        if (e.status && e.status < 500) return;
        await waitForNet(5000);
      }
    }
  }

  function violation(code) {
    const s = st.current;
    if (!s.monitoring || s.ended) return;
    s.events.push({ code, at: new Date().toLocaleTimeString() });
    if (code === 'page_unload') {
      terminate();
      return;
    }
    if (!s.vTimer) s.vTimer = setTimeout(() => fn.current.terminate(), 300);
  }

  function tick() {
    const s = st.current;
    if (s.monitoring && !s.ended) {
      if (hasSecondScreen()) fn.current.violation('second_screen');
      // A few seconds in a row, so a short resize while entering full screen is not counted.
      s.smallTicks = s.fsRequired && fsElement() && finePointer() && windowTooSmall() ? (s.smallTicks || 0) + 1 : 0;
      if (s.smallTicks >= 6) fn.current.violation('window_resized');
    }
    const l = secondsLeft();
    setLeft(l);
    if (!s.ended) {
      const now = Date.now();
      // Unsent answers: try again every few seconds.
      if (Object.keys(s.dirty).length && !s.flushing && now - s.lastFlush > (s.offSince ? 4000 : 1500)) flush();
      // Offline: check for the connection more often than the normal heartbeat.
      else if (s.offSince && now - s.lastProbe > 5000) fn.current.heartbeat();
    }
    if (s.mode === 'per_question') {
      if (l <= 5 && l > 0 && s.lastTick !== l) {
        s.lastTick = l;
        sfx.tick();
      }
      if (l <= 0 && !s.ended && !s.pqSending) fn.current.nextQuestion(true);
      return;
    }
    if (l <= 60 && !s.warned) {
      s.warned = true;
      toast('⏰ 1 minute left! Hurry up!');
    }
    if (l <= 10 && l > 0 && s.lastTick !== l) {
      s.lastTick = l;
      sfx.tick();
    }
    if (l <= 0 && !s.ended) fn.current.submit(true);
  }

  function heartbeat() {
    const s = st.current;
    // While an answer is on its way (per-question mode) that request is the contact with the server.
    if (s.ended || s.pqSending || s.waiting) return;
    s.lastProbe = Date.now();
    call('take.heartbeat', { token: s.token, index: s.pqIndex }).then(handleServerState).catch(() => {});
  }

  function onAnswer(qid, value, debounce) {
    const s = st.current;
    if (s.ended) return;
    if (!debounce) sfx.pop();
    s.answers = { ...s.answers, [qid]: value };
    setAnswers(s.answers);
    s.dirty[qid] = true;
    setPending(Object.keys(s.dirty).length);
    clearTimeout(s.flushTimer);
    s.flushTimer = setTimeout(() => fn.current.flush(), debounce ? 700 : 0);
  }

  async function submit(auto) {
    const s = st.current;
    if (s.ended) return;
    stopAll();
    const sending = auto ? "Time's up! Sending your answers…" : 'Sending your answers…';
    setBusy(sending);
    let res = null;
    let fails = 0;
    // Answers are locked now. Without internet they wait on this page and are sent when it comes back.
    s.waiting = true;
    while (!res) {
      try {
        res = await call('take.submit', {
          token: s.token, auto: auto ? '1' : '0', answers: s.answers, offline: s.offN > 0 ? '1' : '0',
        });
      } catch (e) {
        if (e.status && e.status < 500 && ++fails >= 3) break;
        if (!e.status) {
          setBusy('📴 No internet. Your answers are locked in and safe on this page. They will be sent automatically when the connection is back. Do NOT close or reload this page.');
        }
        await waitForNet(e.status ? 2000 : 4000);
        if (!e.status) setBusy(sending);
      }
    }
    s.waiting = false;
    setBusy('');
    exitFs();
    if (res && res.status === 'terminated') {
      showTerminated(res.reason, res.reason_text);
      return;
    }
    if (!res) setDoneNote('Your answers were saved as you went, but the final submission could not reach the server. Please inform your teacher.');
    else if (auto) setDoneNote("Time's up — your answers were submitted automatically.");
    showDone(res);
  }

  fn.current = { violation, terminate, submit, tick, heartbeat, nextQuestion, flush, markOffline };

  /* ---------- load quiz info + check this device's previous attempt ---------- */
  useEffect(() => {
    let cancelled = false;
    api('take.info', { code })
      .then(async (r) => {
        if (cancelled) return;
        trackVisit('student', `/take/${code}`);
        setInfo(r.quiz);
        reasons.current = r.reasons;
        let prior = null;
        try { prior = localStorage.getItem(storeKey); } catch { /* ignore */ }
        if (!prior) return setView('landing');
        try {
          let s = await api('take.status', { token: prior });
          if (s.status === 'in_progress') {
            // Student left the running quiz and came back: that is a violation.
            s = await api('take.terminate', {
              token: prior, reason: 'reopened',
              detail: 'The quiz link was opened again on the same device while the attempt was still running.',
            });
          }
          if (!cancelled) { setBlocked(s); setView('blocked'); }
        } catch {
          try { localStorage.removeItem(storeKey); } catch { /* ignore */ }
          if (!cancelled) setView('landing');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e.message);
        setView('error');
      });
    return () => { cancelled = true; };
  }, [code, storeKey]);

  /* ---------- proctoring listeners (registered once) ---------- */
  useEffect(() => {
    const v = (c) => () => fn.current.violation(c);
    const onFs = () => { if (st.current.fsRequired && !fsElement()) fn.current.violation('fullscreen_exit'); };
    const onVis = () => { if (document.hidden) fn.current.violation('tab_hidden'); };
    const onBlur = v('window_blur');
    const onUnload = v('page_unload');
    const onKey = (e) => {
      if (!st.current.monitoring) return;
      const k = (e.key || '').toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === 'f5' || k === 'f12' || (ctrl && BLOCKED_KEYS.includes(k)) || (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k))) {
        e.preventDefault();
        toast('🚫 That shortcut is disabled during the quiz.');
      }
    };
    const block = (e) => { if (st.current.monitoring) e.preventDefault(); };
    const blockEvents = ['contextmenu', 'copy', 'cut', 'paste', 'dragstart'];
    // Internet lost / back: retry at once instead of waiting for the next try.
    const onOffline = () => { if (st.current.token && !st.current.ended) fn.current.markOffline(); };
    const onOnline = () => {
      const s = st.current;
      if (s.wake) s.wake();
      if (s.token && !s.ended) { s.lastFlush = 0; fn.current.flush(); fn.current.heartbeat(); }
    };
    // Answers still waiting to be sent: ask before the page is closed (they would be lost).
    const onLeave = (e) => {
      const s = st.current;
      if (s.token && (s.waiting || Object.keys(s.dirty).length)) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onLeave);

    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('keydown', onKey);
    blockEvents.forEach((ev) => document.addEventListener(ev, block));
    const s = st.current;
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('keydown', onKey);
      blockEvents.forEach((ev) => document.removeEventListener(ev, block));
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onLeave);
      clearInterval(s.timerId);
      clearInterval(s.hbId);
    };
  }, [toast]);

  /* ---------- landing actions ---------- */
  const proceed = (e) => {
    e.preventDefault();
    const name = form.full_name.trim().replace(/\s+/g, ' ');
    let err = '';
    if (name.length < 3 || !name.includes(' ')) err = 'Please enter your FULL name (first and last name).';
    else if (!form.section.trim()) err = 'Please enter your section.';
    else if (!form.agree) err = 'Please confirm that you have read the instructions and rules.';
    else if (hasSecondScreen()) err = SECOND_SCREEN_MSG;
    setFormError(err);
    if (err) return;
    sfx.click();
    setStartError('');
    setConfirmOpen(true);
  };

  const startQuiz = async () => {
    if (hasSecondScreen()) {
      setStartError(SECOND_SCREEN_MSG);
      return;
    }
    setStarting(true);
    setStartError('');
    if (fsSupported) {
      let ok = false;
      try {
        await requestFs(); // must run first, inside the click
        ok = !!fsElement();
      } catch { ok = false; }
      if (!ok) {
        setStartError('Full screen is required. Click the button again and allow full screen.');
        setStarting(false);
        return;
      }
    }
    const s = st.current;
    s.fsRequired = fsSupported;
    let res;
    try {
      res = await api('take.start', {
        code, full_name: form.full_name.trim(), section: form.section.trim(), fs: fsSupported ? '1' : '0',
      });
    } catch (err) {
      exitFs();
      setStartError(err.message);
      setStarting(false);
      return;
    }
    sfx.start();
    s.token = res.token;
    try { localStorage.setItem(storeKey, res.token); } catch { /* ignore */ }
    s.answers = {};
    s.mode = res.mode === 'per_question' ? 'per_question' : 'whole';
    if (s.mode === 'per_question') {
      s.total = res.count;
      applyPq(res);
    } else {
      s.deadline = Date.now() + res.seconds_left * 1000;
      s.total = res.questions.length;
      setLeft(res.seconds_left);
      // Load every figure now, so the pictures are already here if the internet drops later.
      res.questions.forEach((q) => { if (q.figure) new Image().src = figureUrl(q.figure); });
    }
    setSession(res);
    setAnswers({});
    setConfirmOpen(false);
    setView('quiz');
    window.scrollTo(0, 0);
    s.timerId = setInterval(() => fn.current.tick(), 500);
    s.hbId = setInterval(() => fn.current.heartbeat(), 10000);
    setTimeout(() => {
      if (s.ended) return;
      s.monitoring = true;
      if (s.fsRequired && !fsElement()) fn.current.violation('fullscreen_exit');
      else if (document.hidden) fn.current.violation('tab_hidden');
    }, 1200);
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  /* ---------- render ---------- */
  if (view === 'loading') {
    return (
      <div className="student-root">
        <SkyBackground />
        <div className="center-screen"><BouncyLoader /></div>
      </div>
    );
  }

  if (view === 'error') {
    return <Message mood="think" title="Hmm… quiz not found"><p className="muted">{loadError}</p></Message>;
  }
  if (view === 'landing' && !info.is_open) {
    return (
      <Message mood="think" title="Not open yet!">
        <p><b>{info.title}</b> is currently <b>closed</b>.</p>
        <p className="muted">Please wait for your teacher to open it, then refresh this page.</p>
      </Message>
    );
  }
  if (view === 'landing' && !info.question_count) {
    return <Message mood="think" title="No questions yet"><p className="muted"><b>{info.title}</b> has no questions yet. Please check back later.</p></Message>;
  }

  if (view === 'done') {
    const scored = result && result.show_result && result.score !== undefined;
    const stars = scored ? starsFor(result) : 0;
    const passed = scored ? result.passed : true;
    return (
      <Message mood={passed ? 'cheer' : 'happy'} title={!scored ? 'All done!' : stars === 3 ? 'Amazing!' : passed ? 'Great job!' : 'Nice try!'}
        confetti={passed}>
        <p className="muted">{doneNote || 'Your answers have been recorded. 🎉'}</p>
        {scored && (
          <div className={`result ${passed ? 'result-pass' : 'result-fail'}`}>
            <StarRow count={stars} />
            <div className="result-pct">{result.percentage}%</div>
            <div className="result-score">{result.score} / {result.total} points</div>
            <div className={`badge ${passed ? 'badge-success' : 'badge-warn'}`}>{passed ? 'PASSED' : 'FAILED'}</div>
            <div className="result-msg">{passed ? 'You did it! Keep shining! ✨' : "Don't give up — practice makes perfect! 💪"}</div>
            <div className="muted small">Passing score: {result.passing}%</div>
          </div>
        )}
        <OfflineReminder />
        <StudentReview token={st.current.token} />
        <p className="muted small">You may now close this tab.</p>
      </Message>
    );
  }
  if (view === 'terminated') {
    return (
      <Message mood="sad" title="Quiz terminated!" className="terminated">
        <p className="term-reason">🚫 {termText}</p>
        <p>Your teacher has been notified of the reason. Answers saved before the termination were recorded.</p>
        <p className="muted small">You can no longer continue this quiz. Please talk to your teacher.</p>
      </Message>
    );
  }
  if (view === 'blocked') {
    if (blocked.status === 'terminated') {
      return (
        <Message mood="sad" title="Quiz terminated!" className="terminated">
          <p className="term-reason">🚫 {blocked.reason_text}</p>
          <p className="muted">Please talk to your teacher.</p>
        </Message>
      );
    }
    const scored = blocked.show_result && blocked.score !== undefined;
    return (
      <Message mood="happy" title="Already finished!">
        <p className="muted">You already submitted this quiz. Each student can only take it once.</p>
        {scored && (
          <div className={`result ${blocked.passed ? 'result-pass' : 'result-fail'}`}>
            <StarRow count={starsFor(blocked)} />
            <div className="result-pct">{blocked.percentage}%</div>
            <div className="result-score">{blocked.score} / {blocked.total} points</div>
            <div className={`badge ${blocked.passed ? 'badge-success' : 'badge-warn'}`}>{blocked.passed ? 'PASSED' : 'FAILED'}</div>
          </div>
        )}
      </Message>
    );
  }

  if (view === 'quiz' && session.mode === 'per_question' && pq) {
    const q = pq.question;
    const last = pq.index === pq.count - 1;
    const hasAnswer = String(pq.answer).trim() !== '';
    const opts = q.type === 'tf' ? [{ id: 'true', text: 'True 👍' }, { id: 'false', text: 'False 👎' }] : q.choices;
    const R = 54;
    const circ = 2 * Math.PI * R;
    const frac = q.seconds ? Math.max(0, Math.min(1, left / q.seconds)) : 0;
    const ringCls = left <= 5 ? 'danger' : frac <= 0.34 ? 'warn' : '';
    const pct = (pq.index / pq.count) * 100;
    return (
      <div className="quiz-view">
        <SkyBackground variant="soft" />
        <header className="quiz-bar">
          <div className="quiz-bar-title">
            <b>{info.title}</b>
            <small>🧑‍🎓 {session.full_name} · {session.section}</small>
          </div>
          <div className="quiz-progress">
            <span>Question {pq.index + 1} of {pq.count}</span>
            <div className="progress">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
              <span className="progress-rocket" style={{ left: `${Math.min(96, Math.max(4, pct))}%` }}>🚀</span>
            </div>
          </div>
          <button type="button" className="sound-btn" onClick={toggleMute} title={muted ? 'Turn sound on' : 'Mute sound'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="timer" title="Time left for the whole quiz (if you use every second)">
            ⌛ {fmtClock(left + (pq.later || 0))}
            <div className="total-left">total left</div>
          </div>
        </header>
        <NetBanner net={net} pending={0} waiting={pqWait} />

        <main className="pq-stage">
          <div className="pq-top">
            <div className={`ring ${ringCls}`} aria-label={`${left} seconds left for this question`}>
              <svg width="132" height="132" viewBox="0 0 132 132">
                <circle className="ring-track" cx="66" cy="66" r={R} />
                <circle className="ring-fill" cx="66" cy="66" r={R} strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} />
              </svg>
              <div className="ring-text"><b>{fmtClock(left)}</b><small>this question</small></div>
            </div>
            <div className="pq-dots" aria-hidden="true">
              {Array.from({ length: pq.count }, (_, i) => (
                <i key={i} className={i < pq.index ? 'done' : i === pq.index ? 'now' : ''} />
              ))}
            </div>
          </div>

          <div className={`card q-card pq-card ${hasAnswer ? 'answered' : ''}`} key={q.id}>
            <div className="q-head">
              <span className="q-num">Question {pq.index + 1} / {pq.count}</span>
              <span className="q-pts">⭐ {plural(q.points, 'pt')}</span>
            </div>
            <div className="q-text">{q.question}</div>
            {q.figure && <Figure figureKey={q.figure} />}
            <div className="q-options">
              {q.type === 'text' ? (
                <input className="q-input" type="text" maxLength={255} autoComplete="off" spellCheck={false} autoFocus
                  placeholder="✏️ Type your answer, then press Enter" value={pq.answer} disabled={pqSending}
                  onChange={(e) => setPqAnswer(e.target.value, false)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextQuestion(false); } }} />
              ) : (
                opts.map((o, j) => (
                  <label key={o.id} className="opt">
                    <input type="radio" name={`q_${q.id}`} checked={String(pq.answer) === String(o.id)} disabled={pqSending}
                      onChange={() => setPqAnswer(String(o.id), true)} />
                    <span className="opt-letter">{q.type === 'tf' ? (j ? 'F' : 'T') : String.fromCharCode(65 + j)}</span>
                    <span className="opt-text">{o.text}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="pq-next">
            <button className={`btn btn-lg ${hasAnswer ? 'btn-success' : ''}`} disabled={pqSending} onClick={() => { sfx.click(); nextQuestion(false); }}>
              {pqWait ? '📴 Waiting for internet…' : pqSending ? 'Saving…' : last ? (hasAnswer ? 'Finish 🏁' : 'Skip & finish 🏁') : (hasAnswer ? 'Next ➜' : 'Skip ➜')}
            </button>
          </div>
          <p className="center muted small">You can&apos;t go back to a question once you move on.</p>
        </main>
        {busy && <div className="overlay"><Mascot mood="think" size={110} /><BouncyLoader /><p>{busy}</p></div>}
      </div>
    );
  }

  if (view === 'quiz') {
    const qs = session.questions;
    const answered = Object.values(answers).filter((v) => String(v).trim() !== '').length;
    const unanswered = qs.length - answered;
    const pct = (answered / qs.length) * 100;
    return (
      <div className="quiz-view">
        <SkyBackground variant="soft" />
        <header className="quiz-bar">
          <div className="quiz-bar-title">
            <b>{info.title}</b>
            <small>🧑‍🎓 {session.full_name} · {session.section}</small>
          </div>
          <div className="quiz-progress">
            <span>{answered}/{qs.length} answered</span>
            <div className="progress">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
              <span className="progress-rocket" style={{ left: `${Math.min(96, Math.max(4, pct))}%` }}>🚀</span>
            </div>
          </div>
          <button type="button" className="sound-btn" onClick={toggleMute} title={muted ? 'Turn sound on' : 'Mute sound'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <div className={`timer ${left <= 60 ? 'warn' : ''}`}>⏰ {fmtClock(left)}</div>
        </header>
        <NetBanner net={net} pending={pending} waiting={false} />
        <main className="quiz-body">
          {qs.map((q, i) => {
            const val = answers[q.id] ?? '';
            const done = String(val).trim() !== '';
            const opts = q.type === 'tf' ? [{ id: 'true', text: 'True 👍' }, { id: 'false', text: 'False 👎' }] : q.choices;
            return (
              <div key={q.id} className={`card q-card ${done ? 'answered' : ''}`} style={{ '--d': `${Math.min(i, 8) * 0.06}s` }}>
                <div className="q-head">
                  <span>
                    <span className="q-num">Question {i + 1} / {qs.length}</span>
                    {done && <span className="q-done" key={`d${q.id}`}>✅</span>}
                  </span>
                  <span className="q-pts">⭐ {plural(q.points, 'pt')}</span>
                </div>
                <div className="q-text">{q.question}</div>
                {q.figure && <Figure figureKey={q.figure} />}
                <div className="q-options">
                  {q.type === 'text' ? (
                    <input className="q-input" type="text" maxLength={255} autoComplete="off" spellCheck={false}
                      placeholder="✏️ Type your answer here" value={val} onChange={(e) => onAnswer(q.id, e.target.value, true)} />
                  ) : (
                    opts.map((o, j) => (
                      <label key={o.id} className="opt">
                        <input type="radio" name={`q_${q.id}`} checked={String(val) === String(o.id)}
                          onChange={() => onAnswer(q.id, String(o.id), false)} />
                        <span className="opt-letter">{q.type === 'tf' ? (j ? 'F' : 'T') : String.fromCharCode(65 + j)}</span>
                        <span className="opt-text">{o.text}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          <div className="submit-row">
            <button className="btn btn-success btn-lg btn-wiggle" onClick={() => { sfx.click(); setSubmitOpen(true); }}>
              Finish &amp; submit 🏁
            </button>
          </div>
        </main>

        <Modal open={submitOpen}>
          <Mascot mood={unanswered ? 'think' : 'cheer'} size={110} />
          <h2 style={{ color: 'var(--primary-dark)' }}>Ready to submit?</h2>
          <p>{unanswered ? `Wait! You still have ${plural(unanswered, 'unanswered question')}.` : `Awesome! You answered all ${qs.length} questions. 🎉`}</p>
          <p className="muted small">You cannot change your answers after submitting.</p>
          <div className="row-actions center">
            <button className="btn" onClick={() => setSubmitOpen(false)}>Keep answering</button>
            <button className="btn btn-success" onClick={() => submit(false)}>Yes, submit!</button>
          </div>
        </Modal>
        {busy && (
          <div className="overlay">
            <Mascot mood="think" size={110} />
            <BouncyLoader />
            <p>{busy}</p>
          </div>
        )}
      </div>
    );
  }

  /* landing */
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="student-root">
      <SkyBackground />
      <div className="center-screen">
        <div className="logo-wrap"><Logo size="lg" /></div>
        <div className="card landing-card">
          <div className="landing-top">
            <Mascot mood="happy" size={120} />
            <div>
              <div className="eyebrow">{info.class_name}</div>
              <h1>{info.title}</h1>
              <div className="meta-row">
                {info.timer_mode === 'per_question' ? (
                  <>
                    <span>⏱ <b>{info.varied_times ? 'Timed' : info.timer_label}</b> per question</span>
                    <span>⌛ About <b>{info.total_label}</b> total</span>
                  </>
                ) : (
                  <span>⏰ <b>{info.timer_label}</b> total</span>
                )}
                <span>📝 <b>{info.question_count}</b> question{info.question_count === 1 ? '' : 's'}</span>
                <span>⭐ <b>{info.total_points}</b> point{info.total_points === '1' ? '' : 's'}</span>
                <span>🏆 Pass: <b>{info.passing}%</b></span>
              </div>
            </div>
          </div>

          {info.instructions.trim() && (
            <>
              <h3>📋 Instructions</h3>
              <div className="instructions" style={{ whiteSpace: 'pre-line' }}>{info.instructions}</div>
            </>
          )}

          <div className="rules">
            <h3>⚠️ Exam rules — read carefully!</h3>
            <ul>
              <li>🖥️ The quiz opens in <b>full screen</b>. Stay in full screen until you submit.</li>
              <li>🚫 <b>Do not</b> press <kbd>Esc</kbd> / <kbd>F11</kbd>, switch tabs, open a new tab, use <kbd>Alt</kbd>+<kbd>Tab</kbd>, minimize,
                click outside the browser, reload, or close the window (<b>X</b>).</li>
              <li>🖥️ Use <b>one screen only</b>. A second monitor is not allowed, and the quiz window must fill the whole screen
                (no split screen or snapped windows).</li>
              <li>💥 Doing any of these will <b>immediately terminate</b> your quiz, and your teacher will see the exact reason.</li>
              {info.timer_mode === 'per_question' ? (
                <li>⏱ Questions appear <b>one at a time</b>, each with its own timer. When the time runs out it moves to the
                  next question automatically, and you <b>cannot go back</b>.</li>
              ) : (
                <li>⏰ The timer cannot be paused. When time runs out, your answers are submitted automatically.</li>
              )}
              <li>☝️ You can only take this quiz <b>once</b>. Your answers are saved as you go.</li>
              <li>📶 If your internet drops, <b>keep going</b> — the quiz keeps working and sends your answers when the
                connection is back. Just <b>don&apos;t close or reload the page</b>. Losing internet is <b>not</b> a valid excuse.</li>
            </ul>
          </div>

          <form className="info-form" onSubmit={proceed} noValidate>
            <div className="grid-2 tight">
              <label>🧑‍🎓 Full name
                <input value={form.full_name} onChange={set('full_name')} maxLength={150} autoComplete="name" placeholder="e.g. Juan A. Dela Cruz" />
              </label>
              <label>🏫 Section
                <input value={form.section} onChange={set('section')} maxLength={100} placeholder="e.g. 11-Rizal" />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={form.agree} onChange={set('agree')} /> I have read the instructions and the exam rules.
            </label>
            <Alert>{formError}</Alert>
            <button className="btn btn-primary btn-lg btn-block btn-wiggle">Let&apos;s play! ▶</button>
          </form>
        </div>
      </div>

      <Modal open={confirmOpen}>
        <Mascot mood="wow" size={110} />
        <h2>No turning back!</h2>
        <p>Once you start, the timer begins and the quiz goes full screen.</p>
        <p><b>Leaving full screen, switching tabs or windows, reloading, or closing the browser will terminate your quiz</b> and your teacher will be notified of the reason.</p>
        <p className="muted small">Taking the quiz as: <b>{form.full_name.trim()}</b> — {form.section.trim()}</p>
        <Alert>{startError}</Alert>
        <div className="row-actions center">
          <button className="btn" disabled={starting} onClick={() => setConfirmOpen(false)}>Go back</button>
          <button className="btn btn-danger btn-lg" disabled={starting} onClick={startQuiz}>I&apos;m ready — start! 🚀</button>
        </div>
      </Modal>
    </div>
  );
}
