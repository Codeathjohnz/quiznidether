import { useEffect, useState } from 'react';
import { figureUrl } from '../api';

/**
 * A question's figure (picture / diagram). Tap it to see it bigger; tap again to close.
 * Give `figureKey` (saved figure) or `src` (a data URL in previews).
 * If it fails to load (no internet), it tries again by itself when the connection is back.
 */
export default function Figure({ figureKey, src, small = false }) {
  const [zoom, setZoom] = useState(false);
  const [broken, setBroken] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!broken || src) return undefined;
    const again = () => { setBroken(false); setRetry((n) => n + 1); };
    const t = setInterval(again, 8000);
    window.addEventListener('online', again);
    return () => { clearInterval(t); window.removeEventListener('online', again); };
  }, [broken, src]);

  const base = src || figureUrl(figureKey);
  if (!base) return null;
  const url = retry && !src ? `${base}&r=${retry}` : base;
  if (broken) {
    return <div className={`q-figure broken ${small ? 'small' : ''}`}>🖼 Loading the figure… (it appears when the internet is back)</div>;
  }
  return (
    <>
      <figure className={`q-figure ${small ? 'small' : ''}`}>
        <button type="button" className="q-figure-btn" onClick={() => setZoom(true)} title="Tap to see it bigger">
          <img src={url} alt="Figure for this question" draggable={false} onError={() => setBroken(true)} />
          <span className="q-figure-zoom" aria-hidden="true">🔍</span>
        </button>
      </figure>
      {zoom && (
        <div className="figure-lightbox" onClick={() => setZoom(false)} role="dialog" aria-label="Figure (tap to close)">
          <img src={url} alt="Figure for this question, enlarged" draggable={false} />
          <span className="figure-lightbox-hint">Tap anywhere to close</span>
        </div>
      )}
    </>
  );
}
