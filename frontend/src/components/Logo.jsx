/** Chunky, outlined, bouncing game-style title: "QUIZ NI DETHER". */
export default function Logo({ size = 'md', animate = true }) {
  const words = ['QUIZ', 'NI', 'DETHER'];
  let i = 0;
  return (
    <div className={`game-logo game-logo-${size} ${animate ? 'is-animated' : ''}`} role="img" aria-label="Quiz ni Dether">
      {words.map((w, wi) => (
        <span className={`gl-word gl-word-${wi}`} key={w} aria-hidden="true">
          {[...w].map((ch, ci) => {
            const n = i++;
            return (
              <span key={ci} className="gl-letter" data-l={ch} style={{ '--i': n }}>
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
