import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildSky, MOON_DIR } from './sky.js';
import { buildRiver, buildRiverBed, LightColumns, Reflections } from './river.js';
import { buildMainBridge } from './bridge.js';
import { buildTowers } from './towers.js';
import { buildApproach } from './approach.js';
import { buildLamps, buildShoreLamps } from './lights.js';
import { buildMotion } from './motion.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import {
  STATIONS, DEFAULTS, LIGHT, FOG_COLOR, FOG_DENSITY, GIRDER, TOWER, SHIP,
} from './data.js';

const canvas = document.getElementById('stage');
// 后台标签里 rAF 会冻住，所以每一步都再挂一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LIGHT.exposure;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
const camera = new THREE.PerspectiveCamera(55, 1, 0.35, 9000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), LIGHT.bloomStrength, 0.62, LIGHT.bloomThreshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.njbridge = api;
// ?debug=1 时把 THREE 交出去，tools/probe.mjs 用它做射线与包围盒诊断
if (/[?&]debug/.test(location.search) || /[&#]debug/.test(location.hash)) window.THREE = THREE;
let ui, sky, river, columns, reflections, bridge, towers, approach, lamps, motion, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  ...DEFAULTS,
  // DEFAULTS 存的是滑杆原值（100 / 34），这里换成场景用的比例
  lamp: DEFAULTS.lamp / 100,
  traffic: DEFAULTS.traffic / 100,
  ripple: DEFAULTS.ripple / 100,
  bloom: DEFAULTS.bloom / 100,
};
/** 齐明的推进：v 是当前值，target 是要走到的值 */
const ramp = { v: 0, target: 0, on: false };

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

/* ------------------------------------------------------------------ 机位
 * 桥的高程都由 roadY/railY/groundY 解析给出，机位在 data.js 里已经按这些函数
 * 算好；这里只把两样会动的东西对上：船头的站位与堡下广场的标高。
 */
function resolveStations() {
  for (const s of STATIONS) {
    if (s.id === 'ship') {
      s.pos = [SHIP.x0 + 30, SHIP.deckY + 2.5, SHIP.channelZ + 8.5];
      s.look = [26, GIRDER.bottomY + 3, SHIP.channelZ - 5];
    }
    // 堡下：站在主塔的东南角，正好吃到那盏从东南往上打的投光
    if (s.id === 'tower') {
      s.pos = [TOWER.x + 27, TOWER.plazaY + 1.72, TOWER.z + 56];
      s.look = [TOWER.x + 1, TOWER.plazaY + 41, TOWER.z - 3];
    }
    if (s.id === 'flag') {
      s.pos = [TOWER.x + 19, TOWER.plazaY + TOWER.h - 5, TOWER.z + 27];
      s.look = [TOWER.x - 1, TOWER.plazaY + TOWER.h + 3.2, TOWER.z];
    }
  }
}

function fovFor(s) {
  if (s.id === 'aerial') return 44;
  if (s.id === 'bank' || s.id === 'ramp') return 62;
  if (s.id === 'tower' || s.id === 'truss' || s.id === 'ship' || s.id === 'rail') return 62;
  return 52;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  if (s.id === 'ship') motion.ship.setPos(SHIP.x0);
  const fov = fovFor(s);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.4, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 2.0 });
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

/* ------------------------------------------------------------------ 招牌动作 */

/**
 * 齐明：公路桥 150 对玉兰灯自南而北次第点亮，堡的投光与江面光柱跟着起来。
 * snap=true 直接把进度落到终态——SwiftShader 下一张静帧只有十几帧，
 * 靠 dt 推进的序列根本走不完。
 */
function releaseGlow({ snap = false } = {}) {
  state.glow = true;
  ramp.on = true;
  ramp.target = 1;
  if (snap) {
    ramp.v = 1;
    applyGlow();
    ramp.on = false;
  }
  ui.setToggle('glow', true);
}

function applyGlow() {
  const k = ramp.v;
  lamps.setGlow(k, state.lamp);
  towers.setGlow(k);
  bridge.setOutline(k > 0.08);
}

function onParam(key, value) {
  switch (key) {
    case 'lamp':
      state.lamp = value;
      applyGlow();
      break;
    case 'traffic': state.traffic = value; motion.setTraffic(value); break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'glow':
      state.glow = value;
      if (value) { ramp.on = true; ramp.target = 1; } else { ramp.on = true; ramp.target = 0; }
      break;
    case 'train':
      state.train = value;
      if (value) motion.releaseTrain({ snap: false }); else motion.train.recall();
      break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭江中灯影；这一景的江面全靠那一片光柱与倒影，可手动调低桥灯亮度换回画质。',
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
  sky.update(t);
  river.update(t, state.ripple);
  motion.update(t, dt);
  if (ramp.on) {
    // 点亮用 13 秒走完 150 对，回落只用 6 秒：静帧里两种状态都看得出来
    const rate = ramp.target > ramp.v ? dt / 13 : dt / 6;
    const delta = Math.sign(ramp.target - ramp.v) * Math.min(rate, Math.abs(ramp.target - ramp.v));
    ramp.v += delta;
    applyGlow();
    if (Math.abs(ramp.v - ramp.target) < 1e-3) { ramp.v = ramp.target; applyGlow(); ramp.on = false; }
  }
  columns.update(t, state.ripple, 0.7 + 0.5 * Math.min(1.3, state.lamp));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 14 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  composer.render();
  if (wantShot) { capture(); wantShot = false; }

  frames++; fpsAcc += dt;
  if (fpsAcc > 0.75) {
    const fps = Math.round(frames / fpsAcc);
    ui.setFps(fps, fps < 30);
    frames = 0; fpsAcc = 0;
    if (state.autoQuality && t > 6) {
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
    a.download = `南京长江大桥夜景-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
}

/* ------------------------------------------------------------------ 起动 */
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
  ui.loading(0.05, '把江铺开…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起星月…');
  sky = buildSky(scene);
  await nextFrame();

  // 月光是全场唯一的"太阳"：一层斜光让钢梁与混凝土读得出朝向
  const moon = new THREE.DirectionalLight('#cfdff2', LIGHT.moon);
  moon.position.copy(MOON_DIR).multiplyScalar(900);
  scene.add(moon);
  const hemi = new THREE.HemisphereLight('#22334a', '#0b0f14', LIGHT.hemi);
  scene.add(hemi);
  // 两岸城灯从 ±z 压过来的暖光，各一盏足够
  for (const sgn of [1, -1]) {
    const warm = new THREE.DirectionalLight('#ffbe86', LIGHT.cityWarm);
    warm.position.set(0, 60, sgn * 900);
    scene.add(warm);
  }
  /* 玉兰灯是发光面、不照明：脚下那层沥青得另给一盏。
     全场真实光源控制在十几盏以内，再多 SwiftShader 的一张静帧就拍不完了。 */
  for (const z of [240, -460]) {
    const deckFill = new THREE.PointLight('#ffd9b0', LIGHT.deckFill, LIGHT.deckFillDist, 2);
    deckFill.position.set(0, GIRDER.roadY + 5, z);
    scene.add(deckFill);
  }
  for (const z of [240, -420]) {
    const rl = new THREE.PointLight('#cfe0ff', LIGHT.railFill, LIGHT.railFillDist, 2);
    rl.position.set(0, GIRDER.railY + 5.5, z);
    scene.add(rl);
  }

  ui.loading(0.30, '落下河床与水面…');
  columns = new LightColumns(scene, 520);
  columns.mesh.renderOrder = 5;
  river = buildRiver(scene);
  buildRiverBed(scene, M_dark());
  reflections = new Reflections(scene, { amp: 0.3, fade: 78 });
  await nextFrame();

  ui.loading(0.52, '垒起 9 墩 10 孔…');
  bridge = buildMainBridge(scene);
  reflections.add(bridge.group);
  await nextFrame();

  ui.loading(0.68, '立四座桥头堡…');
  towers = buildTowers(scene);
  reflections.add(towers.group);
  await nextFrame();

  ui.loading(0.80, '铺引桥、岸与今市…');
  approach = buildApproach(scene);
  await nextFrame();

  ui.loading(0.89, '点上 150 对玉兰灯…');
  lamps = buildLamps(scene, columns);
  buildShoreLamps(scene, columns);
  reflections.add(approach.city.im);
  await nextFrame();

  ui.loading(0.95, '让桥上车走、船过…');
  motion = buildMotion(scene, columns, approach.buoy);
  reflections.add(motion.ship.grp);

  resolveStations();
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)), viewRange: 1500 });
  hotspots.labelsVisible = true;

  onParam('lamp', state.lamp);
  onParam('traffic', state.traffic);
  onParam('bloom', state.bloom);
  applyGlow();
  bridge.setOutline(false);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);

  goToStation(0, { animate: false, info: true });
  rig.setFov(fovFor(STATIONS[0]));
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 17000);
  hotspots.setCurrent(STATIONS[0].id);
  await nextFrame();

  composer.render();      // 先编译一遍着色器，幕布才落
  ui.loading(1, '天堑变通途…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { bridge, towers, approach, lamps, motion, hotspots, releaseGlow, setGlow: setGlowValue, columns });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/** 深链与脚本都能直接把齐明进度落到某个值 */
function setGlowValue(v, snap = true) {
  state.glow = v > 0;
  ramp.target = v;
  ramp.on = !snap;
  if (snap) { ramp.v = v; applyGlow(); }
  ui.setToggle('glow', state.glow);
}

/**
 * 静帧与脚本走位用的深链（query 与 hash 两种写法都读）：
 *   ?st=tower&bare=1 · ?eye=x,y,z&at=x,y,z&fov=60
 *   ?glow=1&train=1&lamp=120&traffic=60&noaq=1
 */
function applyDeepLink() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const get = (k) => q.get(k) ?? h.get(k);
  const has = (k) => q.has(k) || h.has(k);

  if (has('bare')) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    document.getElementById('loader').style.display = 'none';
  }
  if (has('noaq')) { onParam('autoQuality', false); ui.setToggle('autoQuality', false); }

  const want = get('st') ?? get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (has('lamp')) onParam('lamp', Number(get('lamp')));
  if (has('traffic')) onParam('traffic', Number(get('traffic')));
  if (has('bloom')) onParam('bloom', Number(get('bloom')));
  if (has('ripple')) onParam('ripple', Number(get('ripple')));
  if (has('glow')) setGlowValue(Number(get('glow')) === 0 ? 0 : 1);
  if (idx >= 0) {
    if (has('train') && get('train') !== '0') {
      state.train = true;
      motion.releaseTrain({ snap: true });   // 直接把列车落到江心，静帧等不到它开过来
      ui.setToggle('train', true);
    }
    goToStation(idx, { info: has('info'), animate: false });
    if (has('fov')) rig.setFov(Number(get('fov')));
    return;
  }
  if (has('eye')) {
    const eye = get('eye').split(',').map(Number);
    const at = (get('at') || '0,40,0').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(get('fov') || 55) });
  }
}

/** 河床用的暗面材质：水面半透之下不能是空的 */
function M_dark() {
  const m = new THREE.MeshStandardMaterial({ color: 0x0b1116, roughness: 0.98, metalness: 0 });
  m.name = 'riverbed';
  return m;
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'g') { ui.setToggle('glow', !state.glow); onParam('glow', !state.glow); }
  });
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
