import { mesh } from '../core.js';
import { buildTiles, solveVillage, KINDS, CW, CH } from '../wfc.js';
import { THREE, world, voxelGroup, clear } from '../gfx.js';
import { seedOf } from '../util.js';

const heat = f => new THREE.Color('#ffcf4a').lerp(new THREE.Color('#ff5a7a'), Math.min(f * 2, 1)).lerp(new THREE.Color('#5a6cff'), Math.max(f * 2 - 1, 0));

export default {
  id: 'wfc', nav: 'WFC', title: 'Wave Function Collapse',
  blurb: 'Flat tiles are undecided cells: size and colour show the options left. Each step decides one cell, and the rules spread to its neighbours. Three rules: doors face a path, paths connect, each house gets its own roof.',
  params: [
    { type: 'buttons', items: [{ label: 'Build again', action: 'build' }, { label: 'New seed', action: 'seed' }, { label: 'Pause', action: 'pause' }] },
    { key: 'speed', label: 'Build speed', type: 'range', min: 0, max: 6, step: .05, value: 1, format: v => v.toFixed(2) + '×' },
    { key: 'seed', label: 'Seed', type: 'text', value: '7' },
    { key: 'grid', label: 'Grid size', type: 'range', min: 5, max: 13, step: 2, value: 7 },
    { key: 'density', label: 'Building density', type: 'range', min: .1, max: 3, step: .05, value: 1 },
    { key: 'roads', label: 'Road density', type: 'range', min: .1, max: 3, step: .05, value: 1 },
    ...KINDS.map(k => ({ key: k.key, label: k.label, type: 'check', value: true })),
    { key: 'stall', label: 'Market stall', type: 'check', value: true },
  ],
  create({ stage, readout, values }) {
    const w = world(stage, { fov: 38 }), root = new THREE.Group();
    w.scene.add(root);
    w.orbit.autoRotate = true;
    w.orbit.autoRotateSpeed = .5;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), new THREE.MeshLambertMaterial({ color: 0x5b4030 }));
    base.position.y = -5;
    base.receiveShadow = true;
    w.scene.add(base);
    let tr, opts, meshes, placed, drops, stepI, clock, floor, pulse, paused = false, maxO = 1;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const cellPos = c => { const G = tr.G; return [(c % G) * CW, ((c / (G * G)) | 0) * CH, (((c / G) | 0) % G) * CW]; };
    function place(c, t) {
      if (!t || placed.has(c)) return;
      if (!meshes[t]) meshes[t] = mesh(tr.tiles[t].vox ? tr.tiles[t].vox.at : () => 0, CW, 0, CH, CW, false);
      const g = voxelGroup(meshes[t]), [x, y, z] = cellPos(c);
      g.position.set(x, y + 26, z);
      root.add(g);
      placed.set(c, g);
      drops.push({ g, y, t: 0 });
    }
    function build() {
      clear(root);
      if (floor) { w.scene.remove(floor); floor.dispose(); }
      const on = {};
      [...KINDS.map(k => k.key), 'stall'].forEach(k => { on[k] = values[k]; });
      const tiles = buildTiles(on);
      tr = solveVillage(tiles, seedOf(values.seed), values.grid, { density: values.density, roads: values.roads, candidates: values.grid > 9 ? 8 : 30 });
      if (!tr) { readout.innerHTML = '<b class="bad">No solution</b><br>Try another seed or enable more buildings.'; return; }
      const G = tr.G, size = G * CW, c = size / 2;
      opts = tr.initial.slice();
      maxO = Math.max(...opts);
      pulse = new Float32Array(opts.length);
      meshes = [];
      placed = new Map();
      drops = [];
      stepI = 0;
      clock = -.6;
      base.scale.set(size + 4, 1, size + 4);
      base.position.set(c, -5, c);
      w.orbit.target.set(c, 6, c);
      w.camera.position.set(c + size * 1.1, size * 1.15, c + size * 1.35);
      floor = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .2, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: .8 }), G * G);
      floor.frustumCulled = false;
      w.scene.add(floor);
      tr.initialR.forEach(([cell, t]) => place(cell, t));
      report();
    }
    function report() {
      const undecided = opts.filter(o => o > 1).length, total = tr.tiles.length - 1;
      readout.innerHTML = `Step <b>${stepI}</b> of <b>${tr.steps.length}</b><br>Undecided cells <b>${undecided}</b><br>Tile types <b>${total}</b> · backtracks <b>${tr.backtracks}</b><br>Doors on the road network <b>${tr.doors}</b>`;
    }
    function apply(s) {
      for (const [c, n] of s.d) {
        opts[c] = n;
        pulse[c] = 1;
        if (n > 1 && placed.has(c)) { const g = placed.get(c); clear(g); root.remove(g); placed.delete(c); }
      }
      for (const [c, t] of s.r) place(c, t);
      report();
    }
    build();
    return {
      change(k, v) {
        if (k === 'speed') return;
        if (k === 'action') {
          if (v === 'pause') {
            paused = !paused;
            const b = document.querySelector('[data-action=pause]');
            if (b) b.textContent = paused ? 'Resume' : 'Pause';
            return;
          }
          if (v === 'seed') { values.seed = String(Math.floor(Math.random() * 1e5)); document.getElementById('p-seed').value = values.seed; }
        }
        build();
      },
      update(dt) {
        if (tr) {
          const rate = dt * (paused ? 0 : values.speed);
          clock += rate;
          const per = 18 / Math.max(tr.steps.length, 1);
          while (clock >= per && stepI < tr.steps.length) { clock -= per; apply(tr.steps[stepI++]); }
          drops = drops.filter(e => {
            e.t = Math.min(1, e.t + dt * 2.8 * Math.max(paused ? 0 : values.speed, .05));
            e.g.position.y = e.y + 26 * (1 - e.t) ** 2;
            return e.t < 1;
          });
          const G2 = tr.G * tr.G, lm = Math.log(maxO);
          for (let c = 0; c < G2; c++) {
            pulse[c] = Math.max(0, pulse[c] - dt * 2.6);
            const o = opts[c], [x, , z] = cellPos(c);
            const f = o > 1 ? Math.log(o) / lm : 0, s = o > 1 ? CW * (.45 + .47 * f) : 0;
            m4.compose(new THREE.Vector3(x + CW / 2, .12, z + CW / 2), q, new THREE.Vector3(s, 1, s));
            floor.setMatrixAt(c, m4);
            floor.setColorAt(c, col.copy(heat(f)).lerp(new THREE.Color(0xffffff), pulse[c] * .7));
          }
          floor.instanceMatrix.needsUpdate = true;
          if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
        }
        w.orbit.update();
        w.render();
      },
      dispose() { w.dispose(); },
    };
  },
};
