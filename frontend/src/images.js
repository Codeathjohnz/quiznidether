// Picture helpers for question figures: shrink big photos in the browser before uploading them.

const MAX_BYTES = 850 * 1024; // the server accepts up to ~900 KB per picture
const MAX_SIDE = 1600;
const KEEP_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('The picture could not be read.'));
  r.readAsDataURL(blob);
});

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('This picture type is not supported. Use PNG, JPG, GIF, WEBP or SVG.'));
  img.src = url;
});

/**
 * Turns a picture file (or blob) into something the server accepts:
 * SVG -> its text; small pictures -> data URL as is; big ones -> resized JPEG/PNG data URL.
 */
export async function prepareImage(blob) {
  const type = (blob.type || '').toLowerCase();
  if (type === 'image/svg+xml' || /\.svg$/i.test(blob.name || '')) return blob.text();
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && blob.size <= MAX_BYTES && KEEP_TYPES.includes(type)) return readAsDataUrl(blob);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (type === 'image/png') {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png');
      if (png.length * 0.75 <= MAX_BYTES) return png; // keeps transparent diagrams sharp
    }
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const jpg = canvas.toDataURL('image/jpeg', q);
      if (jpg.length * 0.75 <= MAX_BYTES) return jpg;
    }
    throw new Error('The picture is too big. Please use a smaller picture.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
