import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment, MOON_DIR } from './environment.js';
import { buildGate, CAVES, PASSAGES } from './citywall.js';
import { LanternArray, GROUPS } from './lanterns.js';
import { buildProps } from './props.js';
import { buildWater, LightColumns, Reflections } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS, GROUND_Y } from './data.js';

const canvas = document.getElementById('stage');
// rAF 在后台标签页是被冻住的，所以每一步还留一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.12, 1800);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.58, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, gate, array, props, water, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lantern: 1, ripple: 1, boat: 0.9, crowd: 120, bloom: 0.58, reflect: true, labels: true, tour: false, autoQuality: true };

/* ------------------------------------------------------------------ 灯阵序列 */

const SWEEP = 15;      // 手动起灯走完全程的秒数
const STEP = 5.5;      // 机位切换后自动补到该重的那一段
let wave = 0, waveTarget = 0, sweeping = false;
const fill = document.getElementById('array-fill');
const note = document.getElementById('array-note');
const btnArray = document.getElementById('btn-array');

function setWave(v) {
  wave = Math.max(0, Math.min(1, v));
  array.setWave(wave);
  env.setArrayLevel(wave);
  fill.style.width = `${(wave * 100).toFixed(1)}%`;
  note.textContent = `${LanternArray.phaseLabel(wave)}${sweeping ? ' · 推进中' : ''} · 按 L`;
}
function startSweep() {
  if (wave >= 0.999) wave = 0;
  sweeping = true;
  waveTarget = 1;
  btnArray.textContent = '推 进 中';
}
function stopSweep() {
  sweeping = false;
  btnArray.textContent = '起 灯';
}
function advanceWave(dt) {
  if (sweeping) {
    setWave(wave + dt / SWEEP);
    if (wave >= 1) stopSweep();
  } else if (wave < waveTarget) {
    setWave(wave + dt / STEP);
  } else if (wave > waveTarget) {
    setWave(Math.max(waveTarget, wave - dt / 3.2));
  }
}
/** 走进哪重瓮城，序列至少补到那一重的末端 */
function waveForStation(s) {
  const g = s.array || 0;
  waveTarget = Math.max(g ? GROUPS[g - 1].to : 0, 0);
}

/* ------------------------------------------------------------------ 洞内的火 */

/**
 * 27 座洞各配一盏灯太贵。只在你真的站进某一间的时候，把那盏火挪到你身上——
 * 从洞口看进去是黑的，走进去才亮，这正好是藏兵洞该有的体验。
 */
const caveLight = new THREE.PointLight(0xffb070, 0, 26, 2);
scene.add(caveLight);

function updateCaveLight() {
  const p = camera.position;
  let on = 0;
  for (const c of CAVES) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const along = -(dx * c.nx + dz * c.nz);
    const lateral = Math.abs(dx * c.nz - dz * c.nx);
    const dy = p.y - c.y;
    if (along > 0.2 && along < c.depth - 0.8 && lateral < c.w * 0.6 && dy > 0.3 && dy < c.h - 0.3) {
      on = wave >= (c.lampStart ?? 1) ? 1 : 0;
      break;
    }
  }
  if (!on) {
    for (const s of PASSAGES) {
      if (p.z > s.cz - s.t / 2 + 0.6 && p.z < s.cz + s.t / 2 - 0.6
        && Math.abs(p.x) < s.w / 2 && p.y < GROUND_Y + s.h - 0.6) {
        on = wave >= (s.lampStart ?? 1) ? 1 : 0;
        break;
      }
    }
  }
  if (!on) { caveLight.intensity = 0; return; }
  caveLight.position.set(p.x, Math.min(p.y + 0.5, 40), p.z);
  caveLight.intensity = 105 * Math.min(1.2, state.lantern);
}

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
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.7 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  if (!sweeping) waveForStation(s);
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
    case 'lantern':
      state.lantern = value;
      array.setLit(Math.min(1.4, value));
      break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'boat': state.boat = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */

const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中灯影；如需更高画质可手动调低灯阵亮度。',
  ];
  ui.perfHint(notes[level] || '');
}
function crowdTarget() {
  const cap = [240, 180, 130][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

/* ------------------------------------------------------------------ 循环 */

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);
  array.update(t);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.flags.update(t);
  props.fleet.update(t, dt, state.boat);
  water.update(t, state.ripple);
  columns.update(t, state.ripple, 1.3 + 1.5 * Math.min(1, wave) * Math.min(1, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);
  updateCaveLight();

  advanceWave(dt);

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
      if (fps < 20) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
      if (lowStreak >= 8 && qualityLevel < 2) { applyQuality(qualityLevel + 1); lowStreak = 0; }
    }
  }
  requestAnimationFrame(frame);
}

function capture() {
  const s = STATIONS[stationIndex];
  try {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `中华门瓮城灯阵-${s.short}.png`;
    a.click();
  } catch (e) { /* 少数环境下画布被判定为跨域污染 */ }
}

/* ------------------------------------------------------------------ 启动 */

async function boot() {
  ui = createUI({
    stations: STATIONS,
    defaults: DEFAULTS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 60 : 54); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '砌起四道券门…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.2, '升起城上的月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.42, '垒三重瓮城、开二十七藏兵洞…');
  gate = buildGate(scene);
  await nextFrame();

  ui.loading(0.66, '布下灯阵…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  array = new LanternArray(scene, columns, gate.anchors);
  setWave(0);
  btnArray.addEventListener('click', startSweep);
  document.getElementById('btn-array-off').addEventListener('click', () => {
    stopSweep();
    waveTarget = 0;
    setWave(0);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); startSweep(); }
  });
  await nextFrame();

  ui.loading(0.8, '放下一河春水…');
  water = buildWater(scene, columns, undefined, MOON_DIR);
  reflections = new Reflections(scene);
  reflections.add(gate.group);
  await nextFrame();

  ui.loading(0.9, '安顿巡卒与灯船…');
  props = buildProps(scene, columns, gate.anchors);
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  // #station=<id> 直接落到某处机位；#bare 去掉界面元素；#eye/#at 覆盖机位试构图：截图与自检用
  const bare = /bare/.test(location.hash);
  if (bare) document.body.classList.add('bare');
  const deep = (location.hash.match(/station=([\w-]+)/) || [])[1];
  stationIndex = Math.max(0, STATIONS.findIndex((s) => s.id === deep));
  const eye = (location.hash.match(/eye=([-\d.,]+)/) || [])[1];
  const at = (location.hash.match(/at=([-\d.,]+)/) || [])[1];
  const pose = eye && at ? { pos: eye.split(',').map(Number), look: at.split(',').map(Number) } : STATIONS[stationIndex];
  rig.goTo(pose.pos, pose.look, { animate: false });
  rig.setFov(60);
  const pre = Number((location.hash.match(/wave=([\d.]+)/) || [])[1]);
  setWave(Number.isFinite(pre) && location.hash.includes('wave=') ? pre : (STATIONS[stationIndex].array ? GROUPS[STATIONS[stationIndex].array - 1].to : 0));
  // 不设这一句，advanceWave 会立刻把开场的那一段往回收到 0
  waveTarget = wave;
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[stationIndex].id);
  if (bare) hotspots.exteriorShown = false;
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先烘一帧，把 shader 都编译完再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '瓮城灯阵…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  window.zhonghua = { scene, camera, renderer, composer, rig, bloom, STATIONS, array, goToStation, setMode, setWave, startSweep };
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
