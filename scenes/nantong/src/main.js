import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter, M } from './kit.js';
import { buildSky } from './sky.js';
import { buildYuan } from './yuan.js';
import { buildGarden } from './garden.js';
import { buildSkyline } from './skyline.js';
import { buildRiver, buildPool, LightColumns, Reflections, columnsFrom } from './haohe.js';
import { buildBoats } from './boats.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签页里 rAF 会冻住，所以每一步都再挂一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 2600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.5, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.nantong = api;
let ui, sky, yuan, garden, skyline, river, pool, columns, reflections, boats, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { flood: 1, window: 0.7, lamp: 1, boat: 1, ripple: 1, bloom: 0.55, reflect: true, labels: true, tour: false, autoQuality: true };

/* ------------------------------------------------------------------ 尺寸 */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ 机位 */
function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = s.id === 'aerial' ? 50 : s.id === 'haohe' ? 58 : 55;
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.9, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.7 });
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

/* ------------------------------------------------------------------ 参数 */
function onParam(key, value) {
  switch (key) {
    case 'flood': state.flood = value; yuan.setFlood(value); break;
    case 'window':
      state.window = value;
      M.litWindow.emissiveIntensity = 0.1 + 1.15 * value;
      M.litCool.emissiveIntensity = 0.08 + 0.9 * value;
      break;
    case 'lamp': state.lamp = value; sky.setLamp(value); break;
    case 'boat': state.boat = value; break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.3);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；护城河的夜色大半靠这层倒影，可手动调低泛光强度换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ 循环 */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  sky.update(t);
  river.update(t, state.ripple);
  pool.update(t, state.ripple);
  boats.update(t, dt, state.boat);
  columns.update(t, state.ripple, 1.05 + 0.55 * Math.min(1.4, state.lamp));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 10 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
      if (fps < 24) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
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
    a.download = `南通博物苑夜景-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
}

/* ------------------------------------------------------------------ 启动 */
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

  ui.loading(0.16, '升起星月…');
  sky = buildSky(scene);
  sky.init();
  await nextFrame();

  ui.loading(0.34, '筑起四座馆舍…');
  yuan = buildYuan(scene);
  yuan.init();
  await nextFrame();

  ui.loading(0.52, '垒假山、开荷池…');
  garden = buildGarden(scene);
  await nextFrame();

  ui.loading(0.66, '铺满对岸的城…');
  skyline = buildSkyline(scene);
  await nextFrame();

  ui.loading(0.78, '放下濠河水面…');
  columns = new LightColumns(scene, 620);
  columns.mesh.renderOrder = 5;
  river = buildRiver(scene);
  pool = buildPool(scene);
  reflections = new Reflections(scene);
  reflections.add(yuan.group);
  reflections.add(skyline.towers);
  columnsFrom(columns, [...yuan.anchors, ...garden.anchors, ...skyline.anchors]);
  await nextFrame();

  ui.loading(0.9, '放船…');
  boats = buildBoats(scene, columns);
  columnsFrom(columns, boats.anchors);
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
    viewRange: 460,
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: 58 });
  rig.setFov(58);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  composer.render();   // 先跑一遍把着色器编好，再起动画
  ui.loading(1, '濠河夜月…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { yuan, garden, skyline, boats, columns, hotspots });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 截图与脚本化机位的深链：
 *   #station=pool · #eye=x,y,z&at=x,y,z&fov=60 · #bare（收起 HUD）
 */
function applyDeepLink() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.has('bare')) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    document.getElementById('loader').style.display = 'none';
  }
  const want = hash.get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (idx >= 0) { goToStation(idx, { info: false, animate: false }); return; }
  if (hash.get('eye')) {
    const eye = hash.get('eye').split(',').map(Number);
    const at = (hash.get('at') || '0,8,60').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(hash.get('fov') || 55) });
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
