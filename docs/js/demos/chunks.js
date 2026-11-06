import { CHUNK, FLOOR_Y, WORLD_H, SEA, generateChunk, mesh, height } from '../core.js';
import { THREE, world, voxelGroup, mats, clear } from '../gfx.js';
import { seedOf } from '../util.js';

const LAP = 330, HALF_ANGLE = .87;

function planLap(seed) {
  const r0 = LAP / (2 * Math.PI), shape = (cx, cz, a) => {
    const k = r0 * (1 + .22 * Math.sin(2 * a + 1) + .12 * Math.sin(3 * a + 2.4));
    return [cx + k * Math.cos(a), cz + k * Math.sin(a) * .85];
  };
  let best = [0, 0], cost = Infinity;
  for (let cx = -480; cx <= 480; cx += 80) for (let cz = -480; cz <= 480; cz += 80) {
    let c = 0, prev = 0;
    for (let i = 0; i < 150; i++) {
      const [x, z] = shape(cx, cz, i / 150 * 6.283), h = height(seed, Math.floor(x), Math.floor(z));
      if (h <= SEA) c += 30;
      if (i) c += Math.max(0, Math.abs(h - prev) - 1) * 4;
      prev = h;
    }
    if (c < cost) { cost = c; best = [cx, cz]; }
  }
  const pts = [];
  for (let i = 0; i < 1320; i++) {
    const [x, z] = shape(best[0], best[1], i / 1320 * 6.28319);
    pts.push([x, Math.max(height(seed, Math.floor(x), Math.floor(z)), SEA) + 1, z]);
  }
  return { pts, center: best };
}

export default {
  id: 'chunks', nav: 'Chunks', title: 'Chunk loading',
  blurb: 'Only chunks near the player exist. New ones are generated on demand, nearest first, and whatever the player is looking at jumps the queue. Far chunks drop away. Drag to orbit.',
  params: [
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'radius', label: 'Render distance (chunks)', type: 'range', min: 2, max: 8, step: 1, value: 4 },
    { key: 'speed', label: 'Player speed (blocks/s)', type: 'range', min: 0, max: 30, step: .5, value: 11 },
    { key: 'rate', label: 'Load rate (chunks/s)', type: 'range', min: 2, max: 60, step: 1, value: 18 },
    { key: 'cone', label: 'Show view cone', type: 'check', value: true },
  ],
  create({ stage, readout, values }) {
    const w = world(stage, { fov: 50 }), root = new THREE.Group();
    w.scene.add(root);
    const player = new THREE.Group(), box = (s, c, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshLambertMaterial({ color: c })); m.position.y = y; player.add(m); };
    box([1.6, 2, 1], 0xe8622c, 3); box([1.3, 1.3, 1.3], 0xf0c9a0, 4.7); box([1.4, 2, 1], 0x27406b, 1);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 70), new THREE.MeshBasicMaterial({ color: 0xff8c33, transparent: true, opacity: .55 }));
    beam.position.y = 38;
    player.add(beam);
    w.scene.add(player);
    const cone = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x4de6ff, transparent: true, opacity: .16, side: THREE.DoubleSide, depthTest: false }));
    w.scene.add(cone);
    function shapeCone() {
      const reach = values.radius * CHUNK, v = [0, 0, 0], idx = [];
      for (let i = 0; i <= 18; i++) { const a = -HALF_ANGLE + 2 * HALF_ANGLE * i / 18; v.push(Math.sin(a) * reach, 0, -Math.cos(a) * reach); if (i < 18) idx.push(0, i + 1, i + 2); }
      cone.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      cone.geometry.setIndex(idx);
    }
    let seed, lap, chunks, dist = 0, tokens = 0, loaded = 0, spent = 0, pos = [0, 0, 0], yaw = 0;
    function reset() {
      clear(root);
      seed = seedOf(values.seed);
      lap = planLap(seed);
      chunks = new Map();
      dist = 0;
      loaded = 0;
      w.orbit.target.set(lap.center[0], 30, lap.center[1]);
      w.camera.position.set(lap.center[0], 225, lap.center[1] + 170);
    }
    const at = d => { const n = lap.pts.length, f = (((d / LAP) % 1 + 1) % 1) * n, i = Math.floor(f) % n, a = lap.pts[i], b = lap.pts[(i + 1) % n], k = f - Math.floor(f); return a.map((v, j) => v + (b[j] - v) * k); };
    const inView = (x, z) => {
      const dx = (x + .5) * CHUNK - pos[0], dz = (z + .5) * CHUNK - pos[2], d = Math.hypot(dx, dz);
      if (d < CHUNK) return true;
      if (d > values.radius * CHUNK + CHUNK) return false;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      return ang < HALF_ANGLE + Math.asin(Math.min(1, CHUNK * .7 / d));
    };
    function stream(dt) {
      const cx = Math.floor(pos[0] / CHUNK), cz = Math.floor(pos[2] / CHUNK), R = values.radius, want = [];
      for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
        if (x * x + z * z > R * R) continue;
        const k = `${cx + x},${cz + z}`;
        if (!chunks.has(k)) want.push([cx + x, cz + z, Math.hypot(x, z) - (inView(cx + x, cz + z) ? 2.5 : 0)]);
      }
      want.sort((a, b) => a[2] - b[2]);
      tokens = Math.min(tokens + values.rate * dt, 6);
      for (const [x, z] of want) {
        if (tokens < 1) break;
        tokens--;
        const c = generateChunk(seed, x, z), g = voxelGroup(mesh(c.at, CHUNK, FLOOR_Y, WORLD_H, CHUNK, true));
        g.position.set(x * CHUNK, -30, z * CHUNK);
        root.add(g);
        chunks.set(`${x},${z}`, { x, z, g, age: 0, dying: false });
        loaded++;
      }
      for (const [k, c] of chunks) {
        c.age += dt;
        if (!c.dying && Math.hypot(c.x - cx, c.z - cz) > R + 1.5) { c.dying = true; c.age = 0; }
        if (c.dying) {
          c.g.position.y = -c.age * c.age * 90;
          if (c.age > .6) { clear(c.g); root.remove(c.g); chunks.delete(k); }
        } else {
          c.g.position.y = -30 * (1 - Math.min(c.age / .55, 1)) ** 3;
          if (c.g.children[0]) c.g.children[0].material = inView(c.x, c.z) ? mats.solid : mats.dim;
        }
      }
      return want.length;
    }
    shapeCone();
    reset();
    return {
      change(k) { if (k === 'seed') reset(); if (k === 'radius') shapeCone(); },
      update(dt) {
        dist += values.speed * dt;
        pos = at(dist);
        const a = at(dist - 4), b = at(dist + 4);
        yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
        const queued = stream(dt);
        player.position.set(...pos);
        player.rotation.y = yaw;
        cone.visible = values.cone;
        cone.position.set(pos[0], 62, pos[2]);
        cone.rotation.y = yaw;
        if ((spent += dt) > .2) {
          spent = 0;
          readout.innerHTML = `Loaded <b>${chunks.size}</b> · queued <b>${queued}</b><br>Generated so far <b>${loaded}</b><br>Chunk <b class="mono">${Math.floor(pos[0] / 16)}, ${Math.floor(pos[2] / 16)}</b>`;
        }
        w.orbit.update();
        w.render();
      },
      dispose() { w.dispose(); },
    };
  },
};
