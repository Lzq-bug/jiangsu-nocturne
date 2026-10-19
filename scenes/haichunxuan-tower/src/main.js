import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildQuarter } from './architecture.js';
import { buildPagoda } from './tower.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { EveningBell } from './bell.js';
import { STATIONS, BELL, SITE, PAGODA, CANAL } from './data.js';

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
// 无基塔解剖用的是材质级剖切面
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.62, 0.5, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, tower, props, water, creek, columns, reflections, rings, hotspots, quarter, portals, interiors, bell;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  lantern: 1, crowd: 70, ripple: 1, boat: 1, mist: 1, cut: 210, bloom: 0.62,
  reflect: true, labels: true, fog: true, crows: true, voyage: true, anatomy: false,
  tour: false, autoQuality: true,
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
  else if (s.id === 'tier') ui.tierNote(`已点 ${tower.litCount} 龛，按 L 再上一层。`);
  else if (s.id === 'base') ui.tierNote('按 X 开无基塔解剖，剖刀朝向在参数面板里转。');
  else ui.bellNote('钟声自钟楼起，贴着晏溪河与泰东河散开。');
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
    case 'lantern':
      state.lantern = value;
      props.field.setDensity(value);
      props.drift.setDensity(Math.min(1, 0.35 + value));
      props.strings.set(Math.min(1, 0.25 + value));
      break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'boat': state.boat = value; break;
    case 'mist':
      state.mist = value;
      scene.fog.density = 0.0034 + 0.0026 * value;
      env.setFrost(state.fog && value > 0.06);
      break;
    case 'cut': state.cut = value; tower.setCut(value); break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'fog': state.fog = value; env.setFrost(value && state.mist > 0.06); water.setFrost(value); creek.setFrost(value); break;
    case 'crows': state.crows = value; env.setCrows(value); break;
    case 'voyage': state.voyage = value; break;
    case 'anatomy': state.anatomy = value; tower.setAnatomy(value); break;
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

function onTier(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') tower.lightTier();
  else if (kind === 'all') tower.lightAll();
  else tower.clear();
  ui.setTier(tower.litCount, tower.tierCountValue);
  ui.bellNote(kind === 'off' ? '塔灯熄了，河上只剩船灯。' : '龛灯逐层爬升，河面倒影跟着亮起来。');
  void t;
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
    '并已关闭水中倒影；塔灯与河灯仍按你设定的密度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [230, 175, 120][Math.min(2, qualityLevel)];
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
  props.drift.update(t, dt);
  props.fleet.update(t, dt, state.boat, tower.glowLevel, state.voyage);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  tower.update(t, dt);
  water.update(t, state.ripple);
  creek.update(t, state.ripple);
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
    a.download = `海春轩塔-${s.short}.png`;
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
    onTier,
    onAnatomy: (v) => onParam('anatomy', v),
  });
  ui.loading(0.04, '铺陈西溪夜色…');
  ui.setBell(0, false);
  ui.setTier(0, 0);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起海面来的月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.32, '垒两河驳岸、起街市…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.5, '砌海春轩塔…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  tower = buildPagoda(scene, columns);
  tower.setCut(state.cut);
  await nextFrame();

  ui.loading(0.64, '点亮龛灯、河灯与船火…');
  props = buildProps(scene, columns, quarter.anchors, tower);
  await nextFrame();

  ui.loading(0.74, '撑起殿内与船舱…');
  interiors = buildInteriors(scene, props.fleet.moored(0));
  await nextFrame();

  ui.loading(0.82, '放下泰东河与晏溪河…');
  rings = new WaveRings();
  water = buildWater(scene, rings, { axis: 'z', halfWidth: CANAL.halfWidth, length: CANAL.length, z: 0, name: 'taidonghe' });
  creek = buildWater(scene, rings, {
    axis: 'x', halfWidth: SITE.creek.halfWidth,
    length: SITE.creek.x1 - SITE.creek.x0, x: (SITE.creek.x0 + SITE.creek.x1) / 2,
    z: SITE.creek.z, name: 'yanxihe',
  });
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.9, '安顿香客、船工与夜航…');
  portals = buildPortals(scene, rig, props.fleet.moored(0), quarter.bell.bellPos);
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  bell = new EveningBell({
    tower: quarter.bell,
    rings,
    props,
    env,
    position: quarter.bell.bellPos,
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

  ui.loading(1, '塔灯与晚钟…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  // handle for scripting the camera and reading scene stats from the console
  window.haichun = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode,
    portals, bell, tower, props, quarter, columns, env, water, creek, reflections, state, PAGODA,
  };
  const qs = new URLSearchParams(location.search);
  // ?st=base 直接落到某个机位，便于逐机位截图与回归对比
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?tiers=1|7 预置点亮的层数（无头截图里时间走得慢，先替它点好）
  const tr = qs.get('tiers');
  if (tr) {
    const n = tr === 'all' || tr === '7' ? PAGODA.nicheTiers : Math.max(0, Math.min(PAGODA.nicheTiers, Number(tr) || 0));
    for (let k = 0; k < n; k++) tower.lightTier();
    ui.setTier(tower.litCount, tower.tierCountValue);
  }
  if (qs.get('anatomy')) {
    $('c-anatomy').click();
    const cut = qs.get('cut');
    if (cut) {
      const el = document.getElementById('s-cut');
      el.value = cut;
      el.dispatchEvent(new Event('input'));
    }
  }
  // ?bell=1 让钟一直撞下去，用来看波环与摆钟的静帧
  if (qs.get('bell')) {
    const t = clock.elapsedTime + 0.6;
    bell.ring108(t);
    for (const age of [0.2, 0.8, 1.8, 3.2]) {
      bell.rings.emit(quarter.bell.bellPos.x, quarter.bell.bellPos.z, t - age, 1);
      bell.hits.push({ t0: t - age, s: 1 });
    }
  }
  requestAnimationFrame(frame);
}

function $(id) { return document.getElementById(id); }

// hotspot taps come through the rig
function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const door = portals.pick(ndc, camera);
    if (door) { portals.use(door); return; }
    const hit = hotspots.pick(ndc, camera);
    if (hit) { goToStation(STATIONS.indexOf(hit)); return; }
    // 点塔身也算点一龛：点到哪层就点亮到哪层
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(tower.group, true).length) { onTier('one'); return; }
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
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.stack || err.message}`;
});
