import { hash2, unit } from '../core.js';
import { canvas2d, seedOf } from '../util.js';

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;
const angle = (x, y, s) => unit(hash2(x, y, s)) * Math.PI * 2;
const dot = (ix, iy, x, y, s) => { const a = angle(ix, iy, s); return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy); };
// Classic 2D Perlin noise: random gradients on a lattice, blended smoothly. Returns 0..1.
function perlin(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), u = fade(x - ix), v = fade(y - iy);
  const p = mix(mix(dot(ix, iy, x, y, s), dot(ix + 1, iy, x, y, s), u),
    mix(dot(ix, iy + 1, x, y, s), dot(ix + 1, iy + 1, x, y, s), u), v);
  return Math.max(0, Math.min(1, .5 + p * .9));
}
const RAMP = [[.36, [46, 98, 158]], [.42, [214, 196, 136]], [.62, [92, 158, 72]], [.76, [112, 116, 122]], [2, [238, 242, 246]]];
const paint = (v, terrain) => terrain ? RAMP.find(r => v < r[0])[1] : [v * 255, v * 255, v * 255];

export default {
  id: 'noise', nav: 'Pure vs Perlin', title: 'Pure noise and Perlin noise',
  blurb: 'Pure noise picks every value on its own, so neighbours are unrelated. Perlin noise blends random slopes on a grid, so neighbours stay close. Only the second one gives you land.',
  params: [
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'cell', label: 'Cell size (px)', type: 'range', min: 2, max: 12, step: 1, value: 4 },
    { key: 'size', label: 'Perlin feature size (cells)', type: 'range', min: 4, max: 64, step: 1, value: 24 },
    { key: 'row', label: 'Slice position', type: 'range', min: 0, max: 1, step: .01, value: .5 },
    { key: 'sweep', label: 'Sweep the slice', type: 'check', value: true },
    { key: 'terrain', label: 'Colour as terrain', type: 'check', value: false },
    { key: 'lattice', label: 'Show Perlin gradients', type: 'check', value: false },
  ],
  create({ stage, readout, values }) {
    const maps = [{ name: 'Pure noise', at: (x, y, s) => unit(hash2(x, y, s)) },
      { name: 'Perlin noise', at: (x, y, s) => perlin(x / values.size, y / values.size, s) }];
    let cols = 0, rows = 0, key = '', time = 0;
    function build(w, h) {
      const cell = values.cell, s = seedOf(values.seed);
      const c = Math.max(1, Math.ceil(w / cell)), r = Math.max(1, Math.ceil(h / cell));
      const k = [c, r, cell, values.size, values.seed, values.terrain].join();
      if (k === key) return;
      key = k; cols = c; rows = r;
      for (const m of maps) {
        m.data = new Float32Array(c * r);
        m.img = Object.assign(document.createElement('canvas'), { width: c, height: r });
        const g = m.img.getContext('2d'), im = g.createImageData(c, r);
        let diff = 0;
        for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) {
          const i = y * c + x, v = m.data[i] = m.at(x, y, s), col = paint(v, values.terrain);
          im.data.set([col[0], col[1], col[2], 255], i * 4);
          if (x) diff += Math.abs(v - m.data[i - 1]);
        }
        g.putImageData(im, 0, 0);
        m.diff = diff / Math.max(1, (c - 1) * r);
      }
      readout.innerHTML = '<table><tr><td>Average step to next cell</td><td></td></tr>' +
        maps.map(m => `<tr><td>${m.name}</td><td>${m.diff.toFixed(3)}</td></tr>`).join('') + '</table>';
    }
    function panel(g, m, x, y, w, mapH, stripH, row) {
      const cell = values.cell;
      g.fillStyle = '#fff';
      g.font = '600 16px system-ui';
      g.fillText(m.name, x, y + 16);
      const my = y + 28;
      g.save();
      g.beginPath(); g.rect(x, my, w, mapH); g.clip();
      g.drawImage(m.img, x, my, cols * cell, rows * cell);
      if (values.lattice && m === maps[1]) arrows(g, x, my, w, mapH);
      g.restore();
      const line = my + (row + .5) * cell;
      g.strokeStyle = '#ffc24a';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, line); g.lineTo(x + w, line); g.stroke();
      // The highlighted row, stood up as a column of blocks per sample.
      const top = my + mapH + 12, bw = Math.max(cell, 6), levels = Math.max(4, Math.floor(stripH / bw));
      for (let px = 0; px < w; px += bw) {
        const v = m.data[row * cols + Math.min(cols - 1, Math.floor(px / cell))];
        const n = 1 + Math.round(v * (levels - 1)), cw = Math.min(bw, w - px) - .5;
        for (let d = 0; d < n; d++) {
          g.fillStyle = d === 0 ? '#6aa84a' : d < 3 ? '#7a5536' : '#5c5f66';
          g.fillRect(x + px, top + (levels - n + d) * bw, cw, bw - .5);
        }
      }
    }
    function arrows(g, x, y, w, h) {
      const step = values.size * values.cell, s = seedOf(values.seed), len = Math.min(step * .4, 22);
      g.strokeStyle = g.fillStyle = '#ff7fa8';
      g.lineWidth = 1.5;
      for (let j = 0; j * step <= h + step; j++) for (let i = 0; i * step <= w + step; i++) {
        const a = angle(i, j, s), px = x + i * step, py = y + j * step;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke();
        g.beginPath(); g.arc(px, py, 2.5, 0, 7); g.fill();
      }
    }
    function draw(g, W, H) {
      g.fillStyle = '#1b222a';
      g.fillRect(0, 0, W, H);
      const pad = 16, stacked = W < 640;
      const w = stacked ? W - pad * 2 : (W - pad * 3) / 2;
      const ph = stacked ? (H - pad * 3) / 2 : H - pad * 2;
      const stripH = Math.round(ph * .3), mapH = Math.max(20, ph - stripH - 40);
      build(w, mapH);
      const f = values.sweep ? .5 - .5 * Math.cos(time * .5) : values.row;
      const row = Math.min(rows - 1, Math.floor(f * rows));
      panel(g, maps[0], pad, pad, w, mapH, stripH, row);
      if (stacked) panel(g, maps[1], pad, pad * 2 + ph, w, mapH, stripH, row);
      else panel(g, maps[1], pad * 2 + w, pad, w, mapH, stripH, row);
    }
    const c = canvas2d(stage, draw);
    return {
      change() { c.redraw(); },
      update(dt) { if (values.sweep) { time += dt; c.redraw(); } },
      dispose() { c.dispose(); },
    };
  },
};
