// Tiny game sound effects made with the Web Audio API (no sound files needed).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('qnd_mute') === '1'; } catch { /* ignore */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('qnd_mute', v ? '1' : '0'); } catch { /* ignore */ }
}

function tone(freq, dur, { type = 'sine', when = 0, vol = 0.12, slide = 0 } = {}) {
  if (muted) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch { /* audio not available */ }
}

export const sfx = {
  pop: () => { tone(620, 0.09, { type: 'triangle' }); tone(930, 0.09, { type: 'triangle', when: 0.05 }); },
  click: () => tone(440, 0.06, { type: 'square', vol: 0.05 }),
  start: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', when: i * 0.09 })),
  tick: () => tone(1200, 0.05, { type: 'square', vol: 0.04 }),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', when: i * 0.12, vol: 0.14 })),
  okay: () => [392, 523, 659].forEach((f, i) => tone(f, 0.2, { type: 'triangle', when: i * 0.13 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.28, { type: 'sine', when: i * 0.18 })),
  buzz: () => { tone(160, 0.5, { type: 'sawtooth', vol: 0.1, slide: 0.6 }); tone(110, 0.5, { type: 'square', vol: 0.06, when: 0.05 }); },
};
