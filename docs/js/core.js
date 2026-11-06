// Noise, terrain, biomes and the voxel mesher. A direct port of the Go server,
// so a seed gives the same world here as in the Godot scenes.
export const CHUNK = 16, WORLD_H = 96, SEA = 30, FLOOR_Y = 12;
export const B = { Air: 0, Grass: 1, Dirt: 2, Stone: 3, Sand: 4, Snow: 5, Water: 6, Log: 7, Leaves: 8, BirchLog: 9, BirchLeaves: 10,
  Planks: 11, Plaster: 12, Cobble: 13, RoofTile: 14, Glass: 15, Gravel: 16, Farmland: 17, Crop: 18, Fence: 19, Lantern: 20,
  Flower: 21, DoorWood: 22, Hay: 23, RoofSlate: 24 };
export const BIOME_BLOCK = 40;

export function hash2(x, z, s) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(s, 0x9e3779b9)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
export const unit = h => h / 4294967295;

export function valueNoise(x, z, s) {
  const fx = Math.floor(x), fz = Math.floor(z), ix = fx | 0, iz = fz | 0;
  let tx = x - fx, tz = z - fz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const a = unit(hash2(ix, iz, s)), b = unit(hash2(ix + 1, iz, s));
  const c = unit(hash2(ix, iz + 1, s)), d = unit(hash2(ix + 1, iz + 1, s));
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function fbm(x, z, oct, s, lac = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x, z, (s + i * 131) >>> 0);
    norm += amp;
    amp *= gain;
    x *= lac;
    z *= lac;
  }
  return sum / norm;
}

export function height(seed, x, z) {
  const cont = fbm(x / 190, z / 190, 3, seed + 1);
  const hills = fbm(x / 52, z / 52, 4, seed + 2);
  const ridge = 1 - Math.abs(2 * fbm(x / 88, z / 88, 3, seed + 3) - 1);
  const mount = Math.max(0, cont - 0.52) * 5;
  const h = 27 + (cont - 0.42) * 34 + (hills - 0.5) * 16 + mount * mount * ridge * 15;
  return Math.trunc(Math.max(FLOOR_Y + 3, Math.min(WORLD_H - 12, h)));
}

const VS = CHUNK + 2;
const vi = (x, y, z) => ((x + 1) * VS + (z + 1)) * WORLD_H + y;

// One chunk's blocks plus a one-block margin, needed for ambient occlusion.
export function generateChunk(seed, cx, cz) {
  const b = new Uint8Array(VS * VS * WORLD_H), ox = cx * CHUNK, oz = cz * CHUNK;
  for (let lx = -1; lx <= CHUNK; lx++) for (let lz = -1; lz <= CHUNK; lz++) {
    const h = height(seed, ox + lx, oz + lz);
    let top = B.Grass;
    if (h <= SEA + 1) top = B.Sand; else if (h > 60) top = B.Snow; else if (h > 54) top = B.Stone;
    for (let y = 0; y <= h; y++) {
      let v = B.Stone;
      if (y === h) v = top;
      else if (y > h - 4 && top !== B.Stone && top !== B.Snow) v = top === B.Sand ? B.Sand : B.Dirt;
      b[vi(lx, y, lz)] = v;
    }
    for (let y = h + 1; y <= SEA; y++) b[vi(lx, y, lz)] = B.Water;
  }
  return { b, at: (x, y, z) => (y < 0 || y >= WORLD_H ? 0 : b[vi(x, y, z)]) };
}

export function fingerprint(chunk) {
  let h = 2166136261;
  const b = chunk.b;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619) >>> 0;
  return h;
}

const PALETTE = { 1: [.42, .60, .29], 2: [.50, .35, .23], 3: [.52, .53, .56], 4: [.87, .80, .58], 5: [.84, .87, .92], 6: [.16, .42, .78],
  7: [.36, .25, .15], 8: [.20, .47, .20], 11: [.71, .52, .31], 12: [.92, .87, .75], 13: [.45, .45, .46], 14: [.69, .28, .20],
  15: [.55, .80, .93], 16: [.67, .61, .51], 19: [.45, .32, .19], 22: [.30, .18, .10], 23: [.86, .72, .30], 24: [.30, .38, .52] };

export const BIOMES = [
  ['Deep ocean', [.09, .20, .45]], ['Ocean', [.16, .38, .68]], ['Beach', [.91, .84, .60]], ['Tundra', [.76, .82, .80]],
  ['Taiga', [.25, .45, .40]], ['Plains', [.56, .75, .36]], ['Forest', [.20, .55, .26]], ['Swamp', [.30, .42, .26]],
  ['Desert', [.93, .77, .43]], ['Savanna', [.77, .71, .32]], ['Jungle', [.07, .44, .20]], ['Mountain', [.50, .48, .47]], ['Snow peak', [.96, .97, 1]]];
BIOMES.forEach((b, i) => { PALETTE[BIOME_BLOCK + i] = b[1]; });
const LINEAR = {};
for (const k in PALETTE) LINEAR[k] = PALETTE[k].map(v => Math.pow(v, 2.2));

export const DEFAULT_LIMITS = { deep: .20, sea: .34, beach: .37, rock: .78, snow: .88 };
export function classify(h, t, m, L = DEFAULT_LIMITS) {
  if (h < L.deep) return 0;
  if (h < L.sea) return 1;
  if (h < L.beach) return 2;
  if (h > L.snow) return 12;
  if (h > L.rock) return 11;
  if (t < .36) return m < .5 ? 3 : 4;
  if (t < .64) return m < .36 ? 5 : m < .68 ? 6 : 7;
  return m < .36 ? 8 : m < .64 ? 9 : 10;
}
const clamp01 = v => Math.max(0, Math.min(1, v));
export const stretch = v => clamp01((v - .5) * 2.5 + .5);
export function climateAt(seed, x, z) {
  return [clamp01((fbm(x / 120, z / 120, 5, seed + 100) - .5) * 1.9 + .5),
    stretch(fbm(x / 210, z / 210, 3, seed + 200)), stretch(fbm(x / 170, z / 170, 4, seed + 300))];
}

// normal n and tangents u, v (clockwise in Godot; indices are flipped for three.js)
const FACES = [[[1,0,0],[0,0,1],[0,1,0]], [[-1,0,0],[0,1,0],[0,0,1]], [[0,1,0],[1,0,0],[0,0,1]],
  [[0,-1,0],[0,0,1],[1,0,0]], [[0,0,1],[0,1,0],[1,0,0]], [[0,0,-1],[1,0,0],[0,1,0]]];
const AO = [.48, .66, .84, 1];
const opaque = b => b !== 0 && b !== 6;

function emit(s, at, x, y, z, b, f, liquid) {
  const [n, u, v] = f;
  const bx = x + (n[0] > 0), by = y + (n[1] > 0), bz = z + (n[2] > 0);
  const tint = .94 + .12 * unit(hash2(x * 31 + y, z, b));
  const c = LINEAR[b] || LINEAR[3], first = s.pos.length / 3, ao = [0, 0, 0, 0];
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let k = 0; k < 4; k++) {
    const cu = corners[k][0], cv = corners[k][1], su = cu * 2 - 1, sv = cv * 2 - 1;
    const t = (a, d) => opaque(at(x + n[0] + a * u[0] + d * v[0], y + n[1] + a * u[1] + d * v[1], z + n[2] + a * u[2] + d * v[2]));
    const s1 = t(su, 0), s2 = t(0, sv), co = t(su, sv);
    ao[k] = s1 && s2 ? 0 : 3 - s1 - s2 - co;
    let py = by + cu * u[1] + cv * v[1];
    if (liquid && n[1] > 0) py -= .12;
    s.pos.push(bx + cu * u[0] + cv * v[0], py, bz + cu * u[2] + cv * v[2]);
    s.nrm.push(n[0], n[1], n[2]);
    const sh = Math.pow(AO[ao[k]] * tint, 2.2);
    s.col.push(c[0] * sh, c[1] * sh, c[2] * sh);
  }
  if (ao[0] + ao[2] >= ao[1] + ao[3]) s.idx.push(first, first + 2, first + 1, first, first + 3, first + 2);
  else s.idx.push(first + 1, first + 3, first + 2, first + 1, first, first + 3);
}

// Emits visible faces for [0,sx) x [y0,y1) x [0,sz). With walls, solid faces on
// the x/z boundary are always drawn, so a chunk reads as a solid slice.
export function mesh(at, sx, y0, y1, sz, walls) {
  const solid = { pos: [], nrm: [], col: [], idx: [] }, water = { pos: [], nrm: [], col: [], idx: [] };
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) for (let y = y0; y < y1; y++) {
    const b = at(x, y, z);
    if (!b) continue;
    for (const f of FACES) {
      const n = f[0], nx = x + n[0], ny = y + n[1], nz = z + n[2];
      const edge = nx < 0 || nz < 0 || nx >= sx || nz >= sz || ny < y0, nb = at(nx, ny, nz);
      if (b === 6) { if (nb === 0) emit(water, at, x, y, z, b, f, true); continue; }
      if (!opaque(nb) || (edge && walls)) emit(solid, at, x, y, z, b, f, false);
    }
  }
  return { solid, water };
}
