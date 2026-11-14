import { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { docxToText } from '../docx';
import { TEMPLATE_TEXT, buildPrompt } from '../importTemplate';
import { TYPE_NAMES } from '../utils';
import { Alert, useToast } from './ui';
import QuestionPreview from './QuestionPreview';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

export default function ImportQuestions({ quiz, existingCount, attemptCount, onClose, onImported }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [prompt, setPrompt] = useState({ topic: quiz.class_name || quiz.title, items: 30, level: '', types: { mcq: true, tf: true, text: true } });
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const promptText = useMemo(() => buildPrompt(prompt), [prompt]);

  const check = async (value = text) => {
    setError('');
    setPreview(null);
    if (!value.trim()) return setError('Paste your questionnaire or choose a file first.');
    setBusy(true);
    try {
      setPreview(await api('questions.import', { quiz_id: quiz.id, text: value }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (file) => {
    if (!file) return;
    setError('');
    setPreview(null);
    try {
      let content;
      if (/\.docx$/i.test(file.name)) content = await docxToText(file);
      else if (/\.(txt|md|text)$/i.test(file.name) || file.type.startsWith('text/')) content = await file.text();
      else throw new Error('Please upload a .txt or .docx file (or paste the text).');
      setFileName(file.name);
      setText(content);
      check(content);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <section className="card import-card">
      <div className="card-head">
        <h2>📥 Import a questionnaire (TQ)</h2>
        <button type="button" className="icon-btn" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="import-steps">
        <div className="import-step">
          <div className="step-num">1</div>
          <div className="step-body">
            <h3>Get the template</h3>
            <p className="muted small">Write your TQ in this format, or let Claude write it for you with the prompt below.</p>
            <div className="row-actions">
              <button type="button" className="btn btn-sm" onClick={() => download('quiz-template.txt', TEMPLATE_TEXT)}>⬇ Download template (.txt)</button>
            </div>

            <div className="prompt-box">
              <div className="label">🤖 Prompt for Claude / AI</div>
              <div className="grid-2 tight">
                <label>Topic
                  <input value={prompt.topic} onChange={(e) => setPrompt({ ...prompt, topic: e.target.value })} placeholder="e.g. Introduction to Computing" />
                </label>
                <label>Number of items
                  <input type="number" min="1" max="200" value={prompt.items} onChange={(e) => setPrompt({ ...prompt, items: e.target.value })} />
                </label>
              </div>
              <label>For (optional)
                <input value={prompt.level} onChange={(e) => setPrompt({ ...prompt, level: e.target.value })} placeholder="e.g. Grade 11 students, college freshmen" />
              </label>
              <div className="type-checks">
                {Object.entries(TYPE_NAMES).map(([k, v]) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={prompt.types[k]} onChange={(e) => setPrompt({ ...prompt, types: { ...prompt.types, [k]: e.target.checked } })} /> {v}
                  </label>
                ))}
              </div>
              <textarea className="prompt-preview" readOnly rows={6} value={promptText} onFocus={(e) => e.target.select()} />
              <div className="row-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => copyText(promptText).then(() => toast('Prompt copied! Paste it into Claude. 🤖'))}>
                  📋 Copy prompt
                </button>
                <a className="btn btn-sm" href="https://claude.ai/new" target="_blank" rel="noreferrer">Open Claude ↗</a>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>Then copy Claude&apos;s answer and paste it in step 2. Always double-check the answer key!</p>
            </div>
          </div>
        </div>

        <div className="import-step">
          <div className="step-num">2</div>
          <div className="step-body">
            <h3>Upload or paste your TQ</h3>
            <div
              className={`dropzone ${dragOver ? 'over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
            >
              <span className="dz-icon">📄</span>
              <b>{fileName || 'Drop your file here or click to choose'}</b>
              <small className="muted">.txt or .docx (Word)</small>
              <input ref={fileRef} type="file" accept=".txt,.md,.docx,text/plain" hidden
                onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <div className="divider"><span>or paste it here</span></div>
            <textarea rows={8} className="paste-box" value={text}
              onChange={(e) => { setText(e.target.value); setPreview(null); setFileName(''); }}
              placeholder={'1. What does CPU stand for?\nA. Central Processing Unit\nB. Computer Personal Unit\nANSWER: A'} />
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => check()} disabled={busy}>🔍 Check questions</button>
            </div>
          </div>
        </div>
      </div>

      <Alert>{error}</Alert>

      {preview && (
        <QuestionPreview preview={preview} text={text} quiz={quiz} existingCount={existingCount} attemptCount={attemptCount}
          onImported={onImported} onClose={onClose} title="3 · Review before importing" />
      )}
    </section>
  );
}
