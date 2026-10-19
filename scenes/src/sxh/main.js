import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from '../kit.js';
import { LightColumns, Reflections } from '../water.js';
import { Hotspots } from '../hotspots.js';
import { CameraRig } from '../controls.js';
import { createUI } from '../ui.js';
import { initSxhMaterials } from './parts.js';
import { buildEnvironment, MOON_DIR } from './sky.js';
import { buildLand, buildLake } from './lake.js';
import { buildFivePavilionBridge } from './bridge.js';
import { buildPagoda } from './pagoda.js';
import { buildGardens } from './gardens.js';
import { buildShore } from './shore.js';
import { buildProps } from './props.js';
import { STATIONS, DEFAULTS, LAKE } from './data.js';

const canvas = document.getElementById('stage');
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.12, 1400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.5, 0.55, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/** 湖比河宽得多，贴地走近的边界要跟着场景范围放开 */
class LakeRig extends CameraRig {
  nudge(moveX, moveY) {
    const k = this.fov / 2400;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.pos.addScaledVector(right, -moveX * k).addScaledVector(up, moveY * k);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, 1.6, 96);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -(LAKE.halfX - 6), LAKE.halfX - 6);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, LAKE.zFrom + 8, LAKE.zTo - 8);
  }
}

const rig = new LakeRig(camera, canvas);
let ui, env, props, lake, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let tourClock = 0;
const state = { lantern: 1, ripple: 1, boat: 1, crowd: 90, bloom: 0.5, reflect: true, labels: true, tour: false, autoQuality: true };

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
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.8 });
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
    case 'lantern': {
      state.lantern = value;
      props.field.setDensity(value);
      props.strings.uni.uOn.value = Math.min(1, 0.3 + value);
      break;
    }
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
    '并已关闭水中倒影；如需更高画质可手动调低堤桥灯彩。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [180, 140, 100][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);
  props.field.update(t);
  props.strings.uni.uTime.value = t;
  props.fleet.update(t, dt, state.boat);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.lakeLamps.uni.uTime.value = t;
  props.lakeLamps.uni.uFlow.value = state.boat;
  props.moons.update(t, state.ripple);
  lake.update(t, state.ripple);
  columns.update(t, state.ripple, 1.5 + 0.7 * Math.min(1, state.lantern));
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
    a.download = `瘦西湖五亭桥-${s.short}.png`;
    a.click();
  } catch (e) { /* canvas may be tainted in unusual setups */ }
}

function mergeAnchors(...list) {
  const out = { eaves: [], lampPosts: [], windowGlow: [], bridgeLamps: [], archLamps: [], crowdPaths: [], stringEnds: [] };
  for (const a of list) {
    for (const k of Object.keys(out)) {
      if (a[k]) out[k].push(...a[k]);
    }
  }
  return out;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 60 : 54); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '铺开两堤花柳…');

  resize();
  initMaterials();
  initSxhMaterials();
  await nextFrame();

  ui.loading(0.2, '升起扬州的月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.36, '堆出岸与岛…');
  buildLand(scene);
  await nextFrame();

  ui.loading(0.5, '架起五亭桥…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  const bridge = buildFivePavilionBridge(scene, columns);
  const pagoda = buildPagoda(scene, columns);
  const gardens = buildGardens(scene, columns);
  const shore = buildShore(scene, columns);
  await nextFrame();

  ui.loading(0.68, '放下二十四桥的月…');
  lake = buildLake(scene, MOON_DIR);
  reflections = new Reflections(scene);
  reflections.add(bridge.group);
  reflections.add(pagoda.group);
  reflections.add(gardens.group);
  await nextFrame();

  ui.loading(0.84, '点亮堤桥灯彩…');
  props = buildProps(scene, columns, mergeAnchors(bridge.anchors, pagoda.anchors, gardens.anchors, shore.anchors));
  await nextFrame();

  ui.loading(0.93, '安顿船火与归人…');
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;
  const bare = /bare/.test(location.hash);
  if (bare) document.body.classList.add('bare');
  const deep = (location.hash.match(/station=([\w-]+)/) || [])[1];
  stationIndex = Math.max(0, STATIONS.findIndex((s) => s.id === deep));
  const eye = (location.hash.match(/eye=([-\d.,]+)/) || [])[1];
  const at = (location.hash.match(/at=([-\d.,]+)/) || [])[1];
  const pose = eye && at ? { pos: eye.split(',').map(Number), look: at.split(',').map(Number) } : STATIONS[stationIndex];
  rig.goTo(pose.pos, pose.look, { animate: false });
  const fov = Number((location.hash.match(/fov=([\d.]+)/) || [])[1]);
  rig.setFov(fov || 60);
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[stationIndex].id);
  if (bare) hotspots.exteriorShown = false;
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '五亭桥月…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  window.slenderWestLake = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, columns, reflections };
  window.sxh = window.slenderWestLake;
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
