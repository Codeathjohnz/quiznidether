/**
 * "Dethy" the owl — original cartoon mascot drawn in SVG.
 * moods: happy | cheer | wow | think | sad
 */
const INK = '#2d1b4e';

export default function Mascot({ mood = 'happy', size = 140, className = '' }) {
  const eyes = () => {
    if (mood === 'cheer') {
      return (
        <g stroke={INK} strokeWidth="6" fill="none" strokeLinecap="round">
          <path d="M60 96 q16 -20 32 0" />
          <path d="M108 96 q16 -20 32 0" />
        </g>
      );
    }
    const p = {
      happy: [[78, 94, 11], [122, 94, 11]],
      wow: [[76, 92, 6], [124, 92, 6]],
      think: [[84, 84, 10], [130, 84, 10]],
      sad: [[76, 102, 10], [124, 102, 10]],
    }[mood] || [[78, 94, 11], [122, 94, 11]];
    return (
      <>
        <circle cx="76" cy="92" r="24" fill="#fff" stroke={INK} strokeWidth="5" />
        <circle cx="124" cy="92" r="24" fill="#fff" stroke={INK} strokeWidth="5" />
        <g className="m-pupils">
          {p.map(([x, y, r]) => (
            <g key={x}>
              <circle cx={x} cy={y} r={r} fill={INK} />
              <circle cx={x + r * 0.35} cy={y - r * 0.4} r={r * 0.35} fill="#fff" />
            </g>
          ))}
        </g>
      </>
    );
  };

  return (
    <svg className={`mascot mascot-${mood} ${className}`} width={size} height={size * 1.05} viewBox="0 0 200 210" aria-hidden="true">
      <ellipse className="m-shadow" cx="100" cy="201" rx="52" ry="7" fill="rgba(45,27,78,.18)" />
      <g className="m-body">
        {/* ear tufts */}
        <path d="M50 70 L40 30 L82 54 Z" fill="#6a3df0" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <path d="M150 70 L160 30 L118 54 Z" fill="#6a3df0" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        {/* wings */}
        <g className="m-wing-l">
          <ellipse cx="44" cy="130" rx="19" ry="38" fill="#6a3df0" stroke={INK} strokeWidth="5" transform="rotate(18 44 130)" />
        </g>
        <g className="m-wing-r">
          <ellipse cx="156" cy="130" rx="19" ry="38" fill="#6a3df0" stroke={INK} strokeWidth="5" transform="rotate(-18 156 130)" />
        </g>
        {/* feet */}
        <ellipse cx="80" cy="192" rx="13" ry="7" fill="#ffb02e" stroke={INK} strokeWidth="4" />
        <ellipse cx="120" cy="192" rx="13" ry="7" fill="#ffb02e" stroke={INK} strokeWidth="4" />
        {/* body + belly */}
        <ellipse cx="100" cy="120" rx="64" ry="72" fill="#8f63ff" stroke={INK} strokeWidth="5" />
        <ellipse cx="100" cy="146" rx="40" ry="40" fill="#ffe9c9" />
        <g stroke="#ecc994" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M80 136 q7 7 14 0" />
          <path d="M106 136 q7 7 14 0" />
          <path d="M92 154 q7 7 14 0" />
          <path d="M80 170 q7 7 14 0" />
          <path d="M106 170 q7 7 14 0" />
        </g>
        {/* eyes */}
        {eyes()}
        {mood === 'sad' && (
          <g stroke={INK} strokeWidth="5" strokeLinecap="round">
            <path d="M54 66 L90 58" />
            <path d="M146 66 L110 58" />
          </g>
        )}
        {mood === 'think' && <path d="M106 60 L142 54" stroke={INK} strokeWidth="5" strokeLinecap="round" />}
        {/* cheeks */}
        <ellipse cx="56" cy="120" rx="9" ry="5" fill="#ff8fb8" opacity=".85" />
        <ellipse cx="144" cy="120" rx="9" ry="5" fill="#ff8fb8" opacity=".85" />
        {/* beak */}
        {mood === 'wow' ? (
          <ellipse cx="100" cy="122" rx="9" ry="12" fill={INK} />
        ) : (
          <path d="M89 112 L111 112 L100 128 Z" fill="#ffb02e" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        )}
        {/* graduation cap */}
        <g className="m-cap">
          <rect x="78" y="40" width="44" height="14" rx="4" fill={INK} />
          <path d="M56 38 L100 20 L144 38 L100 56 Z" fill="#3d2670" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <g className="m-tassel">
            <path d="M100 37 L138 44 L138 64" stroke="#ffd23f" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="138" cy="67" r="6" fill="#ffd23f" stroke={INK} strokeWidth="2" />
          </g>
        </g>
        {mood === 'sad' && <path className="m-tear" d="M56 112 q-7 11 0 15 q7 -4 0 -15 Z" fill="#4cc9f0" stroke={INK} strokeWidth="2" />}
      </g>
      {mood === 'think' && (
        <g className="m-bubble">
          <circle cx="176" cy="34" r="20" fill="#fff" stroke={INK} strokeWidth="4" />
          <circle cx="156" cy="62" r="5" fill="#fff" stroke={INK} strokeWidth="3" />
          <text x="176" y="44" textAnchor="middle" fontFamily="'Luckiest Guy', cursive" fontSize="28" fill="#7c4dff">?</text>
        </g>
      )}
      {mood === 'cheer' && (
        <g className="m-sparkles" fill="#ffd23f" stroke={INK} strokeWidth="2">
          <path d="M20 40 l5 10 l10 5 l-10 5 l-5 10 l-5 -10 l-10 -5 l10 -5 Z" />
          <path d="M178 70 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4 Z" />
        </g>
      )}
    </svg>
  );
}
