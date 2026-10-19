import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildQuarter, LAYOUT } from './architecture.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { NightDrum, ROUND_NAME } from './drum.js';
import { STATIONS, DRUM } from './data.js';

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
renderer.toneMappingExposure = 1.18;
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
let ui, env, props, water, columns, reflections, rings, hotspots, quarter, portals, interiors, drum;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  lantern: 1, ripple: 1, boat: 1, firefly: 1, crowd: 60, bloom: 0.62,
  reflect: true, labels: true, mist: true, crows: true, tour: false, autoQuality: true,
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
  if (s.id === 'ding') ui.drumNote(`鼓就在台顶明间门外，按 B 敲一记，按 N 报满五更。`);
  else if (s.id === 'quanmen') ui.drumNote('鼓声在券门的砖壁里顶一下才出来，离得越近那记闷响越重。');
  else ui.drumNote('鼓自台顶起，贴着渠面散开。');
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
    case 'firefly': state.firefly = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; water.uniforms.uMist.value = value ? 1 : 0; env.setMist(value); break;
    case 'crows': state.crows = value; env.setCrows(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onDrum(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') drum.one(t);
  else if (kind === 'stop') drum.stop();
  else if (kind === 'report') {
    if (drum.ringing) drum.stop();
    else {
      drum.report(t);
      ui.drumNote(`正在报一夜 ${DRUM.rounds} 更，每更 ${DRUM.perRound} 记，Esc 止鼓。`);
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
    '并已关闭水中倒影；街灯与楼灯仍按你设定的密度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [200, 150, 110][Math.min(2, qualityLevel)];
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
  props.flies.update(t, dt, state.firefly, camera.position);
  water.update(t, state.ripple);
  columns.update(t, state.ripple, 0.75 + 0.45 * Math.min(1, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  drum.update(t, dt, camera.position);
  interiors.update(t);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  env.trees.declutter(camera.position);
  portals.update(t, camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 11 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  // 场上约定北 = +X，罗盘要在 rig 的朝向角上再补 90° 才指得对
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw) + 90);

  composer.render();
  if (wantShot) { capture(); wantShot = false; }

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
    a.download = `镇淮楼-${s.short}.png`;
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
    onDrum,
  });
  ui.loading(0.04, '铺陈楚州夜色…');
  ui.setDrum(0, false, 0);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '压下那轮低月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.36, '垒渠岸、架石桥…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.54, '点亮街灯与楼灯…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns, quarter.anchors, quarter.bridges);
  await nextFrame();

  ui.loading(0.68, '撑起楼内与船舱…');
  interiors = buildInteriors(scene, props.fleet.moored(0));
  await nextFrame();

  ui.loading(0.76, '放下文渠水…');
  rings = new WaveRings();
  water = buildWater(scene, rings);
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.88, '安顿灯火、行人与流萤…');
  portals = buildPortals(scene, rig, props.fleet.moored(0));
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  drum = new NightDrum({
    drum: quarter.drum,
    rings,
    props,
    env,
    position: new THREE.Vector3(LAYOUT.drum.x, LAYOUT.drum.y, LAYOUT.drum.z),
    onCount: (c, ringing, round) => ui.setDrum(c, ringing, round),
  });
  drum.addFlashTo(scene);

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

  ui.loading(1, '谯楼击鼓…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  // handle for scripting the camera and reading scene stats from the console
  window.zhenhuailou = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode,
    portals, drum, LAYOUT, props, columns, env, water, reflections, state, ROUND_NAME,
  };
  // ?st=quanmen 直接落到某个机位，便于逐机位截图与回归对比
  const qs = new URLSearchParams(location.search);
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?bare=1 收起全部 HUD、热点与门环，出干净静帧（tools/shoot.mjs 自检用）
  if (qs.get('bare')) {
    document.body.classList.add('bare');
    hotspots.exteriorShown = false;
    portals.hidden = true;
    ui.hideInfo();
  }
  // ?drum=1 让鼓一直报下去，用来看波环与鼓皮的静帧（无头截图里场景时间走得极慢，先预置几记）
  if (qs.get('drum')) {
    const t = clock.elapsedTime + 0.6;
    drum.report(t);
    for (const age of [0.2, 0.7, 1.5, 2.6]) {
      drum.rings.emit(LAYOUT.drum.x, LAYOUT.drum.z, t - age, 1);
      drum.hits.push({ t0: t - age, s: 1 });
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
    // 点鼓面与鼓腔也算敲一记
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const targets = [quarter.drum.shell, ...quarter.drum.heads];
    if (ray.intersectObjects(targets, false).length) drum.one(clock.elapsedTime);
  };
  // E walks through whatever doorway you are standing in front of
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    portals.use(portals.nearest(camera.position));
  });
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  // 把启动期异常带回 Node（tools/shoot.mjs 读 window.__err），免得对着黑图猜
  window.__err = err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : String(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
