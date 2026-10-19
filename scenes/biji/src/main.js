import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildSky } from './sky.js';
import { buildCanal, LightColumns, Reflections } from './canal.js';
import { buildLane } from './lane.js';
import { buildPavilion } from './pavilion.js';
import { buildWharf } from './wharf.js';
import { buildShops } from './shops.js';
import { buildBoats } from './boats.js';
import { buildSkyline } from './skyline.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, CANAL } from './data.js';

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
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.35, 3000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.58, 0.98);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
/** handle for scripting the camera from the console; filled in as the scene builds */
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.biji = api;
let ui, sky, canal, lane, pavilion, wharf, shops, boats, skyline, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lantern: 1, window: 1, pavilion: 1, boat: 1, ripple: 1, bloom: 0.3, reflect: true, labels: true, tour: false, autoQuality: true };

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
const FOV = { mouth: 56, lane: 64, shop: 52, quay: 66, moon: 60, aerial: 48 };

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = FOV[s.id] || 58;
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
  else rig.goTo(s.pos, s.look, { animate: false, fov: FOV[s.id] || 58 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; break;
    case 'window': state.window = value; break;
    case 'pavilion': state.pavilion = value; break;
    case 'boat': state.boat = value; break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; if (reflections) reflections.enabled = value; break;
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
  if (reflections) reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；河上的夜色多半靠阁与桥的那一层倒影撑着，可手动调低灯笼亮度换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ water lights */
/**
 * Every lamp that hangs over the water drags one column of light down it. Lamps
 * on the bank are pulled to the water's edge — a column drawn on dry stone just
 * disappears into the quay, which is what the first stills showed.
 */
function addWaterLights() {
  const edge = (z) => Math.max(CANAL.nearZ + 1.2, Math.min(CANAL.farZ - 1.2, z));
  const put = ([x, y, z], color, width, depth, k) => {
    columns.add(new THREE.Vector3(x, 0, edge(z)), color, width, depth, k);
  };
  for (const [x, y, z] of lane.lamps) put([x, y, z], '#ffb46b', 1.5, 9 + y * 2.4, 1.5);
  for (const [x, y, z] of wharf.lamps) put([x, y, z], '#ffc07a', 1.8, 11 + y, 1.4);
  for (const [x, y, z] of pavilion.lamps) put([x, y, z], '#ffcf8c', 2.0, 12 + y * 1.2, 1.4);
  for (const [x, , z] of skyline.bridgeLamps) put([x, 0, z], '#ff9f5e', 1.6, 10, 1.3);
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  sky.update(t);
  canal.update(t, state.ripple);
  lane.update(t, state.lantern, state.window);
  pavilion.update(t, state.pavilion);
  wharf.update(t, state.lantern);
  shops.update(t, state.lantern);
  boats.update(t, state.boat, state.ripple, columns);
  columns.update(t, state.ripple, 0.75 + 0.5 * state.lantern);
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 12 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
    a.download = `篦箕巷夜景-${s.short}.png`;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? (FOV[STATIONS[stationIndex].id] || 58) : 50); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '铺开夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起西北的月…');
  sky = buildSky(scene);
  await nextFrame();

  ui.loading(0.32, '架起文亨桥…');
  skyline = buildSkyline(scene);
  await nextFrame();

  ui.loading(0.48, '放下运河水面…');
  columns = new LightColumns(scene, 420);
  columns.mesh.renderOrder = 5;
  canal = buildCanal(scene);
  reflections = new Reflections(scene);
  await nextFrame();

  ui.loading(0.62, '排开两岸河房…');
  lane = buildLane(scene);
  await nextFrame();

  ui.loading(0.74, '立起近水阁与大码头…');
  pavilion = buildPavilion(scene);
  wharf = buildWharf(scene);
  reflections.add(pavilion.group);
  await nextFrame();

  ui.loading(0.86, '点亮前店后坊与船灯…');
  shops = buildShops(scene);
  boats = buildBoats(scene, columns);
  reflections.add(boats.group);
  addWaterLights();
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
    viewRange: 240,
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: FOV[STATIONS[0].id] || 58 });
  rig.setFov(FOV[STATIONS[0].id] || 58);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 14000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so the shaders compile before the curtain lifts
  composer.render();
  ui.loading(1, '运河灯巷…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { lane, pavilion, wharf, shops, boats, skyline, canal, columns, hotspots });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * Deep links for stills and scripted cameras:
 *   #station=moon · #eye=x,y,z&at=x,y,z&fov=60 · #bare (hide the HUD)
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
    const at = (hash.get('at') || '60,6,20').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(hash.get('fov') || 58) });
  }
}

function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
