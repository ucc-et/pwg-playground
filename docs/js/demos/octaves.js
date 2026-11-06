import { valueNoise } from '../core.js';
import { canvas2d, ease, seedOf } from '../util.js';

const COLORS = ['#6ea8ff', '#4fd6c2', '#ffc24a', '#ff7fa8', '#b58cff', '#7fe0ff'];
const N = 900, SECONDS = 3.5; // per octave at 1× speed

export default {
  id: 'octaves', nav: 'Noise & Octaves', title: 'Noise and octaves',
  blurb: 'An octave is the same noise at a higher frequency and a lower amplitude. Big ones shape hills, small ones add detail. Watch each one drop onto the result: orange shows what it changed.',
  params: [
    { type: 'buttons', items: [{ label: 'Pause', action: 'pause' }, { label: 'Next octave', action: 'next' }, { label: 'Replay', action: 'replay' }] },
    { key: 'speed', label: 'Animation speed', type: 'range', min: .1, max: 3, step: .05, value: 1, format: v => v.toFixed(2) + '×' },
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'count', label: 'Octaves', type: 'range', min: 1, max: 6, step: 1, value: 4 },
    { key: 'lac', label: 'Lacunarity (frequency step)', type: 'range', min: 1.2, max: 3.5, step: .01, value: 2.03 },
    { key: 'gain', label: 'Persistence (amplitude step)', type: 'range', min: .1, max: .9, step: .01, value: .5 },
    { key: 'span', label: 'Base frequency', type: 'range', min: 1, max: 16, step: .5, value: 6 },
    { key: 'block', label: 'Block size (px)', type: 'range', min: 4, max: 28, step: 1, value: 12 },
  ],
  create({ stage, readout, values }) {
    // clock counts octaves: 2.4 means octave 3 is 40% through being added.
    let rows = [], clock = 0, paused = false, target = null, listed = -1;
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
      listed = -1;
    }
    function list(cur) {
      if (cur === listed) return;
      listed = cur;
      readout.innerHTML = '<table>' + rows.map((r, i) => `<tr style="opacity:${i > cur ? .45 : 1};font-weight:${i === cur ? 700 : 400}"><td><span class="swatch" style="background:${COLORS[i]}"></span>Octave ${i + 1}${i < cur ? ' ✓' : i === cur ? ' adding' : ''}</td><td>×${r.freq.toFixed(2)} · ${r.amp.toFixed(3)}</td></tr>`).join('') + '</table>';
    }
    const c = canvas2d(stage, draw);
    function draw(g, W, H) {
      g.fillStyle = '#1b222a';
      g.fillRect(0, 0, W, H);
      const n = rows.length, left = Math.min(150, W * .2), right = W - 20;
      const top = 16, rowH = Math.min(84, (H * .46) / n), scale = rowH * .42;
      const X = i => left + (right - left) * i / (N - 1);
      const cur = Math.min(n, Math.floor(clock)), k = clock - cur;
      const drawn = Math.min(1, k / .35), slide = ease((k - .35) / .25), merge = ease((k - .6) / .25);
      list(cur);
      rows.forEach((row, o) => {
        const y = top + rowH * o + rowH / 2, active = o === cur;
        if (active) {
          g.fillStyle = COLORS[o] + '22';
          g.fillRect(0, y - rowH / 2 + 2, W, rowH - 4);
        }
        g.strokeStyle = 'rgba(255,255,255,.08)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke();
        g.fillStyle = COLORS[o];
        g.globalAlpha = o > cur ? .35 : 1;
        g.font = `${active ? 700 : 500} 15px system-ui`;
        g.fillText(`Octave ${o + 1}${o < cur ? ' ✓' : ''}`, 14, y + 5);
        g.globalAlpha = o < cur ? .5 : 1;
        if (o <= cur) {
          g.strokeStyle = COLORS[o];
          g.lineWidth = active ? 3 : 1.5;
          g.beginPath();
          for (let i = 0; i < N * (active ? drawn : 1); i++) { const p = y - row.r[i] * scale; i ? g.lineTo(X(i), p) : g.moveTo(X(i), p); }
          g.stroke();
        }
        g.globalAlpha = 1;
      });
      const baseY = top + rowH * n + (H - top - rowH * n) * .42, rs = Math.min(95, H * .15), block = values.block;
      const before = new Float32Array(N), after = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        for (let o = 0; o < Math.min(cur, n); o++) before[i] += rows[o].r[i];
        after[i] = before[i] + (cur < n ? rows[cur].r[i] * merge : 0);
      }
      // Blocks follow the sum; a column changed by this octave gets an orange cap.
      const cols = Math.ceil((right - left) / block), snap = v => Math.round((baseY - v * rs) / block) * block;
      for (let q = 0; q < cols; q++) {
        const i = Math.min(N - 1, Math.floor(q / cols * N)), changed = snap(after[i]) !== snap(before[i]);
        let y = snap(after[i]), d = 0;
        for (; y < H; y += block, d++) {
          g.fillStyle = d === 0 ? (changed ? '#ffb03a' : '#6aa84a') : d < 4 ? '#7a5536' : '#5c5f66';
          g.fillRect(left + q * block, y, block - .5, block - .5);
        }
      }
      if (cur < n && merge > 0) { // what this octave changed
        g.fillStyle = COLORS[cur] + '66';
        g.beginPath();
        for (let i = 0; i < N; i++) { const p = baseY - after[i] * rs; i ? g.lineTo(X(i), p) : g.moveTo(X(i), p); }
        for (let i = N - 1; i >= 0; i--) g.lineTo(X(i), baseY - before[i] * rs);
        g.fill();
      }
      g.strokeStyle = '#fff';
      g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i < N; i++) { const p = baseY - after[i] * rs; i ? g.lineTo(X(i), p) : g.moveTo(X(i), p); }
      g.stroke();
      if (cur < n && slide > 0 && merge < 1) { // a copy of the octave drops onto the result
        const y = top + rowH * cur + rowH / 2;
        g.strokeStyle = COLORS[cur];
        g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i < N; i++) {
          const a = y - rows[cur].r[i] * scale, b = baseY - (before[i] + rows[cur].r[i]) * rs, p = a + (b - a) * slide;
          i ? g.lineTo(X(i), p) : g.moveTo(X(i), p);
        }
        g.stroke();
      }
      g.fillStyle = '#fff';
      g.font = '600 18px system-ui';
      g.fillText('Result', 14, baseY + 6);
      g.font = '500 13px system-ui';
      g.fillStyle = '#aab4c0';
      const total = cur + (merge >= 1 ? 1 : 0);
      g.fillText(`${Math.min(total, n)} of ${n} added`, 14, baseY + 26);
      if (cur < n) {
        g.fillStyle = COLORS[cur];
        g.font = '700 22px system-ui';
        const text = `+ Octave ${cur + 1}`;
        g.fillText(text, left, top + rowH * n + 28);
        g.font = '500 14px system-ui';
        g.fillText(`${rows[cur].freq.toFixed(2)}× the detail, ${rows[cur].amp.toFixed(3)}× the height`, left + g.measureText(text).width * 1.6 + 16, top + rowH * n + 28);
      }
    }
    const button = () => document.querySelector('[data-action=pause]');
    compute();
    c.redraw();
    return {
      change(k, v) {
        if (k === 'speed') return;
        if (k === 'action') {
          if (v === 'pause') { paused = !paused; target = null; }
          else if (v === 'replay') { clock = 0; paused = false; target = null; }
          else { target = Math.min(rows.length, Math.floor(clock) + 1); paused = true; }
          if (button()) button().textContent = paused ? 'Play' : 'Pause';
        } else {
          const done = clock >= rows.length;
          compute();
          clock = done ? rows.length : Math.min(clock, rows.length);
        }
        c.redraw();
      },
      update(dt) {
        const end = target ?? rows.length;
        if ((paused && target === null) || clock >= end) { target = null; return; }
        clock = Math.min(end, clock + dt * values.speed / SECONDS);
        c.redraw();
      },
      dispose() { c.dispose(); },
    };
  },
};
