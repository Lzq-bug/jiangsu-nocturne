import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildGarden } from './architecture.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, SEASONS } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签页里 rAF 会停摆，所以每一步之外还留一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1500);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.6, 0.52, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, garden, props, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let seasonMode = 'auto';
const state = {
  lantern: 1, bamboo: 1.1, mist: 1, moon: 1, window: 1, bloom: 0.6,
  labels: true, snow: true, wind: true, tour: false, autoQuality: true,
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ 机位与季节 */

function applySeason(id, touched = false) {
  if (id === 'auto') {
    seasonMode = 'auto';
    const s = STATIONS[stationIndex];
    const use = s.season || env.seasonId;
    env.setSeason(use);
    ui.setSeason('auto');
    return;
  }
  seasonMode = id;
  env.setSeason(id);
  ui.setSeason(id, touched);
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.8 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.6 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  if (seasonMode === 'auto' && s.season) {
    env.setSeason(s.season);
    ui.setSeason(s.season);
  }
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 参数 */

function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setLantern(value); break;
    case 'bamboo': state.bamboo = value; props.setBambooShadow(value); break;
    case 'mist': state.mist = value; env.setMistGain(value); break;
    case 'moon': state.moon = value; env.setMoonBias(value); break;
    case 'window': state.window = value; props.setWindow(value); break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'snow': state.snow = value; props.setSnow(value); break;
    case 'wind': state.wind = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 9 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
  if (key === 'lantern' || key === 'labels') props.setLantern(state.lantern);
}

/* ------------------------------------------------------------------ 画质自适应 */

const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  env.setQuality(level);
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关掉阴影与部分园外灯火；四季月色仍按你选的档位。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ 主循环 */

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t, dt);
  props.update(t, state.wind);
  garden.pond.update(t);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 13 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
      if (fps < 20) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
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
    a.download = `个园-${s.short}.png`;
    a.click();
  } catch (e) { /* 少数环境下画布被判定为污染，忽略 */ }
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 62 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
    onSeason: (id) => applySeason(id, true),
  });
  ui.loading(0.05, '立个园的门、圈一道园墙…');
  ui.setSeason('auto');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.34, '叠春夏秋冬四组假山…');
  garden = buildGarden(scene);
  await nextFrame();

  ui.loading(0.58, '压下这轮月、铺开扬州的夜气…');
  env = buildEnvironment(scene, garden.anchors);
  await nextFrame();

  ui.loading(0.76, '种竹、点灯、写上粉墙竹影…');
  props = buildProps(scene, garden);
  env.setMistGain(state.mist);
  env.setMoonBias(state.moon);
  props.setLantern(state.lantern);
  props.setBambooShadow(state.bamboo);
  props.setWindow(state.window);
  await nextFrame();

  ui.loading(0.86, '安顿热点与解说…');
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;
  hotspots.occluders = [garden.group, garden.walls.group, garden.house];

  const qs = new URLSearchParams(location.search);
  const wantSeason = qs.get('season');
  if (wantSeason && SEASONS.some((s) => s.id === wantSeason)) applySeason(wantSeason, true);

  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false });
  rig.setFov(62);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先烘一遍着色器，免得揭幕那一帧卡在编译上
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '一园四季…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();

  window.geyuan = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, SEASONS,
    goToStation, setMode, applySeason, env, garden, props, state,
  };
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  requestAnimationFrame(frame);
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
