import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter, PAL } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildTown } from './architecture.js';
import { buildWorks } from './saltworks.js';
import { buildProps } from './props.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { NightTide } from './tide.js';
import { STATIONS, TIDE, RIVER } from './data.js';

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
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.4, 3200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.62, 0.58, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, town, works, props, water, columns, reflections, hotspots, tide;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let lampAmp = 1, tideAmp = 0;
const state = {
  lamp: 1, ripple: 1, boat: 1, reed: 1, crowd: 70, bloom: 0.62,
  reflect: true, labels: true, mist: true, smoke: true, tour: false, autoQuality: true,
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
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.9 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  if (s.id === 'dike') ui.tideNote('按 T 起一汛，按 N 把潮程推满一百四十二里。');
  else if (s.id === 'weir') ui.tideNote('潮头撞岸那一刻，坝口会漫进河里来。');
  else if (s.id === 'saltworks') ui.tideNote('灶火随"堤灯灶火"起伏；起潮时风大，火会矮一口。');
  else ui.tideNote('潮头自海上来，撞岸后从坝口漫进串场河。');
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
    case 'lamp':
      state.lamp = value; lampAmp = value;
      props.strings.setOn(Math.min(1.4, 0.25 + value));
      env.lights.forEach((l, i) => { l.userData.base = l.userData.base || l.intensity; l.intensity = l.userData.base * (0.25 + 0.75 * Math.min(1.6, value)); });
      break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'boat': state.boat = value; break;
    case 'reed': state.reed = value; works.reeds.setDensity(value); break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; env.setMist(value); water.setMist(value); break;
    case 'smoke': state.smoke = value; props.fires.setSmoke(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onTide(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') tide.one(t);
  else if (kind === 'stop') tide.stop();
  else if (kind === 'full') {
    if (tide.ringing) tide.stop();
    else {
      tide.full(t);
      ui.tideNote(`正在推潮，潮程每汛加二里，满 ${TIDE.liTotal} 里止。`);
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
    '并已关闭水中倒影；灶火与堤灯仍按你设定的强度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [220, 160, 110][Math.min(2, qualityLevel)];
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

  const st = tide.update(t, dt, camera.position);
  tideAmp = st ? st.amp : 0;
  // 起潮时风大：苇子伏得更低，波纹与光柱都跟着抖
  const wind = 1 + tideAmp * 1.5;
  works.reeds.setWind(wind);
  works.reeds.update(t);
  const rip = state.ripple * (1 + tideAmp * 0.55);

  props.strings.setOn(Math.min(1.4, 0.25 + state.lamp) * (1 - 0.18 * tideAmp));
  props.fires.update(t, dt, state.lamp * (1 - 0.22 * tideAmp));
  props.fleet.update(t, dt, state.boat);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);

  water.update(t, rip);
  columns.mat.uniforms.uDepth.value = 0.42;
  columns.update(t, rip, 0.26 + 0.16 * Math.min(1.2, state.lamp) + tideAmp * 0.1);
  if (reflections.enabled) reflections.update(t, rip);

  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);
  env.trees.declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 12 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
    a.download = `串场河夜潮-${s.short}.png`;
    a.click();
  } catch (e) { /* canvas may be tainted in unusual setups */ }
}

/**
 * 只有贴水的灯火才在水里拖出光柱。光柱必须落在水道内：
 * 直接按灯位摆会在岸上立起一片橙色幕布，所以把 x 折进河道、按离岸远近衰减。
 */
function feedColumns(anchors, ovenLights) {
  const HW = RIVER.halfWidth;
  const put = (p, color, width, depth, k) => {
    const edge = HW - 2.6;
    if (Math.abs(p.x) > HW + 16) return;
    const x = Math.max(-edge, Math.min(edge, p.x));
    const fade = Math.max(0.15, 1 - (Math.abs(p.x) - HW) / 34);
    columns.add(new THREE.Vector3(x, 0, p.z), color, width * 0.7, depth * 0.6, k * fade * 0.8);
  };
  for (const p of anchors.lamps) put(p, PAL.lanternWarm, 1.15, 11, 1.05);
  for (const p of ovenLights) put(p, '#ff9048', 1.5, 13, 0.9);
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 58 : 52); },
    onStep: (d) => goToStation(stationIndex + d),
    onTide,
  });
  ui.loading(0.04, '放下串场河的水…');
  ui.setTide(0, false);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '把月亮从海上托起来…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.34, '垒驳岸、起街巷、横长堤…');
  town = buildTown(scene);
  await nextFrame();

  ui.loading(0.52, '点灶火、立卤池、铺草荡…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  works = buildWorks(scene);
  await nextFrame();

  ui.loading(0.68, '拴盐船、挂灯笼、安顿灶户…');
  props = buildProps(scene, columns, town.anchors, works);
  feedColumns(town.anchors, works.ovenLights);
  await nextFrame();

  ui.loading(0.82, '让夜潮从东海推过来…');
  water = buildWater(scene, new WaveRings());
  reflections = new Reflections(scene);
  reflections.add(town.group);
  reflections.add(works.group);
  tide = new NightTide({ water, env, props, onCount: (li, surging) => ui.setTide(li, surging) });
  await nextFrame();

  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false });
  rig.setFov(58);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 17000);
  hotspots.setCurrent(STATIONS[0].id);
  onParam('lamp', state.lamp);
  onParam('reed', state.reed);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so shaders compile before the curtain lifts
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '潮信已到…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  // handle for scripting the camera and reading scene stats from the console
  window.anfeng = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, tide, town, works, props, columns, env, water, reflections, state };
  // ?st=weir 直接落到某个机位，便于逐机位截图与回归对比
  const qs = new URLSearchParams(location.search);
  // ?bare=1 出一张没有 HUD 与热点的干净静帧，供申报材料与构图核对
  if (qs.get('bare')) {
    document.querySelectorAll('.hud,.panel,.tide,.stations,.info,.compass,.grain')
      .forEach((el) => { el.style.display = 'none'; });
    hotspots.labelsVisible = false;
    hotspots.exteriorShown = false;
  }
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?tide=1 预置几汛，让潮头与坝口的静帧看得见（无头截图里场景时间走得极慢）
  if (qs.get('tide')) {
    // 静帧里场景时间走得极慢，先塞几汛再让整串汛自己往下推
    const t = clock.elapsedTime + 0.4;
    for (const age of [0.2, 1.6, 3.4, 5.6, 7.8]) {
      tide.items.push({ t0: t - age, done: age > 5 });
      tide.li = Math.min(TIDE.liTotal, tide.li + TIDE.liPerSurge);
    }
    tide.full(t);
    ui.setTide(tide.li, true);
  }
  requestAnimationFrame(frame);
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
