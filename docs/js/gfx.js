// three.js setup shared by the 3D demos.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { THREE };
export const BG = 0x1b222a;

export function world(stage, { fov = 40, ortho = 0 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  stage.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(new THREE.HemisphereLight(0xe6eefa, 0x8d96a3, 1.7));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sun.position.set(-110, 190, 170);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 1;
  sun.shadow.bias = -.0006;
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -170; sc.right = sc.top = 170; sc.far = 700;
  scene.add(sun, sun.target);
  const camera = ortho ? new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1500) : new THREE.PerspectiveCamera(fov, 1, 1, 1500);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  const fit = () => {
    const r = stage.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    if (ortho) {
      const a = w / h, half = a > 1.6 ? ortho / 2 : (ortho / 2) * (1.6 / a);
      Object.assign(camera, { left: -half * a, right: half * a, top: half, bottom: -half });
    } else { camera.aspect = w / h; camera.zoom = Math.min(1, w / h / 1.6); } // keep the scene in frame on narrow screens
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();
  return { renderer, scene, camera, orbit, sun,
    render() { renderer.render(scene, camera); },
    dispose() {
      ro.disconnect();
      orbit.dispose();
      scene.traverse(o => o.geometry?.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    } };
}

// Vertex colours carry block colour and ambient occlusion; a hashed pixel grid
// per block gives the chunky surface grain.
function voxelMaterial(dim = 1) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;\nvarying vec3 vLn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position; vLn = normal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLp; varying vec3 vLn;
float grain(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= (0.86 + 0.28 * grain(floor((vLp - vLn * 0.01) * 8.0))) * ${dim.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => 'voxel' + dim;
  return m;
}
export const mats = {
  solid: voxelMaterial(),
  dim: voxelMaterial(.42),
  water: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .72, depthWrite: false }),
};

function geometry(s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setIndex(s.idx);
  return g;
}

export function voxelGroup({ solid, water }) {
  const group = new THREE.Group();
  if (solid.idx.length) {
    const m = new THREE.Mesh(geometry(solid), mats.solid);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  if (water.idx.length) group.add(new THREE.Mesh(geometry(water), mats.water));
  return group;
}
export function clear(group) {
  group.traverse(o => o.geometry?.dispose());
  group.clear();
}
