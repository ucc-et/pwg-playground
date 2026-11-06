// Cellular automaton caves, ported from server/caves.go with its rules as options.
import { hash2, unit } from './core.js';

export function caveFrames(seed, w, h, { steps = 5, fill = .49, birth = 5, death = 3, minSize = 12 } = {}) {
  let cur = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (edge || unit(hash2(x, y, seed + 400)) < fill) cur[y * w + x] = 1;
  }
  const frames = [{ grid: cur, label: 'Random noise', kind: 'noise' }];
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = wallNeighbours(cur, w, h, x, y);
      next[y * w + x] = n >= birth ? 1 : n <= death ? 0 : cur[y * w + x];
    }
    frames.push({ grid: next, label: `Smoothing step ${s + 1} of ${steps}`, kind: 'smooth' });
    cur = next;
  }
  const cleaned = fillTiny(cur, w, h, minSize);
  frames.push({ grid: cleaned, label: 'Clear tiny specks', kind: 'clean' });
  frames.push({ grid: connect(cleaned, w, h), label: 'Connect the caves', kind: 'connect' });
  return frames;
}

export function wallNeighbours(g, w, h, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h || g[ny * w + nx]) n++;
  }
  return n;
}

export function regions(g, w, h) {
  const label = new Int32Array(w * h), sizes = [0];
  for (let i = 0; i < g.length; i++) {
    if (g[i] || label[i]) continue;
    const id = sizes.length, stack = [i];
    sizes.push(0);
    label[i] = id;
    while (stack.length) {
      const c = stack.pop(), x = c % w, y = (c / w) | 0;
      sizes[id]++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!g[n] && !label[n]) { label[n] = id; stack.push(n); }
      }
    }
  }
  return { label, sizes };
}

function fillTiny(g, w, h, minSize) {
  const { label, sizes } = regions(g, w, h), out = g.slice();
  for (let i = 0; i < out.length; i++) if (!g[i] && sizes[label[i]] < minSize) out[i] = 1;
  return out;
}

// Each round, a breadth-first search leaves the main cave through rock, stops at
// the nearest other cave, and carves that path two cells wide.
function connect(g, w, h) {
  const out = g.slice();
  for (;;) {
    const { label, sizes } = regions(out, w, h);
    if (sizes.length <= 2) return out;
    let main = 1;
    sizes.forEach((s, id) => { if (s > sizes[main]) main = id; });
    const parent = new Int32Array(w * h).fill(-1), queue = [];
    for (let i = 0; i < out.length; i++) if (label[i] === main) { parent[i] = i; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      if (!out[c] && label[c] !== main) {
        for (let p = c; label[p] !== main; p = parent[p]) {
          const x = p % w, y = (p / w) | 0;
          out[p] = 0;
          if (x + 1 < w - 1) out[p + 1] = 0;
          if (y + 1 < h - 1) out[p + w] = 0;
        }
        break;
      }
      const x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const n = ny * w + nx;
        if (parent[n] < 0) { parent[n] = c; queue.push(n); }
      }
    }
  }
}
