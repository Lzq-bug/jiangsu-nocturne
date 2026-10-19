import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from '../../src/kit.js';
import { buildEnvironment } from './environment.js';
import { buildTower } from './tower.js';
import { buildQuarter } from './architecture.js';
import { buildProps } from './props.js';
import { buildPools, LightColumns, Reflections } from './water.js';
import { Hotspots } from '../../src/hotspots.js';
import { CameraRig } from '../../src/controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS, LAMP_LINE, REVEAL_LINE } from './data.js';

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
renderer.toneMappingExposure = 0.88;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.62, 0.98);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, release, reveal };
window.wenbi = api;

let ui, env, tower, quarter, props, pools, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let lampOn = false, revealOn = false, verseClock = 0;
const state = {
  moon: 1.1, lamp: 1, lantern: 1, wave: 1, bloom: 0.3, reflect: true, labels: true, tour: false, autoQuality: true,
};

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
const FOV = { mouth: 52, door: 62, yan: 62, ying: 62, hill: 60, spire: 24, hongmei: 48, aerial: 48 };

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = FOV[s.id] || 58;
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.8, fov });
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
  else rig.goTo(s.pos, s.look, { animate: false, fov: FOV[s.id] || 58 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 两个动作 */
/** 燃笔：七层五十六盏灯自塔基起、自下而上次第点亮，末了塔刹放光 */
function release(force, snap) {
  lampOn = force === undefined ? !lampOn : !!force;
  tower.release(lampOn, snap);
  ui.setLamp(lampOn);
  if (lampOn) { ui.showVerse(LAMP_LINE); verseClock = 0; }
  else ui.hideVerse();
}

/** 剖视：砖身与腰檐渐隐，露出宋基、楼板、旋梯与通天刹柱 */
function reveal(force, snap) {
  revealOn = force === undefined ? !revealOn : !!force;
  tower.reveal(revealOn, snap);
  ui.setReveal(revealOn);
  if (revealOn && !lampOn) ui.showVerse(REVEAL_LINE);
  if (!revealOn && !lampOn) ui.hideVerse();
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'moon': state.moon = value; env.setMoon(value); break;
    case 'lamp': state.lamp = value; tower.setLampBright(value); break;
    case 'lantern': state.lantern = value; props.setLantern(value); break;
    case 'wave': state.wave = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value && qualityLevel < 2; break;
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
    '并已关闭池里的倒影；这一景靠塔身与七层灯撑住，可手动调低檐下灯火换回画质。',
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
  env.update(t);
  const st = tower.update(t, dt);
  pools.update(t, state.wave);
  columns.update(t, state.wave, 1.1 + 0.7 * Math.min(1, state.lantern) + 0.5 * st.lamp + 0.3 * st.reveal);
  if (reflections.enabled) reflections.update(t, state.wave);
  props.update(t, dt);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  // 诗句浮一句就收，灯留着
  if (lampOn || revealOn) {
    verseClock += dt;
    if (verseClock > 12) ui.hideVerse();
  }

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
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `文笔塔红梅夕照-${s.short}.png`;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? (FOV[STATIONS[stationIndex].id] || 58) : 54); },
    onStep: (d) => goToStation(stationIndex + d),
    onLamp: () => release(),
    onReveal: () => reveal(),
  });
  ui.loading(0.05, '挖开砚池与塔影池…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.2, '升起城北那轮月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.42, '叠八角七层、开四向券门…');
  tower = buildTower(scene);
  await nextFrame();

  ui.loading(0.6, '立红梅阁、围碑廊、铺园墙…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.78, '放下两方水面…');
  columns = new LightColumns(scene);
  pools = buildPools(scene);
  reflections = new Reflections(scene);
  reflections.add(tower.group);
  reflections.add(quarter.group);
  tower.bindMirror(reflections.mirror);
  await nextFrame();

  ui.loading(0.9, '点亮石灯与池里荷灯…');
  props = buildProps(scene, quarter.anchors, columns);
  await nextFrame();

  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)) });
  hotspots.labelsVisible = true;
  applyDeepLink();
  rig.goTo(STATIONS[stationIndex].pos, STATIONS[stationIndex].look, { animate: false, fov: FOV[STATIONS[stationIndex].id] || 58 });
  rig.setFov(FOV[STATIONS[stationIndex].id] || 58);
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[stationIndex].id);
  env.setMoon(state.moon);
  props.setLantern(state.lantern);
  props.setCrowd(46);
  tower.setLampBright(state.lamp);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先暖一次渲染，把 shader 编译掉再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '文笔塔…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  Object.assign(api, { env, tower, quarter, props, pools, columns, hotspots });
  requestAnimationFrame(frame);
}

/**
 * 截图与自检用的深链（hash 与 query 都吃）：
 *   ?st=mouth · #station=door · ?eye=x,y,z&at=x,y,z&fov=60 · ?bare=1 / #bare（隐去界面）
 *   ?lamp=1（七层灯直接落位）· ?reveal=1（砖身直接渐隐）· ?moon=0.6
 * 机位 id 可带后缀：?st=yan.lamp.reveal
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
  const want = get('station') || get('st');
  let flags = '';
  if (want !== null) {
    const [id, f] = String(want).split('.');
    const idx = STATIONS.findIndex((s) => s.id === id);
    if (idx >= 0) stationIndex = idx;
    flags = f || '';
  }
  const eye = get('eye'), at = get('at');
  if (eye && at) {
    STATIONS[stationIndex] = {
      ...STATIONS[stationIndex],
      pos: eye.split(',').map(Number),
      look: at.split(',').map(Number),
    };
  }
  const fov = Number(get('fov'));
  if (Number.isFinite(fov) && fov > 0) FOV[STATIONS[stationIndex].id] = fov;
  // 预置状态要把 target 与当前值一起落位：SwiftShader 下一张静帧只有十几帧，
  // 靠 dt 推进的次第点亮根本走不到顶层
  if (Number(get('lamp')) > 0 || flags.includes('lamp')) release(true, true);
  if (Number(get('reveal')) > 0 || flags.includes('reveal')) reveal(true, true);
  const moon = Number(get('moon'));
  if (Number.isFinite(moon) && moon > 0) onParam('moon', moon);
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
