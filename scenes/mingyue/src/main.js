import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from '../../src/kit.js';
import { initMyMaterials, MY } from './parts.js';
import { buildEnvironment } from './environment.js';
import { buildGarden } from './architecture.js';
import { buildProps } from './props.js';
import { buildPond, LightColumns, Reflections } from './water.js';
import { Hotspots } from '../../src/hotspots.js';
import { CameraRig } from '../../src/controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS } from './data.js';

const VERSE = '天下三分明月夜，二分无赖是扬州';

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
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.42, 0.6, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, invite };
window.mingyue = api;

let ui, env, garden, props, pond, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { moon: 1.2, lantern: 1, wave: 1, crowd: 60, bloom: 0.42, reflect: true, labels: true, tour: false, autoQuality: true };
/** 邀月：target 0/1，flood 追它，铺地一段段亮成水 */
const yue = { target: 0, flood: 0, held: 0 };

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
function fovFor(id) {
  if (id === 'paving') return 72;
  if (id === 'aerial') return 46;
  if (id === 'hall') return 64;
  return 58;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = fovFor(s.id);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.7, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false, fov: fovFor(s.id) });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 邀月 */
function invite(force) {
  yue.target = force === undefined ? (yue.target > 0.5 ? 0 : 1) : force;
  if (yue.target > 0.5) {
    ui.showVerse(VERSE);
    yue.held = 0;
  } else {
    ui.hideVerse();
  }
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'moon': state.moon = value; env.setMoon(value); break;
    case 'lantern': state.lantern = value; props.setLantern(value); break;
    case 'wave': state.wave = value; break;
    case 'crowd': state.crowd = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 7 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ quality */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭池中的倒影；这园子的夜景靠地上波文与水里一轮撑住，可手动调低檐下灯火换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0, lastLamp = -1;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // 泛月推进：升得慢、退得快
  const rate = yue.target > yue.flood ? 0.55 : 1.4;
  yue.flood += (yue.target - yue.flood) * Math.min(1, dt * rate * 2.2);
  if (Math.abs(yue.target - yue.flood) < 0.002) yue.flood = yue.target;
  MY.flood.value = yue.flood;
  if (yue.target > 0.5) {
    yue.held += dt;
    if (yue.held > 13) invite(0);
  }
  // 月色漫上来时把灯火压一点，让地上那层光看得见
  const lampMix = state.lantern * (1 - 0.42 * yue.flood);
  if (Math.abs(lampMix - lastLamp) > 0.004) { props.setLantern(lampMix); lastLamp = lampMix; }
  bloom.strength = state.bloom * (1 + 0.22 * yue.flood);

  rig.update(dt);
  env.update(t);
  pond.update(t, state.wave);
  columns.update(t, state.wave, 1.35 + 0.5 * Math.min(1, lampMix) + 0.5 * yue.flood);
  if (reflections.enabled) reflections.update(t, state.wave);
  props.update(t, dt, state.crowd / 10, camera.position);
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
    a.download = `二分明月楼夜景-${s.short}.png`;
    a.click();
  } catch (e) { /* canvas may be tainted in unusual setups */ }
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  ui = createUI({
    stations: STATIONS,
    defaults: DEFAULTS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? fovFor(STATIONS[stationIndex].id) : 54); },
    onStep: (d) => goToStation(stationIndex + d),
    onInvite: () => invite(),
  });
  ui.loading(0.05, '铺开青砖黛瓦…');

  resize();
  initMaterials();
  initMyMaterials();
  await nextFrame();

  ui.loading(0.2, '升起城中的一轮月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.42, '叠黄石、立长楼…');
  garden = buildGarden(scene);
  await nextFrame();

  ui.loading(0.62, '放下池水与月牙桥…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  pond = buildPond(scene, columns);
  reflections = new Reflections(scene);
  reflections.add(garden.group);
  await nextFrame();

  ui.loading(0.82, '点亮檐下灯笼…');
  props = buildProps(scene, garden.anchors, columns);
  await nextFrame();

  ui.loading(0.92, '安顿灯影与归人…');
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;
  applyDeepLink();
  rig.goTo(STATIONS[stationIndex].pos, STATIONS[stationIndex].look, { animate: false, fov: fovFor(STATIONS[stationIndex].id) });
  rig.setFov(fovFor(STATIONS[stationIndex].id));
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[stationIndex].id);
  env.setMoon(state.moon);
  props.setLantern(state.lantern);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先暖一次渲染，把 shader 编译掉再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '二分明月…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  Object.assign(api, { env, garden, props, pond, hotspots, yue });
  requestAnimationFrame(frame);
}

/**
 * 截图与自检用的深链（hash 与 query 都吃，方便 CDP 单会话连拍时改参数）：
 *   #station=paving · ?eye=x,y,z&at=x,y,z&fov=60 · #bare（隐去界面）· ?flood=1（月色直接漫满）
 */
function applyDeepLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(location.search);
  const get = (k) => (h.has(k) ? h.get(k) : q.get(k));
  const has = (k) => h.has(k) || q.has(k);
  if (has('bare')) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    hotspots.labelsVisible = false;
    document.getElementById('loader').style.display = 'none';
  }
  const want = get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (idx >= 0) stationIndex = idx;
  const eye = get('eye');
  const at = get('at');
  if (eye && at) {
    STATIONS[stationIndex] = { ...STATIONS[stationIndex], pos: eye.split(',').map(Number), look: at.split(',').map(Number) };
  }
  const flood = Number(get('flood'));
  if (Number.isFinite(flood) && flood > 0) {
    yue.target = Math.min(1, flood);
    yue.flood = yue.target;
    MY.flood.value = yue.flood;
    ui.showVerse(VERSE);
  }
  const moon = Number(get('moon'));
  if (Number.isFinite(moon) && get('moon')) onParam('moon', moon);
}

function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}

// 打包成单文件后是 file://，跨场景的链接要改指到 dist 里的兄弟文件
if (location.protocol === 'file:') {
  const other = document.getElementById('btn-other');
  if (other) other.href = '夫子庙秦淮画廊-3D全景.html';
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.stack || err.message}`;
});
