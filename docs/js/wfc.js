// Wave Function Collapse village: tiles and solver, ported from tiles.go and wfc.go.
import { B } from './core.js';
export const CW = 7, CH = 5;
const E = 0, S = 1, W = 2, N = 3, TOP = 4, BOTTOM = 5, OPP = [W, N, E, S, BOTTOM, TOP];

function newVox() {
  const v = new Uint8Array(CW * CH * CW);
  const at = (x, y, z) => (x < 0 || z < 0 || y < 0 || x >= CW || z >= CW || y >= CH ? 0 : v[(x * CH + y) * CW + z]);
  const set = (x, y, z, b) => { v[(x * CH + y) * CW + z] = b; };
  const fill = (x0, y0, z0, x1, y1, z1, b) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, b);
  };
  return { at, set, fill };
}
const sideXZ = (s, a, i) => (s === E ? [6 - i, a] : s === S ? [a, 6 - i] : s === W ? [i, a] : [a, i]);
const edgeDist = (x, z) => Math.min(6 - x, 6 - z, x, z);

function house(door, base, wall) {
  const t = newVox();
  t.fill(0, 0, 0, 6, 0, 6, B.Grass);
  t.fill(1, 0, 1, 5, 0, 5, B.Planks);
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 5; z++) {
    if (edgeDist(x, z) !== 1) continue;
    const corner = (x === 1 || x === 5) && (z === 1 || z === 5);
    t.set(x, 1, z, corner ? B.Log : base);
    for (let y = 2; y <= 4; y++) t.set(x, y, z, corner ? B.Log : wall);
    if (!corner && (x === 3 || z === 3)) t.set(x, 3, z, B.Glass);
  }
  let [x, z] = sideXZ(door, 3, 1);
  t.set(x, 1, z, B.DoorWood); t.set(x, 2, z, B.DoorWood); t.set(x, 3, z, wall);
  for (const a of [2, 3, 4]) { [x, z] = sideXZ(door, a, 0); t.set(x, 0, z, B.Gravel); }
  return t;
}
function roof(b) {
  const t = newVox();
  for (let x = 0; x < CW; x++) for (let z = 0; z < CW; z++) t.fill(x, 0, z, x, Math.min(edgeDist(x, z), CH - 1), z, b);
  return t;
}
function battlement() {
  const t = newVox();
  t.fill(1, 0, 1, 5, 0, 5, B.Stone);
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 5; z++) if (x === 1 || x === 5 || z === 1 || z === 5) {
    t.set(x, 1, z, B.Cobble);
    if ((x + z) % 2 === 0) t.set(x, 2, z, B.Cobble);
  }
  return t;
}
function stall(door) {
  const t = newVox();
  t.fill(0, 0, 0, 6, 0, 6, B.Gravel);
  for (const [x, z] of [[1, 1], [1, 5], [5, 1], [5, 5]]) t.fill(x, 1, z, x, 3, z, B.Fence);
  for (let s = 0; s < 4; s++) if (s !== door) for (let a = 2; a <= 4; a++) {
    const [x, z] = sideXZ(s, a, 1);
    t.set(x, 1, z, B.Planks);
    if (a === 3) t.set(x, 2, z, B.Hay);
  }
  for (let x = 0; x < CW; x++) t.fill(x, 4, 0, x, 4, 6, x % 2 ? B.Plaster : B.RoofTile);
  return t;
}
function pathTile(mask) {
  const t = newVox();
  t.fill(0, 0, 0, 6, 0, 6, B.Grass);
  t.fill(2, 0, 2, 4, 0, 4, B.Gravel);
  for (let s = 0; s < 4; s++) if (mask & (1 << s)) for (let i = 0; i < 3; i++) for (let a = 2; a <= 4; a++) {
    const [x, z] = sideXZ(s, a, i);
    t.set(x, 0, z, B.Gravel);
  }
  return t;
}
const pop = m => { let c = 0; for (; m; m &= m - 1) c++; return c; };

export const KINDS = [
  { key: 'cottage', label: 'Timber cottage', base: B.Cobble, wall: B.Planks, cap: () => roof(B.RoofTile), w: 1 },
  { key: 'plaster', label: 'Plaster house', base: B.Log, wall: B.Plaster, cap: () => roof(B.RoofSlate), w: 1 },
  { key: 'thatch', label: 'Log cabin', base: B.Cobble, wall: B.Log, cap: () => roof(B.Hay), w: .8 },
  { key: 'tower', label: 'Stone tower', base: B.Cobble, wall: B.Stone, cap: battlement, w: .35 },
];

export function buildTiles(enabled = {}) {
  const ts = [], on = k => enabled[k] !== false;
  const add = (name, cat, weight, sock, vox) => ts.push({ name, cat, weight, sock, vox });
  add('air', 'air', 1, ['a', 'a', 'a', 'a', 'a', 'a'], newVox());
  const grass = newVox();
  grass.fill(0, 0, 0, 6, 0, 6, B.Grass);
  add('grass', 'nature', 3, ['g', 'g', 'g', 'g', 'a', 'ground'], grass);
  for (const k of KINDS) {
    if (!on(k.key)) continue;
    for (let d = 0; d < 4; d++) {
      const s = ['g', 'g', 'g', 'g', 'f' + k.key, 'ground'];
      s[d] = 'p';
      add(`${k.key}_${d}`, 'house', k.w, s, house(d, k.base, k.wall));
    }
    add(`${k.key}_top`, 'roof', 1, ['a', 'a', 'a', 'a', 'a', 'f' + k.key], k.cap());
  }
  if (on('stall')) for (let d = 0; d < 4; d++) {
    const s = ['g', 'g', 'g', 'g', 'a', 'ground'];
    s[d] = 'p';
    add(`stall_${d}`, 'house', .7, s, stall(d));
  }
  for (let m = 1; m < 16; m++) {
    const s = [0, 1, 2, 3].map(i => (m & (1 << i) ? 'p' : 'g')).concat(['a', 'ground']);
    add(`path_${m}`, 'path', [0, .25, 3, 1.1, .35][pop(m)], s, pathTile(m));
  }
  const well = pathTile(15);
  well.fill(2, 1, 2, 4, 1, 4, B.Cobble);
  well.set(3, 1, 3, B.Water);
  well.fill(2, 2, 2, 2, 3, 2, B.Fence);
  well.fill(4, 2, 4, 4, 3, 4, B.Fence);
  well.fill(2, 4, 2, 4, 4, 4, B.RoofTile);
  add('well', 'plaza', 0, ['p', 'p', 'p', 'p', 'a', 'ground'], well);
  return ts;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function attempt(tiles, G, seed, density, roads) {
  const H = 2, nT = tiles.length, nC = G * G * H, rand = rng(seed);
  const xyz = c => [c % G, (c / (G * G)) | 0, ((c / G) | 0) % G];
  const idx = (x, y, z) => (y * G + z) * G + x;
  const DIRS = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
  const nb = (c, d) => {
    const [x, y, z] = xyz(c), a = x + DIRS[d][0], b = y + DIRS[d][1], e = z + DIRS[d][2];
    return a < 0 || e < 0 || b < 0 || a >= G || e >= G || b >= H ? -1 : idx(a, b, e);
  };
  const compat = tiles.map(t => [0, 1, 2, 3, 4, 5].map(d => tiles.map(o => t.sock[d] === o.sock[OPP[d]])));
  const dom = new Uint8Array(nC * nT), weight = new Float64Array(nC * nT);
  for (let c = 0; c < nC; c++) {
    const [x, y, z] = xyz(c), r = Math.hypot(x - (G >> 1), z - (G >> 1)) / (G >> 1), core = Math.max(0, 1 - r);
    tiles.forEach((t, i) => {
      const bias = t.cat === 'house' ? (.15 + .9 * core) * density : t.cat === 'path' ? (.5 + 1.5 * core) * roads : 1;
      weight[c * nT + i] = t.weight * bias + 1e-6;
      let ok = !(y > 0 && t.sock[BOTTOM] === 'ground');
      for (let d = 0; d < 6; d++) {
        if (nb(c, d) >= 0) continue;
        const s = t.sock[d];
        ok = ok && (d === BOTTOM ? s === 'ground' : d === TOP ? s === 'a' : s === 'g' || s === 'a');
      }
      dom[c * nT + i] = ok ? 1 : 0;
    });
  }
  const count = c => { let n = 0; for (let i = 0; i < nT; i++) n += dom[c * nT + i]; return n; };
  const propagate = start => {
    const q = [...start];
    while (q.length) {
      const c = q.pop();
      for (let d = 0; d < 6; d++) {
        const n = nb(c, d);
        if (n < 0) continue;
        let changed = false;
        for (let j = 0; j < nT; j++) {
          if (!dom[n * nT + j]) continue;
          let ok = false;
          for (let i = 0; i < nT && !ok; i++) ok = dom[c * nT + i] && compat[i][d][j];
          if (!ok) { dom[n * nT + j] = 0; changed = true; }
        }
        if (changed) { if (!count(n)) return false; q.push(n); }
      }
    }
    return true;
  };
  const well = nT - 1, center = idx(G >> 1, 0, G >> 1);
  dom.fill(0, center * nT, center * nT + nT);
  dom[center * nT + well] = 1;
  if (!propagate(Array.from({ length: nC }, (_, i) => i))) return null;
  const single = c => { for (let i = 0; i < nT; i++) if (dom[c * nT + i]) return i; return -1; };
  const initial = Array.from({ length: nC }, (_, c) => count(c)), initialR = [];
  initial.forEach((n, c) => { if (n === 1) initialR.push([c, single(c)]); });
  const shown = initial.slice(), steps = [], stack = [];
  let shownDom = dom.slice(), backtracks = 0;
  const record = (kind, cell, tile) => {
    const st = { kind, cell, tile, d: [], r: [] };
    for (let c = 0; c < nC; c++) {
      let diff = false;
      for (let i = 0; i < nT && !diff; i++) diff = dom[c * nT + i] !== shownDom[c * nT + i];
      if (!diff) continue;
      const n = count(c);
      st.d.push([c, n]);
      if (n === 1) st.r.push([c, single(c)]);
      shown[c] = n;
    }
    shownDom = dom.slice();
    steps.push(st);
  };
  for (let guard = 0; guard < 6000; guard++) {
    let best = -1, bestH = Infinity;
    for (let c = 0; c < nC; c++) {
      if (count(c) < 2) continue;
      let sum = 0, sl = 0;
      for (let i = 0; i < nT; i++) if (dom[c * nT + i]) { const w = weight[c * nT + i]; sum += w; sl += w * Math.log2(w); }
      const h = Math.log2(sum) - sl / sum + rand() * .05;
      if (h < bestH) { best = c; bestH = h; }
    }
    if (best < 0) {
      const final = Array.from({ length: nC }, (_, c) => single(c));
      return { G, H, tiles, steps, initial, initialR, final, backtracks, nb, idx };
    }
    let total = 0;
    for (let i = 0; i < nT; i++) if (dom[best * nT + i]) total += weight[best * nT + i];
    let r = rand() * total, pick = -1;
    for (let i = 0; i < nT; i++) if (dom[best * nT + i]) { if (r >= 0) pick = i; r -= weight[best * nT + i]; }
    stack.push({ dom: dom.slice(), c: best, t: pick });
    dom.fill(0, best * nT, best * nT + nT);
    dom[best * nT + pick] = 1;
    if (propagate([best])) { record(0, best, pick); continue; }
    for (;;) { // contradiction: rewind, rule out the failed choice, retry
      const f = stack.pop();
      if (!f) return null;
      dom.set(f.dom);
      dom[f.c * nT + f.t] = 0;
      backtracks++;
      if (count(f.c) && propagate([f.c])) { record(1, f.c, f.t); break; }
    }
  }
  return null;
}

function reachable(tr) {
  const start = tr.idx(tr.G >> 1, 0, tr.G >> 1), seen = new Set([start]), st = [start];
  while (st.length) {
    const c = st.pop(), t = tr.tiles[tr.final[c]];
    if (t.cat === 'house') continue;
    for (let d = 0; d < 4; d++) {
      const n = tr.nb(c, d);
      if (n >= 0 && !seen.has(n) && t.sock[d] === 'p') { seen.add(n); st.push(n); }
    }
  }
  return seen;
}

function score(tr) {
  const q = [0, 0, 0, 0], half = tr.G >> 1;
  let doors = 0;
  for (const c of reachable(tr)) if (tr.tiles[tr.final[c]].cat === 'house') {
    doors++;
    q[(c % tr.G > half ? 1 : 0) + (((c / tr.G) | 0) % tr.G > half ? 2 : 0)]++;
  }
  tr.doors = doors;
  return doors + 4 * Math.min(...q);
}

// Turns roads and houses cut off from the plaza into grass, so playback never shows them.
function prune(tr) {
  const seen = reachable(tr), swap = new Map();
  for (let c = 0; c < tr.G * tr.G; c++) {
    const cat = tr.tiles[tr.final[c]].cat;
    if ((cat !== 'path' && cat !== 'house') || seen.has(c)) continue;
    swap.set(c, 1);
    const up = tr.nb(c, TOP);
    if (up >= 0 && tr.tiles[tr.final[up]].cat === 'roof') swap.set(up, 0);
  }
  swap.forEach((t, c) => { tr.final[c] = t; });
  const fix = r => r.forEach(p => { if (swap.has(p[0])) p[1] = swap.get(p[0]); });
  fix(tr.initialR);
  tr.steps.forEach(s => fix(s.r));
}

export function solveVillage(tiles, seed, G = 7, { density = 1, roads = 1, candidates = 30 } = {}) {
  let best = null, bestScore = -1;
  for (let i = 0; i < candidates; i++) {
    const tr = attempt(tiles, G, (seed * 1000 + i) >>> 0, density, roads);
    if (!tr) continue;
    const sc = score(tr);
    if (sc > bestScore) { best = tr; bestScore = sc; }
  }
  if (best) { prune(best); score(best); }
  return best;
}
