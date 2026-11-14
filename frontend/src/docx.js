// Reads the text of a Word .docx file in the browser (no library, no server extension needed).
// Word's automatic numbering ("1." / "a.") is turned back into real text so the importer can read it.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function readZipEntries(buf, wanted) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid .docx file.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true);
    const elen = dv.getUint16(off + 30, true);
    const clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(buf.subarray(off + 46, off + 46 + nlen));
    if (wanted.includes(name)) {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const data = buf.subarray(start, start + csize);
      if (method === 0) {
        out[name] = dec.decode(data);
      } else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('This browser cannot open .docx files. Save the file as .txt or paste the text instead.');
        }
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        out[name] = await new Response(stream).text();
      }
    }
    off += 46 + nlen + elen + clen;
  }
  return out;
}

function numberingFormats(xml) {
  const fmt = {};
  if (!xml) return fmt;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const abstract = {};
  for (const a of doc.getElementsByTagNameNS(W, 'abstractNum')) {
    const id = a.getAttribute('w:abstractNumId');
    for (const lvl of a.getElementsByTagNameNS(W, 'lvl')) {
      abstract[`${id}:${lvl.getAttribute('w:ilvl')}`] = lvl.getElementsByTagNameNS(W, 'numFmt')[0]?.getAttribute('w:val');
    }
  }
  for (const n of doc.getElementsByTagNameNS(W, 'num')) {
    const absId = n.getElementsByTagNameNS(W, 'abstractNumId')[0]?.getAttribute('w:val');
    for (let l = 0; l < 9; l++) fmt[`${n.getAttribute('w:numId')}:${l}`] = abstract[`${absId}:${l}`];
  }
  return fmt;
}

export async function docxToText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = await readZipEntries(buf, ['word/document.xml', 'word/numbering.xml']);
  if (!files['word/document.xml']) throw new Error('This .docx file has no text that can be read.');
  const fmts = numberingFormats(files['word/numbering.xml']);
  const doc = new DOMParser().parseFromString(files['word/document.xml'], 'application/xml');

  const lines = [];
  const counters = {};
  let letter = 0;
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    let text = '';
    for (const el of p.getElementsByTagNameNS(W, '*')) {
      if (el.localName === 't') text += el.textContent;
      else if (el.localName === 'tab') text += ' ';
      else if (el.localName === 'br' || el.localName === 'cr') text += '\n';
    }
    text = text.trim();
    const numPr = p.getElementsByTagNameNS(W, 'numPr')[0];
    if (numPr && text) {
      const numId = numPr.getElementsByTagNameNS(W, 'numId')[0]?.getAttribute('w:val');
      const ilvl = numPr.getElementsByTagNameNS(W, 'ilvl')[0]?.getAttribute('w:val') || '0';
      const f = fmts[`${numId}:${ilvl}`] || (ilvl === '0' ? 'decimal' : 'lowerLetter');
      if (f === 'decimal' && !/^\d+\s*[.)]/.test(text)) {
        const key = `${numId}:${ilvl}`;
        counters[key] = (counters[key] || 0) + 1;
        text = `${counters[key]}. ${text}`;
      } else if (/letter/i.test(f) && !/^[A-Ha-h]\s*[.)]\s/.test(text)) {
        text = `${String.fromCharCode(65 + Math.min(letter, 7))}. ${text}`;
        letter++;
      }
    }
    if (/^\d+\s*[.)]/.test(text)) letter = 0;
    lines.push(text);
  }
  return lines.join('\n');
}
