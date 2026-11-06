import { caveFrames, regions } from '../caves.js';
import { canvas2d, debounce, seedOf } from '../util.js';

export default {
  id: 'caves', nav: 'Caves', title: 'Caves with cellular automata',
  blurb: 'Random cells are smoothed: every cell looks at its 8 neighbours and all update at once. Static clumps into caverns. Tiny specks are cleared, then tunnels connect what remains.',
  params: [
    { type: 'buttons', items: [{ label: 'Next step', action: 'next' }, { label: 'Play', action: 'play' }, { label: 'Restart', action: 'restart' }] },
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'size', label: 'Grid width', type: 'range', min: 40, max: 200, step: 10, value: 80 },
    { key: 'fill', label: 'Starting walls', type: 'range', min: .3, max: .7, step: .005, value: .49, format: v => Math.round(v * 1000) / 10 + '%' },
    { key: 'steps', label: 'Smoothing steps', type: 'range', min: 0, max: 12, step: 1, value: 5 },
    { key: 'birth', label: 'Wall if neighbours ≥', type: 'range', min: 3, max: 8, step: 1, value: 5 },
    { key: 'death', label: 'Open if neighbours ≤', type: 'range', min: 0, max: 5, step: 1, value: 3 },
    { key: 'minSize', label: 'Smallest cave kept', type: 'range', min: 1, max: 100, step: 1, value: 12 },
    { key: 'pace', label: 'Play speed (s per step)', type: 'range', min: .2, max: 3, step: .1, value: 1.2 },
  ],
  create({ stage, readout, values }) {
    let W = 0, H = 0, frames = [], i = 0, playing = false, timer = 0, flash = 0;
    function build() {
      W = values.size;
      H = Math.round(W * .625);
      frames = caveFrames(seedOf(values.seed), W, H, { steps: values.steps, fill: values.fill, birth: values.birth, death: values.death, minSize: values.minSize });
      i = Math.min(i, frames.length - 1);
      info();
    }
    function info() {
      const f = frames[i], prev = frames[i - 1];
      let changed = 0, open = 0;
      f.grid.forEach((v, k) => { if (!v) open++; if (prev && prev.grid[k] !== v) changed++; });
      const caves = regions(f.grid, W, H).sizes.length - 1;
      readout.innerHTML = `<b>${f.label}</b><br>Step ${i} of ${frames.length - 1}<br>${changed} cells changed<br>${Math.round(open / (W * H) * 100)}% open · ${caves} separate cave${caves === 1 ? '' : 's'}`;
    }
    const c = canvas2d(stage, draw);
    function draw(g, sw, sh) {
      g.fillStyle = '#1b222a';
      g.fillRect(0, 0, sw, sh);
      const cell = Math.max(1, Math.min((sw - 32) / W, (sh - 32) / H)), ox = (sw - cell * W) / 2, oy = (sh - cell * H) / 2;
      const f = frames[i].grid, p = frames[i - 1]?.grid;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        g.fillStyle = f[k] ? '#5a606c' : '#12161c';
        g.fillRect(ox + x * cell, oy + y * cell, cell + .5, cell + .5);
        if (p && p[k] !== f[k] && flash > 0) {
          g.globalAlpha = flash;
          g.fillStyle = f[k] ? '#ff9a3c' : '#49d2ff';
          g.fillRect(ox + x * cell, oy + y * cell, cell + .5, cell + .5);
          g.globalAlpha = 1;
        }
      }
    }
    function step() {
      if (i >= frames.length - 1) { playing = false; label(); return; }
      i++;
      flash = 1;
      info();
    }
    const label = () => { const b = document.querySelector('[data-action=play]'); if (b) b.textContent = playing ? 'Pause' : 'Play'; };
    const rebuild = debounce(() => { build(); c.redraw(); }, 80);
    build();
    c.redraw();
    return {
      change(k, v) {
        if (k === 'pace') return;
        if (k !== 'action') { rebuild(); return; }
        if (v === 'next') step();
        if (v === 'restart') { i = 0; flash = 0; playing = false; info(); }
        if (v === 'play') { if (i >= frames.length - 1) i = 0; playing = !playing; timer = 0; info(); }
        label();
        c.redraw();
      },
      update(dt) {
        if (playing && (timer += dt) > values.pace) { timer = 0; step(); }
        if (flash > 0) { flash = Math.max(0, flash - dt * 1.1); c.redraw(); }
      },
      dispose() { rebuild.cancel(); c.dispose(); },
    };
  },
};
