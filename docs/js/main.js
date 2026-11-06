import seed from './demos/seed.js';
import noise from './demos/noise.js';
import octaves from './demos/octaves.js';

const DEMOS = [seed, noise, octaves];
const $ = id => document.getElementById(id);
const stage = $('stage'), controls = $('controls'), readout = $('readout');
const saved = new Map(); // parameter values survive switching between demos
let active = null, last = 0;

for (const d of DEMOS) {
  const a = document.createElement('a');
  a.href = '#' + d.id;
  a.textContent = d.nav;
  $('steps').append(a);
}

function buildControls(demo, values, send) {
  controls.replaceChildren();
  for (const p of demo.params) {
    if (p.type === 'buttons') {
      const row = document.createElement('div');
      row.className = 'buttons';
      for (const [i, b] of p.items.entries()) {
        const el = document.createElement('button');
        el.textContent = b.label;
        el.dataset.action = b.action;
        if (i === 0) el.className = 'primary';
        el.onclick = () => send('action', b.action);
        row.append(el);
      }
      controls.append(row);
    } else if (p.type === 'check') {
      const l = document.createElement('label');
      l.className = 'check';
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.checked = values[p.key];
      i.onchange = () => { values[p.key] = i.checked; send(p.key, i.checked); };
      l.append(i, p.label);
      controls.append(l);
    } else {
      const box = document.createElement('div');
      box.className = 'ctl';
      const l = document.createElement('label');
      const id = 'p-' + p.key;
      l.htmlFor = id;
      l.textContent = p.label;
      const i = document.createElement('input');
      i.id = id;
      if (p.type === 'text') {
        i.type = 'text';
        i.value = values[p.key];
        i.onchange = () => { values[p.key] = i.value; send(p.key, i.value); };
      } else {
        i.type = 'range';
        i.min = p.min; i.max = p.max; i.step = p.step;
        i.value = values[p.key];
        const o = document.createElement('output');
        const show = () => { o.textContent = p.format ? p.format(values[p.key]) : values[p.key]; };
        show();
        l.append(o);
        i.oninput = () => { values[p.key] = +i.value; show(); send(p.key, +i.value); };
      }
      box.append(l, i);
      controls.append(box);
    }
  }
}

function open() {
  const demo = DEMOS.find(d => '#' + d.id === location.hash) || DEMOS[0];
  active?.dispose?.();
  stage.replaceChildren();
  readout.replaceChildren();
  document.querySelectorAll('nav a').forEach(a => {
    if (a.hash === '#' + demo.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('title').textContent = demo.title;
  $('blurb').textContent = demo.blurb;
  if (!saved.has(demo.id)) {
    const v = {};
    for (const p of demo.params) if (p.key) v[p.key] = p.value;
    saved.set(demo.id, v);
  }
  const values = saved.get(demo.id);
  let instance = null;
  buildControls(demo, values, (k, v) => instance?.change?.(k, v));
  instance = demo.create({ stage, readout, values });
  active = instance;
}

function frame(t) {
  const dt = Math.min((t - last) / 1000, .1);
  last = t;
  requestAnimationFrame(frame); // first, so one failing frame cannot stop the page
  active?.update?.(dt);
}
addEventListener('hashchange', open);
requestAnimationFrame(frame);
open();
