import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildQuarter, LAYOUT } from './architecture.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { MidnightBell } from './bell.js';
import { STATIONS, BELL } from './data.js';

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.62, 0.5, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, props, water, columns, reflections, rings, hotspots, quarter, portals, interiors, bell;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  lantern: 1, ripple: 1, boat: 1, leaf: 1, crowd: 70, bloom: 0.62,
  reflect: true, labels: true, frost: true, crows: true, tour: false, autoQuality: true,
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
function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.7 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  if (s.id === 'zhonglou') ui.bellNote(`按 B 敲一响，按 N 撞满 ${BELL.strikes} 下。`);
  else if (s.id === 'kechuan') ui.bellNote('船头的灯与船尾的渔火同明暗；钟响时它们会矮一口。');
  else ui.bellNote('钟声自钟楼起，贴水面散开。');
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.field.setDensity(value); props.strings.uni.uOn.value = Math.min(1, 0.25 + value); break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'boat': state.boat = value; break;
    case 'leaf': state.leaf = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'frost': state.frost = value; water.uniforms.uFrost.value = value ? 1 : 0; env.setFrost(value); break;
    case 'crows': state.crows = value; env.setCrows(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onBell(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') bell.one(t);
  else if (kind === 'stop') bell.stop();
  else if (kind === 'ring') {
    if (bell.ringing) bell.stop();
    else {
      bell.ring108(t);
      ui.bellNote(`正在撞满 ${BELL.strikes} 下，Esc 止钟。`);
    }
  }
}

/* ------------------------------------------------------------------ quality ladder */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；渔火与寺灯仍按你设定的密度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [220, 170, 120][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t, dt);
  props.field.update(t);
  props.strings.uni.uTime.value = t;
  props.fleet.update(t, dt, state.boat);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.leaves.update(t, dt, state.leaf, camera.position);
  water.update(t, state.ripple);
  columns.update(t, state.ripple, 0.75 + 0.45 * Math.min(1, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  bell.update(t, dt, camera.position);
  interiors.update(t);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);
  env.trees.declutter(camera.position);
  portals.update(t, camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 11 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  composer.render();
  if (wantShot) { capture(); wantShot = false; }

  // fps + adaptive quality — only sustained stalls count, first seconds are shader warm-up
  frames++; fpsAcc += dt;
  if (fpsAcc > 0.75) {
    const fps = Math.round(frames / fpsAcc);
    ui.setFps(fps, fps < 30);
    frames = 0; fpsAcc = 0;
    if (state.autoQuality && t > 5) {
      if (fps < 20) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
      // only ever shed resolution and reflections automatically — lamps stay as the user set them
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
    a.download = `枫桥夜泊-${s.short}.png`;
    a.click();
  } catch (e) { /* canvas may be tainted in unusual setups */ }
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 62 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
    onBell,
  });
  ui.loading(0.04, '铺陈上塘河夜色…');
  ui.setBell(0, false);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '压下那轮落月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.36, '垒驳岸、起石桥…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.54, '点亮渔火与寺灯…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns, quarter.anchors, quarter.bridges);
  await nextFrame();

  ui.loading(0.68, '撑起殿内与船舱…');
  interiors = buildInteriors(scene, props.fleet.moored(0));
  await nextFrame();

  ui.loading(0.76, '放下上塘河水…');
  rings = new WaveRings();
  water = buildWater(scene, rings);
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.88, '安顿灯火、舟子与落枫…');
  portals = buildPortals(scene, rig, props.fleet.moored(0));
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  bell = new MidnightBell({
    tower: quarter.bell,
    rings,
    props,
    env,
    position: LAYOUT.bell.bellPos,
    onCount: (c, ringing) => ui.setBell(c, ringing),
  });
  bell.addFlashTo(scene);

  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false });
  rig.setFov(62);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  // the opening card explains the scene, then gets out of the way of the view
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so shaders compile before the curtain lifts
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '夜半钟声…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  // handle for scripting the camera and reading scene stats from the console
  window.fengqiao = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, portals, bell, LAYOUT, props, columns, env, water, reflections, state };
  // ?st=pagoda 直接落到某个机位，便于逐机位截图与回归对比
  const qs = new URLSearchParams(location.search);
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?bell=1 让钟一直撞下去，用来看波环与摆钟的静帧（无头截图里场景时间走得极慢，先预置几响）
  if (qs.get('bell')) {
    const t = clock.elapsedTime + 0.6;
    bell.ring108(t);
    for (const age of [0.2, 0.8, 1.8, 3.2]) {
      bell.rings.emit(LAYOUT.bell.bellPos.x, LAYOUT.bell.bellPos.z, t - age, 1);
      bell.hits.push({ t0: t - age, s: 1 });
    }
  }
  requestAnimationFrame(frame);
}

// hotspot taps come through the rig
function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const door = portals.pick(ndc, camera);
    if (door) { portals.use(door); return; }
    const hit = hotspots.pick(ndc, camera);
    if (hit) { goToStation(STATIONS.indexOf(hit)); return; }
    // 点钟身也算敲一记
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(quarter.bell.bellMesh, false).length) bell.one(clock.elapsedTime);
  };
  // E walks through whatever doorway you are standing in front of
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    portals.use(portals.nearest(camera.position));
  });
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
