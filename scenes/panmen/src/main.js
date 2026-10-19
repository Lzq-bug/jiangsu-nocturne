import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildShore } from './shore.js';
import { buildWall } from './wall.js';
import { buildBridge } from './bridge.js';
import { buildPagoda } from './pagoda.js';
import { buildProps } from './props.js';
import { buildWater, LightColumns, Reflections } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS } from './data.js';

const canvas = document.getElementById('stage');
// 无头截图用：?station=桥顶&bare=1 或 #station=桥顶&bare 把机位摆好、界面收干净
const query = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
const qp = (k) => (hash.has(k) ? hash.get(k) : query.get(k));
if (qp('bare') === '1' || qp('bare') === '') document.body.classList.add('bare');
const shotStation = qp('station');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1500);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), DEFAULTS.bloom / 100, 0.62, 1.22);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let env, shore, wall, bridge, pagoda, props, water, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lantern: 1, ripple: 1, boat: 1, crowd: 120, bloom: 0.55, reflect: true, labels: true, tour: false, autoQuality: true };

// rAF 在后台标签里是停的，所以每个构建步骤都再挂一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', resize);

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

function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setLanternDensity(value); break;
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

const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；如需更高画质可手动调低花灯密度。',
  ];
  ui.perfHint(notes[level] || '');
}
function crowdTarget() {
  const cap = [260, 210, 150][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);
  water.update(t, state.ripple);
  columns.update(t, state.ripple, 0.7 + 0.5 * Math.min(1, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  props.fleet.update(t, dt, state.boat);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 9.5 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
    a.download = `盘门三景-${s.short}.png`;
    a.click();
  } catch (e) { /* 个别环境下 canvas 会被污染 */ }
}

let ui;

function feedColumns(list) {
  for (const l of list) {
    if (!l || !l.p) continue;
    columns.add(l.p instanceof THREE.Vector3 ? l.p : new THREE.Vector3(...l.p), l.color, l.width, l.depth, 0.85);
  }
}

async function boot() {
  ui = createUI({
    stations: STATIONS,
    defaults: DEFAULTS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 62 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.04, '铺陈夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.14, '升起星月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.26, '放下运河与堤岸…');
  shore = buildShore(scene);
  await nextFrame();

  ui.loading(0.4, '砌水陆城门…');
  wall = buildWall(scene);
  await nextFrame();

  ui.loading(0.55, '架起吴门桥…');
  bridge = buildBridge(scene);
  await nextFrame();

  ui.loading(0.68, '立瑞光塔…');
  pagoda = buildPagoda(scene);
  await nextFrame();

  ui.loading(0.8, '点亮两岸灯火…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  feedColumns(wall.lights);
  feedColumns(bridge.lights);
  feedColumns(shore.lights);
  feedColumns(pagoda.lights);
  props = buildProps(scene, columns, bridge.deckY);
  await nextFrame();

  ui.loading(0.9, '放下水面…');
  water = buildWater(scene, columns);
  reflections = new Reflections(scene);
  reflections.add(wall.group);
  reflections.add(bridge.group);
  reflections.add(pagoda.group);
  await nextFrame();

  ui.loading(0.97, '安顿船火与人影…');
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)) });
  hotspots.labelsVisible = true;

  const start = shotStation
    ? Math.max(0, STATIONS.findIndex((s) => s.id === shotStation || s.short === shotStation))
    : 0;
  stationIndex = start;
  rig.goTo(STATIONS[start].pos, STATIONS[start].look, { animate: false });
  rig.setFov(query.get('fov') ? Number(query.get('fov')) : 62);
  ui.setActive(STATIONS[start].id);
  ui.showInfo(STATIONS[start]);
  if (!shotStation) setTimeout(() => ui.hideInfo(), 14000);
  hotspots.setCurrent(STATIONS[start].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先空渲染一遍，把着色器都编译好再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '运河夜阑…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  window.panmen = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, bridge, wall, pagoda };
  window.__ready = true;
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
