// Shared helpers: seeds, 2D canvases, debouncing.
export const seedOf = text => {
  const t = String(text).trim();
  if (/^-?\d+$/.test(t)) return Number(BigInt(t) & 0xffffffffn);
  let h = 2166136261; // any other text is hashed into a seed
  for (const c of t) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
};
export const ease = t => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
export const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
export function debounce(fn, ms = 120) {
  let id;
  const d = (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(id);
  return d;
}
// A canvas matching the stage, redrawn through draw(ctx, w, h) on resize.
export function canvas2d(stage, draw) {
  const c = document.createElement('canvas');
  stage.append(c);
  const ctx = c.getContext('2d');
  const fit = () => {
    const r = stage.getBoundingClientRect(), s = devicePixelRatio || 1;
    c.width = Math.max(1, r.width * s);
    c.height = Math.max(1, r.height * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = false;
    draw(ctx, r.width, r.height);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  return { canvas: c, ctx, redraw: fit, dispose: () => ro.disconnect() };
}
export function overlay(stage, cls, html = '') {
  const d = document.createElement('div');
  d.className = 'overlay ' + cls;
  d.innerHTML = html;
  stage.append(d);
  return d;
}
export const yieldFrame = () => new Promise(r => setTimeout(r));
