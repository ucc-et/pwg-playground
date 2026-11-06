import { CHUNK, FLOOR_Y, WORLD_H, generateChunk, fingerprint, mesh } from '../core.js';
import { THREE, world, voxelGroup, clear } from '../gfx.js';
import { seedOf, overlay } from '../util.js';

export default {
  id: 'seed', nav: 'Seed', title: 'Same seed, same world',
  blurb: 'Every block comes from the seed, so equal seeds must build equal worlds. Each world is hashed block by block: matching fingerprints are the proof. Text works as a seed too.',
  params: [
    { key: 'left', label: 'Left seed', type: 'text', value: '1337' },
    { key: 'right', label: 'Right seed', type: 'text', value: '1337' },
    { key: 'radius', label: 'World radius (chunks)', type: 'range', min: 1, max: 4, step: 1, value: 3 },
    { type: 'buttons', items: [{ label: 'Random right seed', action: 'random' }, { label: 'Match seeds', action: 'match' }] },
  ],
  create({ stage, readout, values }) {
    const w = world(stage, { ortho: 190 });
    w.camera.position.set(0, 190, 240);
    w.orbit.target.set(0, 26, 0);
    const sides = [{ key: 'left' }, { key: 'right' }].map((s, i) => {
      s.group = new THREE.Group();
      w.scene.add(s.group);
      s.index = i;
      s.queue = [];
      s.fp = 0;
      s.todo = 1;
      return s;
    });
    const status = overlay(stage, '', '');
    status.style.cssText = 'left:0;right:0;bottom:14px;text-align:center;font-size:20px;font-weight:600';

    function build(s) {
      clear(s.group);
      const R = values.radius, n = 2 * R + 1;
      s.seed = seedOf(values[s.key]);
      s.fp = 0;
      s.todo = n * n;
      s.rising = [];
      s.queue = [];
      for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) s.queue.push([x, z]);
      s.queue.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
      s.group.position.set((s.index * 2 - 1) * (R * 16 + 12 + 8), 0, 0);
      report();
    }
    function report() {
      const [a, b] = sides, done = !a.todo && !b.todo, same = a.fp === b.fp;
      const hex = s => (s.todo ? '…' : s.fp.toString(16).toUpperCase().padStart(8, '0'));
      readout.innerHTML = `Left fingerprint<br><b class="mono">${hex(a)}</b><br>Right fingerprint<br><b class="mono">${hex(b)}</b>`;
      status.textContent = done ? (same ? 'Identical worlds' : 'Different worlds') : '';
      status.style.color = same ? '#6fe08a' : '#ff6b6b';
    }
    sides.forEach(build);
    return {
      change(k, v) {
        if (k === 'action') {
          if (v === 'random') values.right = String(Math.floor(Math.random() * 1e6));
          else values.right = values.left;
          document.getElementById('p-right').value = values.right;
          build(sides[1]);
        } else if (k === 'radius') sides.forEach(build);
        else build(sides.find(s => s.key === k));
      },
      update(dt) {
        const R = values.radius;
        for (const s of sides) {
          for (let i = 0; i < 4 && s.queue.length; i++) {
            const [x, z] = s.queue.shift(), c = generateChunk(s.seed, x, z);
            const g = voxelGroup(mesh(c.at, CHUNK, FLOOR_Y, WORLD_H, CHUNK, true));
            const to = (x * CHUNK) - 8, tz = (z * CHUNK) - 8;
            g.position.set(to, -60, tz);
            s.group.add(g);
            s.rising.push({ g, t: 0 });
            const slot = (x + R) * (2 * R + 1) + z + R;
            s.fp = (s.fp + Math.imul(fingerprint(c), slot * 2 + 1)) >>> 0;
            if (--s.todo === 0) report();
          }
          s.rising = s.rising.filter(e => {
            e.t = Math.min(1, e.t + dt * 2);
            e.g.position.y = -60 * (1 - e.t) ** 3;
            return e.t < 1;
          });
        }
        w.orbit.update();
        w.render();
      },
      dispose() { w.dispose(); },
    };
  },
};
