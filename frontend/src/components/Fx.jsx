import { useMemo } from 'react';

function Cloud({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 100" aria-hidden="true">
      <path
        d="M40 80 Q10 80 14 58 Q18 38 42 42 Q48 16 78 20 Q100 2 124 22 Q156 14 162 42 Q190 42 188 64 Q186 82 160 80 Z"
        fill="#fff" stroke="#cfe6ff" strokeWidth="4"
      />
    </svg>
  );
}

const STARS = [
  [8, 12], [22, 30], [36, 8], [55, 22], [70, 10], [86, 28], [92, 6], [14, 48], [80, 46], [48, 40], [64, 56], [30, 62],
];
const BUBBLES = [6, 16, 27, 38, 49, 58, 67, 76, 85, 94];
const BUBBLE_COLORS = ['#ffd23f', '#ff5fa2', '#4cc9f0', '#7c4dff', '#22c55e', '#ff8c42'];

/** Animated sky: drifting clouds, twinkling stars, rising bubbles, rolling hills. */
export function SkyBackground({ variant = 'sky' }) {
  return (
    <div className={`sky sky-${variant}`} aria-hidden="true">
      <Cloud className="cloud c1" />
      <Cloud className="cloud c2" />
      <Cloud className="cloud c3" />
      <Cloud className="cloud c4" />
      {STARS.map(([x, y], i) => (
        <span key={i} className="twinkle" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 6) * 0.45}s` }}>✦</span>
      ))}
      {BUBBLES.map((x, i) => (
        <span key={x} className="bubble"
          style={{ left: `${x}%`, animationDelay: `${i * 1.3}s`, animationDuration: `${9 + (i % 4) * 2}s`,
            '--c': BUBBLE_COLORS[i % BUBBLE_COLORS.length], width: 10 + (i % 3) * 8, height: 10 + (i % 3) * 8 }} />
      ))}
      <svg className="hills" viewBox="0 0 1440 160" preserveAspectRatio="none">
        <path d="M0 90 Q240 10 480 80 T960 70 T1440 60 V160 H0 Z" fill="#8be28b" />
        <path d="M0 120 Q300 60 620 115 T1240 100 T1440 110 V160 H0 Z" fill="#5ccf6a" />
      </svg>
    </div>
  );
}

const CONFETTI_COLORS = ['#ffd23f', '#ff5fa2', '#4cc9f0', '#7c4dff', '#22c55e', '#ff8c42'];

export function Confetti({ count = 90 }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      dur: 2.6 + Math.random() * 2.4,
      size: 7 + Math.random() * 8,
      rot: Math.round(Math.random() * 360),
      shape: i % 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
    [count]
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i}
          style={{
            left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color,
            width: p.size, height: p.shape === 1 ? p.size * 0.45 : p.size, borderRadius: p.shape === 2 ? '50%' : 3, '--r': `${p.rot}deg`,
          }} />
      ))}
    </div>
  );
}

export function StarRow({ count }) {
  return (
    <div className="star-row" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`star ${i < count ? 'on' : ''}`} style={{ animationDelay: `${0.35 + i * 0.3}s` }}>★</span>
      ))}
    </div>
  );
}
