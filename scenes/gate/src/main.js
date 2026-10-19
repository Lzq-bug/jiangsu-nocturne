import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter, M } from './kit.js';
import { buildSky } from './sky.js';
import { buildGate } from './gate.js';
import { buildSkyline } from './skyline.js';
import { buildLake, LightColumns, Reflections } from './lake.js';
import { buildShow } from './show.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS } from './data.js';

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
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.4, 6500);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.42, 0.62, 0.98);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
/** handle for scripting the camera from the console; filled in as the scene builds */
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.dongfang = api;
let ui, sky, gate, skyline, lake, columns, reflections, show, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { show: 1, window: 1, fountain: 1, ripple: 1, bloom: 0.42, reflect: true, labels: true, tour: false, autoQuality: true };

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
function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = s.id === 'arch' ? 78 : s.id === 'aerial' ? 48 : 55;
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
  else rig.goTo(s.pos, s.look, { animate: false, fov: 55 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'show': state.show = value; break;
    case 'window':
      state.window = value;
      M.glass.emissiveIntensity = 0.25 + 1.05 * value;
      M.glassSide.emissiveIntensity = 0.2 + 0.85 * value;
      break;
    case 'fountain': state.fountain = value; break;
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
    '并已关闭水中倒影；金鸡湖的夜景主要靠这层倒影撑住，可手动调低灯光秀强度换回画质。',
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
  skyline.update(t);
  lake.update(t, state.ripple);
  show.update(t, state.show, state.fountain);
  columns.update(t, state.ripple, 0.8 + 0.5 * Math.min(1.4, state.show));
  if (reflections.enabled) reflections.update(t, state.ripple);
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
    a.download = `东方之门夜景-${s.short}.png`;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 55 : 50); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '铺开夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.18, '升起星月…');
  sky = buildSky(scene);
  await nextFrame();

  ui.loading(0.36, '立起东方之门…');
  gate = buildGate(scene);
  await nextFrame();

  ui.loading(0.56, '铺满环湖楼群…');
  skyline = buildSkyline(scene);
  await nextFrame();

  ui.loading(0.72, '放下金鸡湖水面…');
  columns = new LightColumns(scene, 700);
  columns.mesh.renderOrder = 5;
  lake = buildLake(scene);
  reflections = new Reflections(scene);
  reflections.add(gate.group);
  reflections.add(skyline.towers);
  addWaterLights();
  await nextFrame();

  ui.loading(0.88, '点亮灯光秀与喷泉…');
  show = buildShow(scene, gate, columns);
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
    viewRange: 1500,
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: 55 });
  rig.setFov(55);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 14000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so the shaders compile before the curtain lifts
  composer.render();
  ui.loading(1, '湖光灯影…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { gate, show, hotspots });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * Deep links for stills and scripted cameras:
 *   #station=arch · #eye=x,y,z&at=x,y,z&fov=60 · #bare (hide the HUD)
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
    const at = (hash.get('at') || '0,150,0').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(hash.get('fov') || 55) });
  }
}

/** the water columns the building and the shore actually cast */
function addWaterLights() {
  const { archCurve, frontZ } = gate;
  for (let i = 0; i < archCurve.length; i += 3) {
    const [x, y] = archCurve[i];
    if (y < 30) continue;
    columns.add(new THREE.Vector3(x, 0, frontZ + 2), '#8fe6ff', 7, 34 + y * 0.12, 0.55);
  }
  // crown and the two podium roof shelves
  columns.add(new THREE.Vector3(0, 0, frontZ), '#dff0ff', 13, 58, 0.5);
  columns.add(new THREE.Vector3(-120, 0, frontZ), '#cfe6ff', 7, 34, 0.32);
  columns.add(new THREE.Vector3(120, 0, frontZ), '#cfe6ff', 7, 34, 0.32);
  columns.add(new THREE.Vector3(-244, 0, 46), '#ffcf94', 12, 26, 0.34);
  columns.add(new THREE.Vector3(244, 0, 46), '#ffcf94', 12, 26, 0.34);
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
