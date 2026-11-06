import { BIOMES, classify, fbm } from '../core.js';
import { canvas2d, css, debounce, seedOf } from '../util.js';

const N = 300;
const clamp = v => Math.max(0, Math.min(1, v));
const mix = (s, v) => {
  for (let i = 1; i < s.length; i++) if (v <= s[i][0]) {
    const [a, ca] = s[i - 1], [b, cb] = s[i], f = (v - a) / (b - a);
    return ca.map((c, k) => c + (cb[k] - c) * f);
  }
  return s[s.length - 1][1];
};
const RAMPS = [[[0, [.03, .03, .10]], [.45, [.25, .25, .30]], [1, [1, 1, 1]]],
  [[0, [.15, .30, .85]], [.5, [.97, .93, .80]], [1, [.85, .15, .10]]],
  [[0, [.80, .62, .35]], [.5, [.40, .70, .45]], [1, [.08, .28, .70]]]];
const NAMES = ['Height', 'Temperature', 'Moisture'];

export default {
  id: 'biomes', nav: 'Biomes', title: 'Biomes from climate',
  blurb: 'Three noise maps are read together for every pixel. Height decides sea and summit; temperature and moisture pick everything in between. Click the map to inspect any point.',
  params: [
    { key: 'seed', label: 'Seed', type: 'text', value: '1337' },
    { key: 'zoom', label: 'Map size (blocks)', type: 'range', min: 300, max: 2400, step: 50, value: 900 },
    { key: 'sea', label: 'Sea level', type: 'range', min: .1, max: .7, step: .01, value: .34 },
    { key: 'rock', label: 'Mountain line', type: 'range', min: .5, max: .95, step: .01, value: .78 },
    { key: 'heat', label: 'Global temperature', type: 'range', min: -.4, max: .4, step: .01, value: 0 },
    { key: 'wet', label: 'Global moisture', type: 'range', min: -.4, max: .4, step: .01, value: 0 },
    { key: 'climate', label: 'Climate zone size', type: 'range', min: .3, max: 3, step: .05, value: 1 },
  ],
  create({ stage, readout, values }) {
    const maps = [0, 1, 2].map(() => new OffscreenCanvas(N, N)), biome = new OffscreenCanvas(N, N);
    let vals = null, ids = null, pick = null, geo = null;
    function compute() {
      const s = seedOf(values.seed), step = values.zoom / N, cs = 1 / values.climate;
      const sea = values.sea, L = { deep: sea - .14, sea, beach: sea + .03, rock: values.rock, snow: values.rock + .1 };
      vals = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N)];
      ids = new Uint8Array(N * N);
      const imgs = [...maps, biome].map(m => new ImageData(N, N)), count = new Array(BIOMES.length).fill(0);
      for (let i = 0; i < N * N; i++) {
        const x = (i % N) * step, z = ((i / N) | 0) * step;
        const h = clamp((fbm(x / 120, z / 120, 5, s + 100) - .5) * 1.9 + .5);
        const t = clamp((fbm(x * cs / 210, z * cs / 210, 3, s + 200) - .5) * 2.5 + .5 + values.heat);
        const m = clamp((fbm(x * cs / 170, z * cs / 170, 4, s + 300) - .5) * 2.5 + .5 + values.wet);
        [h, t, m].forEach((v, k) => {
          vals[k][i] = v;
          const c = mix(RAMPS[k], v);
          imgs[k].data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4);
        });
        const id = classify(h, t, m, L);
        ids[i] = id;
        count[id]++;
        const sh = id > 1 && i % N && i >= N ? 1 + (2 * h - vals[0][i - 1] - vals[0][i - N]) * 9 : 1;
        const c = BIOMES[id][1];
        imgs[3].data.set([c[0] * sh * 255, c[1] * sh * 255, c[2] * sh * 255, 255], i * 4);
      }
      [...maps, biome].forEach((m, k) => m.getContext('2d').putImageData(imgs[k], 0, 0));
      legend(count);
    }
    function legend(count) {
      const p = pick ? `<b>${BIOMES[ids[pick[1] * N + pick[0]]][0]}</b><br>` + NAMES.map((n, k) => `${n} ${vals[k][pick[1] * N + pick[0]].toFixed(2)}`).join(' · ') + '<br><br>' : '';
      readout.innerHTML = p + '<table>' + BIOMES.map((b, i) => `<tr><td><span class="swatch" style="background:${css(b[1])}"></span>${b[0]}</td><td>${Math.round(count[i] / (N * N) * 100)}%</td></tr>`).join('') + '</table>';
      legend.count = count;
    }
    const c = canvas2d(stage, draw);
    function draw(g, W, H) {
      g.fillStyle = '#1b222a';
      g.fillRect(0, 0, W, H);
      const pad = 16, small = Math.min((H - pad * 4 - 60) / 3, W * .24), big = Math.min(H - pad * 2, W - small - pad * 3);
      const bx = small + pad * 2, by = (H - big) / 2;
      geo = { bx, by, big };
      maps.forEach((m, k) => {
        const y = pad + k * (small + 30);
        g.drawImage(m, pad, y, small, small);
        g.fillStyle = '#e8edf2';
        g.font = '14px system-ui';
        g.fillText(NAMES[k], pad, y + small + 17);
        if (pick) {
          const px = pad + pick[0] / N * small, py = y + pick[1] / N * small;
          g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, 6, 0, 7); g.stroke();
          g.strokeStyle = '#fff2a8'; g.lineWidth = 1.5; g.stroke();
          g.fillStyle = '#fff2a8';
          g.textAlign = 'right';
          g.fillText(vals[k][pick[1] * N + pick[0]].toFixed(2), pad + small, y + small + 17);
          g.textAlign = 'left';
        }
      });
      g.drawImage(biome, bx, by, big, big);
      if (pick) {
        const px = bx + pick[0] / N * big, py = by + pick[1] / N * big, t = BIOMES[ids[pick[1] * N + pick[0]]][0];
        g.strokeStyle = '#fff2a8'; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 11, 0, 7); g.stroke();
        g.font = '600 18px system-ui';
        const tw = g.measureText(t).width + 18, lx = px + 16 + tw > bx + big ? px - 16 - tw : px + 16;
        g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(lx, py - 15, tw, 30);
        g.fillStyle = '#fff'; g.fillText(t, lx + 9, py + 6);
      }
    }
    c.canvas.style.cursor = 'crosshair';
    c.canvas.onclick = e => {
      const r = c.canvas.getBoundingClientRect(), x = e.clientX - r.left - geo.bx, y = e.clientY - r.top - geo.by;
      if (x < 0 || y < 0 || x >= geo.big || y >= geo.big) return;
      pick = [Math.floor(x / geo.big * N), Math.floor(y / geo.big * N)];
      legend(legend.count);
      c.redraw();
    };
    const run = debounce(() => { compute(); c.redraw(); }, 60);
    compute();
    c.redraw();
    return { change: run, dispose() { run.cancel(); c.dispose(); } };
  },
};
