import { useState } from 'react';
import { figureUrl } from '../api';

/**
 * A question's figure (picture / diagram). Tap it to see it bigger; tap again to close.
 * Give `figureKey` (saved figure) or `src` (a data URL in previews).
 */
export default function Figure({ figureKey, src, small = false }) {
  const [zoom, setZoom] = useState(false);
  const [broken, setBroken] = useState(false);
  const url = src || figureUrl(figureKey);
  if (!url) return null;
  if (broken) return <div className={`q-figure broken ${small ? 'small' : ''}`}>🖼 The figure could not be loaded.</div>;
  return (
    <>
      <figure className={`q-figure ${small ? 'small' : ''}`}>
        <button type="button" className="q-figure-btn" onClick={() => setZoom(true)} title="Tap to see it bigger">
          <img src={url} alt="Figure for this question" loading="lazy" draggable={false} onError={() => setBroken(true)} />
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
