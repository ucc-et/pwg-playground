import { valueNoise } from '../core.js';
import { canvas2d, ease, seedOf } from '../util.js';

const COLORS = ['#6ea8ff', '#4fd6c2', '#ffc24a', '#ff7fa8', '#b58cff', '#7fe0ff'];
const N = 900;

export default {
  id: 'octaves', nav: 'Noise & Octaves', title: 'Noise and octaves',
  blurb: 'An octave is the same noise at a higher frequency and a lower amplitude. Big ones shape hills, small ones add detail. Added up and rounded to blocks, they become terrain.',
  params: [
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'count', label: 'Octaves', type: 'range', min: 1, max: 6, step: 1, value: 4 },
    { key: 'lac', label: 'Lacunarity (frequency step)', type: 'range', min: 1.2, max: 3.5, step: .01, value: 2.03 },
    { key: 'gain', label: 'Persistence (amplitude step)', type: 'range', min: .1, max: .9, step: .01, value: .5 },
    { key: 'span', label: 'Base frequency', type: 'range', min: 1, max: 16, step: .5, value: 6 },
    { key: 'block', label: 'Block size (px)', type: 'range', min: 4, max: 28, step: 1, value: 12 },
    { type: 'buttons', items: [{ label: 'Replay', action: 'replay' }] },
  ],
  create({ stage, readout, values }) {
    let rows = [], clock = 99;
    function compute() {
      const s = seedOf(values.seed) + 100;
      rows = [];
      let freq = 1, amp = 1;
      for (let o = 0; o < values.count; o++) {
        const r = new Float32Array(N);
        for (let i = 0; i < N; i++) r[i] = amp * 2 * (valueNoise(i / N * values.span * freq, 3.7 * freq, (s + o * 131) >>> 0) - .5);
        rows.push({ r, freq, amp });
        freq *= values.lac;
        amp *= values.gain;
      }
      readout.innerHTML = '<table>' + rows.map((r, i) => `<tr><td><span class="swatch" style="background:${COLORS[i]}"></span>Octave ${i + 1}</td><td>×${r.freq.toFixed(2)} · ${r.amp.toFixed(3)}</td></tr>`).join('') + '</table>';
    }
    const c = canvas2d(stage, draw);
    function draw(g, W, H) {
      g.fillStyle = '#1b222a';
      g.fillRect(0, 0, W, H);
      const n = rows.length, left = Math.min(150, W * .2), right = W - 20;
      const top = 16, rowH = Math.min(92, (H * .52) / n), scale = rowH * .42;
      const drawT = n * .7, X = i => left + (right - left) * i / (N - 1);
      const added = rows.map((_, o) => ease((clock - drawT - o * 1.2) / 1.2));
      rows.forEach((row, o) => {
        const shown = Math.max(0, Math.min(1, (clock - o * .7) / .6));
        if (!shown) return;
        const y = top + rowH * o + rowH / 2;
        g.strokeStyle = 'rgba(255,255,255,.08)';
        g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke();
        g.strokeStyle = COLORS[o];
        g.globalAlpha = added[o] >= 1 ? .55 : 1;
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < N * shown; i++) { const p = y - row.r[i] * scale; i ? g.lineTo(X(i), p) : g.moveTo(X(i), p); }
        g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = COLORS[o];
        g.font = '600 15px system-ui';
        g.fillText(`Octave ${o + 1}`, 14, y + 5);
      });
      const baseY = top + rowH * n + (H - top - rowH * n) * .42, rs = Math.min(95, H * .15), block = values.block;
      const at = i => rows.reduce((s, r, o) => s + r.r[i] * added[o], 0);
      const fill = (clock - drawT - n * 1.2) / 1.2;
      if (fill > 0) {
        const cols = Math.ceil((right - left) / block);
        for (let k = 0; k < cols * Math.min(1, fill); k++) {
          const i = Math.min(N - 1, Math.floor(k / cols * N));
          let y = Math.round((baseY - at(i) * rs) / block) * block, d = 0;
          for (; y < H; y += block, d++) {
            g.fillStyle = d === 0 ? '#6aa84a' : d < 4 ? '#7a5536' : '#5c5f66';
            g.fillRect(left + k * block, y, block - .5, block - .5);
          }
        }
      }
      if (clock > drawT) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2.5;
        g.beginPath();
        for (let i = 0; i < N; i++) { const p = baseY - at(i) * rs; i ? g.lineTo(X(i), p) : g.moveTo(X(i), p); }
        g.stroke();
        g.fillStyle = '#fff';
        g.font = '600 18px system-ui';
        g.fillText('Result', 14, baseY + 6);
      }
    }
    compute();
    clock = 0;
    return {
      change(k, v) {
        if (k === 'action') clock = 0;
        else { compute(); if (clock < 99) clock = 99; }
        c.redraw();
      },
      update(dt) { if (clock < 30) { clock += dt; c.redraw(); } },
      dispose() { c.dispose(); },
    };
  },
};
