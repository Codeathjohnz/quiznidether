import { useRef, useState } from 'react';
import { api } from '../api';
import { prepareImage } from '../images';
import Figure from './Figure';

/**
 * Picks the figure of a question: upload a picture, paste one (Ctrl+V), or paste SVG code from an AI.
 * value = saved figure key ('' = none); onChange(key).
 */
export default function FigurePicker({ value, onChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [svgOpen, setSvgOpen] = useState(false);
  const [svg, setSvg] = useState('');

  const upload = async (data) => {
    setError('');
    setBusy(true);
    try {
      const r = await api('figures.upload', { data });
      onChange(r.key);
      setSvgOpen(false);
      setSvg('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file) => {
    if (!file) return;
    try {
      await upload(await prepareImage(file));
    } catch (e) {
      setError(e.message);
    }
  };

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    fromFile(item.getAsFile());
  };

  return (
    <div className="figure-picker" onPaste={onPaste}>
      <div className="label">Figure <small className="muted">(optional picture, graph or diagram shown with the question)</small></div>
      {value ? (
        <div className="figure-picker-current">
          <Figure figureKey={value} small />
          <div className="row-actions">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>🔁 Change</button>
            <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => onChange('')}>Remove figure</button>
          </div>
        </div>
      ) : (
        <div
          className="figure-drop"
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); fromFile(e.dataTransfer.files[0]); }}
        >
          {busy ? 'Uploading…' : <>🖼 <b>Add a picture</b> <small className="muted">click, drop, or paste (Ctrl+V) · PNG, JPG, GIF, SVG</small></>}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg" hidden
        onChange={(e) => { fromFile(e.target.files[0]); e.target.value = ''; }} />

      <button type="button" className="link-btn small" onClick={() => setSvgOpen(!svgOpen)}>
        {svgOpen ? 'Hide SVG code' : '✏️ Or paste an SVG drawing (e.g. made by Claude)'}
      </button>
      {svgOpen && (
        <div className="figure-svg">
          <textarea rows={4} value={svg} onChange={(e) => setSvg(e.target.value)} spellCheck={false}
            placeholder={'<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">\n  ...\n</svg>'} />
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !svg.trim()} onClick={() => upload(svg)}>Use this drawing</button>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
