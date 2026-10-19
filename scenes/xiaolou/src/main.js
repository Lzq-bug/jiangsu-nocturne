import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { declutter } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildLane } from './lane.js';
import { buildHouses } from './houses.js';
import { buildBye } from './bye.js';
import { buildCourtyards, buildGarden } from './courts.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签页会冻住 rAF，所以每一步都再挂一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.12, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.62, 0.52, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let env, lane, houses, bye, courts, garden, props, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  lantern: 1, crowd: 90, moon: 1, bloom: DEFAULTS.bloom / 100,
  modern: true, labels: true, tour: false, autoQuality: true,
};

const params = new URLSearchParams(location.search);
if (params.has('bare')) document.body.classList.add('bare');

/* ------------------------------------------------------------------ 画布尺寸 */
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
let ui;
function setModern(on) {
  state.modern = on;
  lane.modern.visible = on;
  lane.modernLamps.forEach((l) => { l.visible = on; });
  houses.modernStrip.visible = on;
  env.setModern(on);
}

function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setLanterns(value); break;
    case 'crowd': state.crowd = value; break;
    case 'moon': state.moon = value; env.setMoon(value); break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'modern': setModern(!!value); break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质挡位 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  const notes = ['', '已自动降低渲染分辨率以保持流畅。', '并已收去部分点光源，如需更高画质可调低檐灯密度。'];
  ui.perfHint(notes[level] || '');
  bye.lamps.forEach((l, i) => { l.visible = !(level >= 2 && i % 2); });
}

/* ------------------------------------------------------------------ 主循环 */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function crowdTarget() {
  const cap = [260, 190, 130][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);
  props.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  for (const g of lane.trees) {
    g.userData.crown.rotation.z = Math.sin(t * 0.5 + g.userData.sway) * 0.014;
  }
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 9 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
    a.download = `小娄巷-${s.short}.png`;
    a.click();
  } catch (e) { /* 个别环境下 canvas 不可导出 */ }
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 55 : 50); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.04, '铺青石板…');

  resize();
  await nextFrame();

  ui.loading(0.18, '升起一巷明月…');
  env = buildEnvironment(scene);
  env.setMoon(state.moon);
  await nextFrame();

  ui.loading(0.34, '垒巷墙与坊门…');
  lane = buildLane(scene);
  await nextFrame();

  ui.loading(0.52, '起两侧硬山屋脊…');
  houses = buildHouses(scene);
  await nextFrame();

  ui.loading(0.64, '挖一条百米备弄…');
  bye = buildBye(scene);
  await nextFrame();

  ui.loading(0.76, '进门厅、天井与佚园…');
  courts = buildCourtyards(scene);
  garden = buildGarden(scene);
  await nextFrame();

  ui.loading(0.88, '挂灯串、招幌与夜游人身影…');
  props = buildProps(scene, houses.anchors);
  props.setLanterns(state.lantern);
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)) });
  hotspots.labelsVisible = true;

  // 起始机位：可用 #id 直接跳，配合 ?bare 出净图
  const hash = decodeURIComponent(location.hash.replace('#', ''));
  const fromHash = STATIONS.findIndex((s) => s.id === hash || s.short === hash);
  stationIndex = fromHash >= 0 ? fromHash : 0;
  const s = STATIONS[stationIndex];
  rig.goTo(s.pos, s.look, { animate: false });
  rig.setFov(55);
  ui.setActive(s.id);
  if (!params.has('bare')) {
    ui.showInfo(s);
    setTimeout(() => ui.hideInfo(), 15000);
  }
  hotspots.setCurrent(s.id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先暖一次，把着色器编完再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '一巷明月…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  window.xiaolou = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, onParam, bye, courts, garden };
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
