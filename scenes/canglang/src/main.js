import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildSky } from './sky.js';
import { buildTerrain } from './terrain.js';
import { buildWaters, buildBed, LightColumns, Reflections } from './water.js';
import { buildHill } from './rockery.js';
import { buildArchitecture } from './buildings.js';
import { buildPlants } from './plants.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, BUILDINGS } from './data.js';

const canvas = document.getElementById('stage');
// rAF is frozen in a background tab, so each build step also has a timer fallback
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.5, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
/** handle for scripting the camera from the console; filled in as the scene builds */
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.canglang = api;
let ui, sky, terrain, hill, arch, plants, props, water, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lantern: 1, lattice: 1, bamboo: 1, ripple: 1, bloom: 0.3, reflect: true, labels: true, tour: false, autoQuality: true };

/* ------------------------------------------------------------------ sizing */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ stations */
/**
 * Two stations stand on built surfaces whose height the geometry builders own:
 * the crest of the hill and the 平座 of 看山楼. Deriving them here keeps the eye
 * height and the hotspot anchor honest when either moves.
 */
function syncStations() {
  const site = hill.site;
  // stand on the ridge east of the 亭, off the crest line so no tree is overhead,
  // and aim between the eave and the moon hanging north-west of it
  const here = hill.crest(0.66);
  const pav = STATIONS.find((s) => s.id === 'pavilion');
  pav.pos = [here.x + 1.2, here.y + 1.7, here.z + 2.6];
  pav.look = [site.x - 3.5, site.y + 4.8, site.z - 3.5];
  pav.mark = [site.x, site.y + 3.1, site.z];

  const k = arch.built.kanshan;
  const tw = STATIONS.find((s) => s.id === 'tower');
  tw.pos = [BUILDINGS.kanshan.x + 3.1, k.deck + 1.75, BUILDINGS.kanshan.z + 0.3];
  tw.look = [site.x, site.y + 0.4, site.z];
  tw.mark = [BUILDINGS.kanshan.x + 3.4, k.eaveY - 0.72, BUILDINGS.kanshan.z];
}

function fovFor(s) {
  if (s.id === 'aerial') return 46;
  if (s.id === 'pavilion' || s.id === 'gate') return 62;
  return 55;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = fovFor(s);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.1, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.9 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false, fov: fovFor(s) });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setLantern(value); break;
    case 'lattice': state.lattice = value; props.setLattice(value); break;
    case 'bamboo':
      state.bamboo = value;
      for (const u of plants.windUniforms) u.uWind.value = value;
      break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ quality ladder */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；这一园的夜景大半靠水面那层倒影，可手动调低灯笼亮度换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  sky.update(t);
  water.update(t, state.ripple);
  props.update(t, state.lantern);
  columns.update(t, state.ripple, 0.75 + 0.5 * Math.min(1.4, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  // 漏窗: the lamp behind each window breathes on its own phase
  for (const s of arch.latticeSheets) {
    s.mesh.material.emissiveIntensity = s.base * state.lattice * (0.86 + 0.14 * Math.sin(t * 0.9 + s.phase));
  }
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 11 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  composer.render();
  if (wantShot) { capture(); wantShot = false; }

  frames++; fpsAcc += dt;
  if (fpsAcc > 0.75) {
    const fps = Math.round(frames / fpsAcc);
    ui.setFps(fps, fps < 30);
    frames = 0; fpsAcc = 0;
    if (state.autoQuality && t > 5) {
      if (fps < 22) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
      if (lowStreak >= 8 && qualityLevel < 2) { applyQuality(qualityLevel + 1); lowStreak = 0; }
    }
  }
  requestAnimationFrame(frame);
}

function capture() {
  const s = STATIONS[stationIndex];
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `沧浪亭夜景-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  ui = createUI({
    stations: STATIONS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? fovFor(STATIONS[stationIndex]) : 50); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '铺开夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起星月…');
  sky = buildSky(scene);
  await nextFrame();

  ui.loading(0.3, '垒起园外的水与城…');
  terrain = buildTerrain(scene);
  columns = new LightColumns(scene, 240);
  columns.mesh.renderOrder = 5;
  water = buildWaters(scene);
  buildBed(scene, terrain.materials.CITY);
  reflections = new Reflections(scene, { amp: 0.3, fade: 40 });
  await nextFrame();

  ui.loading(0.5, '堆黄石假山…');
  hill = buildHill(scene);
  reflections.add(hill.group);
  await nextFrame();

  ui.loading(0.66, '立亭、堂、廊、桥…');
  arch = buildArchitecture(scene, hill.site);
  reflections.add(arch.group);
  await nextFrame();

  ui.loading(0.8, '栽竹万个…');
  plants = buildPlants(scene);
  reflections.add(plants.group);
  // the only thing worth mirroring out there is the street's lit windows
  reflections.add(terrain.cityWindows);
  await nextFrame();

  ui.loading(0.9, '点上灯…');
  props = buildProps(scene, arch.anchors, arch.latticeSheets);
  for (const [x, z] of props.waterLamps) {
    columns.add(new THREE.Vector3(x, 0, z), '#ffc48c', 1.1, 8.5, 0.62);
  }
  for (const [x, z] of hill.lampAnchors) columns.add(new THREE.Vector3(x, 0, z), '#ffcf9a', 0.7, 3.4, 0.4);
  syncStations();
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
    viewRange: 190,
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: fovFor(STATIONS[0]) });
  rig.setFov(fovFor(STATIONS[0]));
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[0].id);
  onParam('lantern', state.lantern);
  onParam('lattice', state.lattice);
  onParam('bamboo', state.bamboo);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so the shaders compile before the curtain lifts
  composer.render();
  ui.loading(1, '清风明月…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { hill, arch, props, hotspots });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * Deep links for stills and scripted cameras:
 *   #station=pavilion · #eye=x,y,z&at=x,y,z&fov=60 · #bare (hide the HUD)
 */
function applyDeepLink() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.has('bare')) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;   // the rings are noise in a still
    document.getElementById('loader').style.display = 'none';   // fade timing is virtual-time sensitive
  }
  const want = hash.get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (idx >= 0) { goToStation(idx, { info: false, animate: false }); return; }
  if (hash.get('eye')) {
    const eye = hash.get('eye').split(',').map(Number);
    const at = (hash.get('at') || '-6,7,6').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(hash.get('fov') || 55) });
  }
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
