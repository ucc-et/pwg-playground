import { BIOME_BLOCK, BIOMES, B, WORLD_H, classify, climateAt, fbm, hash2, unit, valueNoise, mesh } from '../core.js';
import { buildTiles, solveVillage, CW, CH } from '../wfc.js';
import { THREE, world, voxelGroup } from '../gfx.js';
import { ease, overlay, seedOf, yieldFrame } from '../util.js';

const STEPS = ['Seed', 'Noise', 'Octaves', 'Biomes', 'Chunks', 'Caves', 'WFC'];
const TIMES = [3, 6, 10, 4.5, 7, 8, 8, 1e9];
const N = 7, W = N * 16, SEA_Y = 44, SCALE = 2.2, MAP = 224, CAVE_TOP = 46;
const idx = (x, y, z) => (x * W + z) * WORLD_H + y;

function column(s, ox, oz, x, z) {
  const [h, t, m] = climateAt(s, (ox + x) * SCALE, (oz + z) * SCALE);
  const d = Math.max(Math.abs(x - W / 2), Math.abs(z - W / 2));
  let k = Math.max(0, Math.min(1, (d - 27) / 14));
  k = k * k * (3 - 2 * k);
  const hh = .52 + (h - .52) * k;
  return { top: Math.round(SEA_Y + (hh - .36) * 48), id: k === 0 ? 5 : classify(hh, t, m), h: hh };
}

function findIsland(s) {
  let best = -1, b = [0, 0];
  for (let ox = 0; ox < 1600; ox += 80) for (let oz = 0; oz < 1600; oz += 80) {
    const seen = new Set();
    let sc = 0;
    for (let x = 0; x < W; x += 8) for (let z = 0; z < W; z += 8) {
      const id = classify(...climateAt(s, (ox + x) * SCALE, (oz + z) * SCALE));
      if (!seen.has(id)) { seen.add(id); sc += 12; }
      if (id > 2) sc++;
    }
    if (sc > best) { best = sc; b = [ox, oz]; }
  }
  return b;
}

// The 2D cave rule in 3D: 26 neighbours. x and z wrap so caves reach the walls.
function caves3D(s, fill) {
  const H = CAVE_TOP, at = (x, y, z) => (x * W + z) * H + y;
  let cur = new Uint8Array(W * W * H);
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 0; y < H; y++) cur[at(x, y, z)] = unit(hash2(x + y * 977, z, s + 500)) < fill ? 1 : 0;
  for (let p = 0; p < 4; p++) {
    const next = new Uint8Array(cur.length);
    for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 0; y < H; y++) {
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) { const a = (x + dx + W) % W;
        for (let dz = -1; dz <= 1; dz++) { const c = (z + dz + W) % W;
          for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy && !dz) continue;
            const b = y + dy;
            if (b < 0 || b >= H || cur[at(a, b, c)]) n++;
          } } }
      next[at(x, y, z)] = n >= 14 || (n === 13 && cur[at(x, y, z)]) ? 1 : 0;
    }
    cur = next;
  }
  return cur;
}

const VERT = `
uniform sampler2D mapA, mapB; uniform vec2 shift; uniform float blend, relief, biomeMix;
varying float h; varying float diff; varying vec3 wp; varying vec2 vUv;
void main() {
  vUv = uv;
  float a = texture2D(mapA, fract(uv + shift)).r, b = texture2D(mapB, uv).r;
  h = mix(a, b, blend); diff = abs(b - a);
  vec3 p = position;
  p.y += (mix(h, max(h, .36), biomeMix) - .36) * relief * 48.;
  wp = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;
const FRAG = `
uniform sampler2D biome; uniform float biomeMix, glow, alpha, grid; uniform float cells[49];
varying float h; varying float diff; varying vec3 wp; varying vec2 vUv;
vec3 ramp(float v) {
  vec3 c = mix(vec3(.09,.20,.45), vec3(.16,.38,.68), smoothstep(.18,.22,v));
  c = mix(c, vec3(.91,.84,.60), smoothstep(.33,.35,v));
  c = mix(c, vec3(.42,.62,.32), smoothstep(.36,.38,v));
  c = mix(c, vec3(.50,.48,.47), smoothstep(.77,.79,v));
  return mix(c, vec3(.96,.97,1.), smoothstep(.87,.89,v));
}
void main() {
  if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233))) * 43758.5453) > alpha) discard;
  vec2 cp = vUv * 7.;
  ivec2 cell = ivec2(min(floor(cp), vec2(6.)));
  if (cells[cell.x * 7 + cell.y] > .5) discard; // this chunk is now real blocks
  vec3 n = normalize(cross(dFdx(wp), dFdy(wp))); n *= sign(n.y);
  float light = .4 + .7 * clamp(dot(n, normalize(vec3(-.5,.75,.45))), 0., 1.);
  vec3 c = mix(ramp(h), texture2D(biome, vUv).rgb, biomeMix) * light;
  vec2 edge = abs(fract(cp + .5) - .5) / fwidth(cp);
  c = mix(c, vec3(1.), (1. - clamp(min(edge.x, edge.y) - .5, 0., 1.)) * grid * .85);
  gl_FragColor = vec4(mix(c, vec3(1.,.55,.1), clamp(diff*7.,0.,1.)*glow), 1.);
  #include <colorspace_fragment>
}`;

export default {
  id: 'finale', nav: 'From seed to world', title: 'From seed to world',
  blurb: 'All the steps in one world. A number becomes noise, octaves add detail, climate adds biomes, chunks lift it into 3D, caves hollow it out, and WFC builds a village. Click a step to jump to it.',
  params: [
    { type: 'buttons', items: [{ label: 'Pause', action: 'pause' }, { label: 'Replay', action: 'replay' }, { label: 'New seed', action: 'seed' }] },
    { key: 'speed', label: 'Playback speed', type: 'range', min: .25, max: 3, step: .05, value: 1, format: v => v.toFixed(2) + '×' },
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'caves', label: 'Cave amount', type: 'range', min: .48, max: .56, step: .005, value: .505, format: v => Math.round((.56 - v) / .08 * 100) + '%' },
  ],
  create({ stage, readout, values }) {
    const w = world(stage, { fov: 40 }), root = new THREE.Group(), village = new THREE.Group();
    w.scene.add(root, village);
    w.orbit.enabled = false;
    const status = overlay(stage, 'status', 'Building world…');
    const seedText = overlay(stage, 'status', '');
    seedText.style.cssText = 'font-size:min(14vw,120px);color:#fff;font-weight:600';
    const timeline = overlay(stage, 'timeline');
    const card = overlay(stage, 'card', '<b id="oct-name"></b><canvas width="224" height="224"></canvas><div id="oct-note" style="color:#ffb03a"></div>');
    card.style.display = 'none';
    const buttons = STEPS.map((s, i) => {
      const b = document.createElement('button');
      b.textContent = s;
      b.onclick = () => { clock = TIMES.slice(0, i).reduce((a, c) => a + c, 0) + .01; paused = false; };
      timeline.append(b);
      return b;
    });
    let clock = 0, ready = false, paused = false, token = 0, chunks = [], tiles = [], maps = [], isoImgs = [], plane = null, shown = -1;
    const uni = { mapA: { value: null }, mapB: { value: null }, biome: { value: null }, shift: { value: new THREE.Vector2() },
      blend: { value: 0 }, relief: { value: 1 }, biomeMix: { value: 0 }, glow: { value: 0 }, alpha: { value: 1 }, grid: { value: 0 }, cells: { value: new Float32Array(49) } };
    const tex = (data, fmt) => { const t = new THREE.DataTexture(data, MAP, MAP, fmt); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };

    async function build() {
      const my = ++token;
      ready = false;
      clock = 0;
      status.textContent = 'Building world…';
      for (const o of [root, village]) { o.traverse(c => c.geometry?.dispose()); o.clear(); }
      if (plane) { w.scene.remove(plane); plane.geometry.dispose(); plane = null; }
      await yieldFrame();
      const s = seedOf(values.seed), [ox, oz] = findIsland(s), rock = caves3D(s, values.caves);
      if (my !== token) return;
      await yieldFrame();
      const solid = new Uint8Array(W * W * WORLD_H), carved = new Uint8Array(W * W * WORLD_H);
      for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
        const { top: t0, id } = column(s, ox, oz, x, z), top = Math.min(t0, WORLD_H - 2), land = top >= SEA_Y;
        for (let y = 0; y <= top; y++) {
          let b = B.Stone;
          if (y === top && land) b = BIOME_BLOCK + id;
          else if (y === top || (!land && y > top - 3)) b = B.Sand;
          else if (y > top - 4) b = B.Dirt;
          solid[idx(x, y, z)] = b;
          carved[idx(x, y, z)] = y >= 3 && y < CAVE_TOP && y < top - 5 && !rock[(x * W + z) * CAVE_TOP + y] ? 0 : b;
        }
        for (let y = top + 1; y < SEA_Y; y++) solid[idx(x, y, z)] = carved[idx(x, y, z)] = B.Water;
      }
      // maps: octaves 1-5, static, final height, biome colours
      const step = W / MAP, grey = f => { const d = new Uint8Array(MAP * MAP * 4); for (let i = 0; i < MAP * MAP; i++) { const v = f(i) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } return d; };
      const px = i => (ox + (i % MAP) * step) * SCALE, pz = i => (oz + ((i / MAP) | 0) * step) * SCALE;
      const stretch = v => Math.max(0, Math.min(1, (v - .5) * 1.9 + .5));
      maps = [];
      for (let k = 1; k <= 5; k++) maps.push(tex(grey(i => stretch(fbm(px(i) / 120, pz(i) / 120, k, s + 100))), THREE.RGBAFormat));
      maps.push(tex(grey(i => unit(hash2(i % MAP, (i / MAP) | 0, s + 600))), THREE.RGBAFormat));
      maps.push(tex(grey(i => column(s, ox, oz, (i % MAP) * step, ((i / MAP) | 0) * step).h), THREE.RGBAFormat));
      const bio = new Uint8Array(MAP * MAP * 4);
      for (let i = 0; i < MAP * MAP; i++) {
        const c = BIOMES[column(s, ox, oz, (i % MAP) * step, ((i / MAP) | 0) * step).id][1];
        bio.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4);
      }
      const bt = tex(bio, THREE.RGBAFormat);
      bt.magFilter = bt.minFilter = THREE.NearestFilter;
      bt.colorSpace = THREE.SRGBColorSpace;
      uni.biome.value = bt;
      isoImgs = [2, 3, 4, 5].map(k => {
        const f = 2.03 ** (k - 1);
        return new ImageData(new Uint8ClampedArray(grey(i => valueNoise(px(i) / 120 * f, pz(i) / 120 * f, s + 100 + (k - 1) * 131)).buffer), MAP, MAP);
      });
      const g = new THREE.PlaneGeometry(W, W, MAP - 1, MAP - 1);
      g.rotateX(-Math.PI / 2);
      const P = g.attributes.position, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) / W + .5, P.getZ(i) / W + .5);
      plane = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uni, side: THREE.DoubleSide }));
      plane.frustumCulled = false;
      plane.position.set(W / 2, 45, W / 2);
      w.scene.add(plane);
      chunks = [];
      for (let cx = 0; cx < N; cx++) for (let cz = 0; cz < N; cz++) {
        const view = (b, ox2, oz2) => (x, y, z) => { x += ox2; z += oz2; return x < 0 || z < 0 || x >= W || z >= W || y < 0 || y >= WORLD_H ? 0 : b[idx(x, y, z)]; };
        const a = voxelGroup(mesh(view(solid, cx * 16, cz * 16), 16, 0, WORLD_H, 16, true));
        const b = voxelGroup(mesh(view(carved, cx * 16, cz * 16), 16, 0, WORLD_H, 16, true));
        const r = new THREE.Group();
        r.add(a, b);
        root.add(r);
        chunks.push({ cx, cz, r, a, b });
        status.textContent = `Building world… ${Math.round(chunks.length / 49 * 100)}%`;
        await yieldFrame();
        if (my !== token) return;
      }
      const tileSet = buildTiles(), tr = solveVillage(tileSet, 7, 7), top = column(s, ox, oz, W / 2, W / 2).top;
      tiles = [];
      const origin = (W - 7 * CW) / 2, order = [...tr.initialR, ...tr.steps.flatMap(st => st.r)].filter(p => p[1]);
      const cache = [];
      for (const [c, t] of order) {
        cache[t] ||= mesh(tileSet[t].vox.at, CW, 0, CH, CW, false);
        const n = voxelGroup(cache[t]), to = [origin + (c % 7) * CW, top + .03 + ((c / 49) | 0) * CH, origin + (((c / 7) | 0) % 7) * CW];
        n.position.set(...to);
        n.visible = false;
        village.add(n);
        tiles.push({ n, y: to[1] });
      }
      status.textContent = '';
      ready = true;
    }

    const orbit = (a, y = 150, r = 182) => new THREE.Vector3(56 + Math.sin(a) * r, y, 56 + Math.cos(a) * r);
    const A = .68, LOOK = new THREE.Vector3(56, 20, 56), CENTER = new THREE.Vector3(56, 46, 56);
    function pose(st, t) {
      const top = new THREE.Vector3(56, 236, 56.01), front = new THREE.Vector3(56, 62, 250), fl = new THREE.Vector3(56, 34, 60);
      let p = top, l = CENTER;
      if (st === 1) p = top.clone().lerp(orbit(A - .5), ease(t * 1.6));
      else if (st === 2) p = orbit(A - .5 + t * .3);
      else if (st === 3) p = orbit(A - .2 + t * .1);
      else if (st === 4) { p = orbit(A - .1 + t * .1); l = CENTER.clone().lerp(LOOK, ease(t * 1.4)); }
      else if (st === 5) {
        const k = ease(t * 5), b = ease((t - .82) * 5.5);
        p = orbit(A).lerp(front, k).lerp(orbit(A), b);
        l = LOOK.clone().lerp(fl, k).lerp(LOOK, b);
      } else if (st === 6) { p = orbit(A + t * .5); l = LOOK; }
      else if (st > 6) { p = orbit(A + .5 + t); l = LOOK; }
      w.camera.position.copy(p);
      w.camera.up.set(0, 1, 0);
      if (st === 0) w.camera.up.set(0, 0, -1);
      w.camera.lookAt(l);
    }
    function scene(st, t) {
      let a = 1, from = 0, to = 0, blend = 0, relief = 1, glow = 0, biome = 0;
      uni.shift.value.set(0, 0);
      if (st === 0) a = 0;
      else if (st === 1) {
        a = ease(t * 6); from = 5; blend = ease((t - .55) / .35); relief = ease((t - .2) / .3);
        if (t < .55) uni.shift.value.set(Math.random(), Math.random());
      } else if (st === 2) {
        const f = t * 4;
        from = Math.min(Math.floor(f), 3); to = from + 1;
        const k = f - from;
        blend = ease(k / .7); glow = Math.sin(Math.min(k / .85, 1) * Math.PI);
      } else if (st === 3) { from = 4; to = 6; blend = ease(t * 1.6); biome = blend; }
      else if (st === 4) { from = to = 6; biome = 1; }
      else a = 0;
      plane.visible = a > 0;
      uni.mapA.value = maps[from];
      uni.mapB.value = maps[st === 1 ? 0 : to];
      Object.assign(uni.blend, { value: blend });
      uni.alpha.value = a; uni.relief.value = relief; uni.glow.value = glow; uni.biomeMix.value = biome;
      uni.grid.value = st === 4 ? ease(t / .14) : 0;
      // The map is cut into chunks first, then each one is swapped for blocks where it lies.
      const rise = st < 4 ? 0 : st === 4 ? (t - .2) / .72 : 1, cut = st === 5 ? ease(t * 5 - .3) * (1 - ease((t - .82) * 6)) : 0;
      const hollow = st > 5 || (st === 5 && t > .04);
      for (const c of chunks) {
        const ring = Math.hypot(c.cx - 3, c.cz - 3) / 4.3 + unit(hash2(c.cx, c.cz, 7)) * .1;
        const k = Math.max(0, Math.min(1, (rise * 1.4 - ring) / .3));
        c.r.visible = k > 0;
        uni.cells.value[c.cx * 7 + c.cz] = k > 0 ? 1 : 0;
        c.r.position.set(c.cx * 16, 16 * (1 - k) ** 3 - (c.cz >= 4 ? 130 * cut : 0), c.cz * 16);
        c.a.visible = !hollow;
        c.b.visible = hollow;
      }
      const f = st < 6 ? 0 : st === 6 ? t / .85 : 2;
      tiles.forEach((e, i) => {
        const k = Math.max(0, Math.min(1, (f * tiles.length - i) / 5));
        e.n.visible = k > 0;
        e.n.position.y = e.y + 30 * (1 - k) ** 2;
      });
      seedText.textContent = st === 0 ? values.seed : '';
      seedText.style.opacity = st === 0 ? ease(t * 3) * (1 - ease((t - .8) * 5)) : 0;
      card.style.display = st === 2 ? '' : 'none';
      if (st === 2) {
        const i = Math.min(Math.floor(t * 4), 3);
        if (i !== shown) {
          shown = i;
          card.querySelector('canvas').getContext('2d').putImageData(isoImgs[i], 0, 0);
          card.querySelector('#oct-name').textContent = `+ Octave ${i + 2}`;
          card.querySelector('#oct-note').textContent = `${2 ** (i + 1)}× finer, 1/${2 ** (i + 1)} the height`;
        }
      } else shown = -1;
      buttons.forEach((b, i) => { b.className = i === st ? 'now' : i < st ? 'on' : ''; });
    }
    build();
    return {
      change(k, v) {
        if (k === 'speed') return;
        if (k === 'action') {
          if (v === 'pause') {
            paused = !paused;
            const b = document.querySelector('[data-action=pause]');
            if (b) b.textContent = paused ? 'Play' : 'Pause';
          } else if (v === 'replay') { clock = 0; paused = false; }
          else { values.seed = String(Math.floor(Math.random() * 1e5)); document.getElementById('p-seed').value = values.seed; build(); }
          return;
        }
        build();
      },
      update(dt) {
        if (ready) {
          if (!paused) clock += dt * values.speed;
          let t = clock, st = 0;
          while (t >= TIMES[st]) t -= TIMES[st++];
          const end = st === 7 ? (t / 9) % 6.283 : t / TIMES[st];
          scene(st, st === 7 ? 1 : end);
          pose(st, end);
        }
        w.render();
      },
      dispose() { token++; w.dispose(); },
    };
  },
};
