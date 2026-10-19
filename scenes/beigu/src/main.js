import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildSky } from './sky.js';
import { buildMountain } from './mountain.js';
import { buildRiver, buildRiverBed, LightColumns, FOG_COLOR, FOG_DENSITY } from './river.js';
import { buildArchitecture } from './buildings.js';
import { buildPlants } from './plants.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, SITES, terrainHeight, WATCH, southBank } from './data.js';

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
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 9000);
scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), FOG_DENSITY);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.beigu = api;
let ui, sky, mountain, river, arch, plants, props, columns, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lamp: 1, tier: 0.4, tide: 1, wind: 1, bloom: 0.3, watch: false, labels: true, tour: false, autoQuality: true };
const reveal = { on: false, v: 1, target: 1 };

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

/**
 * 机位落在真实几何上：站脚取 terrainHeight 或给出的绝对高程，楼面由几何回填
 * （floorOf），视点取目标点地表（水上取 0）再加 lift。
 * 山与形制一动，眼高、视线与热点锚点都跟着动。
 */
function resolveStations() {
  const b = arch ? arch.built : null;
  const FLOORS = {
    beiguLou: b && b.beiguLou.floorY,
    beiguBase: b && b.beiguLou.baseY,
    temple: b && b.temple.floorY,
    duoJing: b && b.duoJing.deck,
    jiangTing: b && b.jiangTing.floorY,
    tower: b && b.ironTower.floorY,
    stele: b && b.stele.floorY,
    gate: b && b.gate.floorY,
  };
  for (const s of STATIONS) {
    const ground = s.site ? SITES[s.site] : null;
    const bx = ground ? ground.x : s.at[0];
    const bz = ground ? ground.z : s.at[1];
    let by = ground ? ground.y : terrainHeight(bx, bz);
    if (s.floorOf) by = FLOORS[s.floorOf] ?? by;
    if (s.floorY !== undefined) by = s.floorY;
    if (s.absY !== undefined) by = s.absY - (s.hOff ?? 1.7);
    if (!(by > -50 && by < 400)) by = terrainHeight(bx, bz);      // 兜底：不许 NaN
    s.pos = [bx, by + (s.hOff ?? 1.7), bz];

    const [lx, lz, lift] = s.look;
    const gy = Math.max(0, terrainHeight(lx, lz));
    s.look = [lx, gy + (lift ?? 0), lz];

    if (s.mark) {
      const [mx, mz, mlift] = s.mark;
      const my = Math.max(0, terrainHeight(mx, mz));
      s.mark = [mx, my + (mlift ?? 3), mz];
    }
  }
}

function fovFor(s) {
  if (s.id === 'aerial') return 40;
  if (s.id === 'bay' || s.id === 'shenzhou') return 58;
  if (s.id === 'hen' || s.id === 'stele') return 46;
  return 52;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = fovFor(s);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.2, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.9 });
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
 * 北望神州：灯自山门一路点到江北，九段（data.js 的 WATCH）。
 * snap=true 直接把进度落到终态——SwiftShader 下一张静帧只有十几帧，
 * 靠 dt 推的序列根本走不完。
 */
function startWatch({ snap = false } = {}) {
  state.watch = true;
  ui.setToggle('watch', true);
  reveal.on = true;
  reveal.target = 1;
  if (snap) {
    reveal.v = 1;
    reveal.on = false;
    props.setWatch(1, { snap: true });
  } else {
    reveal.v = 0;
    props.setWatch(0);
  }
}

function stopWatch() {
  state.watch = false;
  ui.setToggle('watch', false);
  reveal.on = false;
  reveal.v = 1;
  reveal.target = 1;
  props.setWatch(1);
}

function onParam(key, value) {
  switch (key) {
    case 'lamp': state.lamp = value; props?.setLamp(value); break;
    case 'tier': state.tier = value; props?.setTier(value); break;
    case 'tide': state.tide = value; break;
    case 'wind':
      state.wind = value;
      if (plants) for (const u of plants.windUniforms) u.uWind.value = value;
      break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'watch': if (value) startWatch(); else stopWatch(); break;
    case 'labels': state.labels = value; if (hotspots) hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; if (rig) rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 0.85 : DPR);
  composer.setPixelRatio(level >= 1 ? 0.85 : DPR);
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已收小辉光与江上船灯；这一景的水面全靠那几道灯柱，可手动调低寺观灯火换回画质。',
  ];
  bloom.strength = level >= 2 ? state.bloom * 0.5 : state.bloom;
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
  river.update(t, state.tide);
  props.update(t, dt);
  columns.update(t, state.tide, 0.62 + 0.55 * Math.min(1.4, state.lamp) * reveal.v);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (reveal.on) {
    reveal.v = Math.min(reveal.target, reveal.v + dt / 11);
    props.setWatch(reveal.v);
    if (reveal.v >= reveal.target) reveal.on = false;
  }

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 13 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
      if (fps < 22) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
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
    a.download = `北固山夜景-${s.short}.png`;
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
  ui.loading(0.05, '把三峰垒起来…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.14, '升起星月…');
  sky = buildSky(scene);
  scene.fog.color.copy(FOG_COLOR);
  scene.fog.density = FOG_DENSITY;
  await nextFrame();

  ui.loading(0.26, '铺开大江…');
  columns = new LightColumns(scene, 300);
  columns.mesh.renderOrder = 5;
  river = buildRiver(scene);
  buildRiverBed(scene);
  await nextFrame();

  ui.loading(0.46, '垒起后峰、中峰、前峰…');
  mountain = buildMountain(scene);
  await nextFrame();

  ui.loading(0.62, '立寺、楼、塔、亭、牌楼…');
  arch = buildArchitecture(scene);
  await nextFrame();

  ui.loading(0.76, '栽松与芦苇…');
  plants = buildPlants(scene);
  await nextFrame();

  ui.loading(0.86, '点上灯…');
  props = buildProps(scene, arch, mountain, river, columns);
  for (const [x, z] of props.waterLamps) {
    columns.add(new THREE.Vector3(x, 0, z), '#ffc48c', 1.4, 13, 0.6);
  }
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)), viewRange: 720 });
  hotspots.labelsVisible = true;

  resolveStations();
  onParam('lamp', state.lamp);
  onParam('tier', state.tier);
  onParam('wind', state.wind);
  onParam('bloom', state.bloom);
  props.setWatch(1);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);

  goToStation(0, { animate: false, info: true });
  rig.setFov(fovFor(STATIONS[0]));
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[0].id);
  await nextFrame();

  composer.render();      // 先编译一遍着色器，幕布才落
  ui.loading(1, '何处望神州…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { mountain, arch, props, plants, river, hotspots, columns, startWatch, stopWatch,
    setWatch: (v) => { reveal.v = v; reveal.target = v; reveal.on = false; props.setWatch(v, { snap: true }); },
    setTier: (v) => onParam('tier', v), setLamp: (v) => onParam('lamp', v),
    stationOf: (id) => STATIONS.findIndex((s) => s.id === id),
  });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 静帧与脚本走位用的深链（query 与 hash 两种写法都读）：
 *   ?st=shenzhou&bare=1 · ?eye=x,y,z&at=x,y,z&fov=58 · ?watch=1&tier=1&lamp=120
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
  if (has('tier')) onParam('tier', Number(get('tier')));
  if (has('tide')) onParam('tide', Number(get('tide')));
  if (has('wind')) onParam('wind', Number(get('wind')));
  if (has('bloom')) onParam('bloom', Number(get('bloom')));
  if (idx >= 0) {
    if (has('watch') && get('watch') !== '0') startWatch({ snap: true });
    else if (has('watch')) stopWatch();
    goToStation(idx, { info: has('info'), animate: false });
    if (has('fov')) rig.setFov(Number(get('fov')));
    return;
  }
  if (has('watch')) startWatch({ snap: true });
  if (has('eye')) {
    const eye = get('eye').split(',').map(Number);
    const at = (get('at') || '0,-2300,0').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(get('fov') || 55) });
  }
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'w') { ui.setToggle('watch', !state.watch); onParam('watch', !state.watch); }
    else if (k === 'b') { ui.setToggle('watch', !state.watch); onParam('watch', !state.watch); }
  });
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
