/**
 * 茅山 · 上清灯山 —— 装配与渲染循环
 *
 * 两个招牌动作：
 *  「上灯」按 Y —— 灯串从景区牌坊沿盘山道、道祖广场、印宫、华阳洞一路放到顶宫，
 *     出处是《茅山志》"道场七昼夜"与元符宫燃灯祈福、2026 年新春游园灯会；
 *  「洞天」按 T —— 刀口自南而北切开山体，露出华阳洞内的洞天与摩崖，
 *     洞室尺度志书无实测，纯写意，只为把"第八洞天"这个说法画出来。
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from '../../src/kit.js';
import { Hotspots } from '../../src/hotspots.js';
import { CameraRig } from '../../src/controls.js';
import { buildEnvironment } from './environment.js';
import { buildTerrain } from './terrain.js';
import { buildBuildings } from './buildings.js';
import { buildLaozi } from './laozi.js';
import { buildCave } from './cave.js';
import { buildLights } from './lights.js';
import { buildWater } from './water.js';
import { createUI } from './ui.js';
import { STATIONS as RAW, DEFAULTS, LANTERN_LINE, CAVE_LINE } from './data.js';
import { buildStations } from './anchors.js';

const canvas = document.getElementById('stage');
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const STATIONS = buildStations(RAW);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.4, 7000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.34, 0.7, 0.98);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// 洞天剖视的刀口：默认推到无穷远，等于不切
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);
const clippingPlanes = [clipPlane];

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, setWave, setCave };
window.maoshan = api;

let ui, env, terrain, buildings, laozi, cave, lights, water, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let wave = 0, waveTarget = 0, caveP = 0, caveTarget = 0, verseClock = 0;
const state = { ...DEFAULTS };

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
  const fov = s.fov || 58;
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.0, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.6 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false, fov: s.fov || 58 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 两个动作 */
/** 上灯：0 全山黑，1 顶宫最后一盏落下 */
function setWave(on, snap) {
  const want = on === undefined ? (waveTarget > 0.5 ? 0 : 1) : (on === true ? 1 : Math.max(0, Math.min(1, Number(on))));
  waveTarget = want;
  if (snap) wave = want;
  ui.setLamp(waveTarget > 0.5);
  if (waveTarget > 0.5) { ui.showVerse(LANTERN_LINE); verseClock = 0; }
  else if (caveTarget <= 0.5) ui.hideVerse();
}

/** 洞天：刀口自南推进 */
function setCave(on, snap) {
  const want = on === undefined ? (caveTarget > 0.5 ? 0 : 1) : (on === true ? 1 : Math.max(0, Math.min(1, Number(on))));
  caveTarget = want;
  if (snap) {
    caveP = want;
    cave.setCut(caveP, true);
    applyClip(caveP);
  }
  ui.setCave(caveTarget > 0.5);
  if (caveTarget > 0.5) { ui.showVerse(CAVE_LINE); verseClock = 0; }
  else if (waveTarget <= 0.5) ui.hideVerse();
}

function applyClip(p) {
  const on = p > 0.01;
  const list = on ? clippingPlanes : null;
  terrain.mountain.material.clippingPlanes = list;
  terrain.roads.forEach((r) => { r.mesh.material.clippingPlanes = list; });
  buildings.terraces.grp.traverse((o) => { if (o.material) o.material.clippingPlanes = list; });
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'moon': state.moon = value; env.setMoon(value); break;
    case 'lantern': state.lantern = value; lights.setBright(value); break;
    case 'cloud': state.cloud = value; env.setCloud(value); break;
    case 'mist': state.mist = value; env.setMist(value); break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
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
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已收掉云海的第二层云沿；山景的体量靠月色与灯串撑住，可手动调低上山灯火换回画质。',
  ];
  ui.perfHint(notes[level] || '');
  if (env) env.cloudSea.lip.visible = level < 2 && state.cloud > 0.02;
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);

  // 两个序列都靠时间推进；静帧要预置终态请用 snap
  if (Math.abs(wave - waveTarget) > 0.0005) wave += Math.sign(waveTarget - wave) * Math.min(Math.abs(waveTarget - wave), dt * 0.16);
  lights.setWave(wave);
  if (Math.abs(caveP - caveTarget) > 0.0005) {
    caveP += Math.sign(caveTarget - caveP) * Math.min(Math.abs(caveTarget - caveP), dt * 0.28);
    cave.setCut(caveP);
    applyClip(caveP);
  }

  lights.update(t, dt, state.lantern);
  water.columns.update(t);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (wave > 0.5 || caveP > 0.5) {
    verseClock += dt;
    if (verseClock > 12) ui.hideVerse();
  }
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
    a.download = `茅山夜景-${s.short}.png`;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(STATIONS[stationIndex].fov || 58); },
    onStep: (d) => goToStation(stationIndex + d),
    onLamp: () => setWave(),
    onCave: () => setCave(),
  });
  ui.loading(0.05, '起三峰一脊的山体…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.2, '升月、铺星、放云海…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.42, '削出台地、铺登山道…');
  terrain = buildTerrain(scene);
  await nextFrame();

  ui.loading(0.6, '立顶宫、印宫、红庙与碑…');
  buildings = buildBuildings(scene);
  await nextFrame();

  ui.loading(0.72, '铸 226 块紫铜板的老子像…');
  laozi = buildLaozi(scene, buildings.anchors);
  await nextFrame();

  ui.loading(0.8, '开华阳洞、排摩崖…');
  cave = buildCave(scene, clippingPlanes);
  await nextFrame();

  ui.loading(0.88, '放水库存灯影…');
  water = buildWater(scene);
  await nextFrame();

  ui.loading(0.94, '点上山灯…');
  lights = buildLights(scene, terrain);
  await nextFrame();

  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)) });
  hotspots.labelsVisible = true;
  applyDeepLink();
  rig.goTo(STATIONS[stationIndex].pos, STATIONS[stationIndex].look, { animate: false, fov: STATIONS[stationIndex].fov || 58 });
  rig.setFov(STATIONS[stationIndex].fov || 58);
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[stationIndex].id);

  env.setMoon(state.moon);
  env.setCloud(state.cloud);
  env.setMist(state.mist);
  lights.setBright(state.lantern);
  lights.setWave(wave);
  bloom.strength = state.bloom;
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  composer.render();
  ui.loading(1, '茅山…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  Object.assign(api, { env, terrain, buildings, laozi, cave, lights, water, hotspots, state });
  requestAnimationFrame(frame);
}

/**
 * 截图与自检用的深链（hash 与 query 都吃）：
 *   ?st=dinggong · #station=gate · ?eye=x,y,z&look=x,y,z&fov=52 · ?bare=1
 *   ?lamp=1（灯全上）· ?wave=0.6 · ?cave=1（洞天切到底）· ?moon=1.2&cloud=0.4&lantern=1.4
 * 序列状态一律 snap 到终态：SwiftShader 下一张静帧只有十几帧，靠 dt 推进走不到。
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
  const want = get('st') ?? get('station');
  let flags = '';
  if (want !== null) {
    const [id, f] = String(want).split('.');
    const idx = STATIONS.findIndex((s) => s.id === id);
    if (idx >= 0) stationIndex = idx;
    flags = f || '';
  }
  const eye = get('eye'), look = get('look') || get('at');
  if (eye && look) {
    STATIONS[stationIndex] = {
      ...STATIONS[stationIndex],
      pos: eye.split(',').map(Number),
      look: look.split(',').map(Number),
    };
  }
  const fov = Number(get('fov'));
  if (Number.isFinite(fov) && fov > 0) STATIONS[stationIndex].fov = fov;

  const w = get('wave');
  if (w !== null) setWave(Number(w), true);
  if (Number(get('lamp')) > 0 || flags.includes('lamp')) setWave(1, true);
  if (Number(get('cave')) > 0 || flags.includes('cave')) setCave(1, true);
  for (const k of ['moon', 'cloud', 'lantern', 'mist', 'bloom']) {
    const v = Number(get(k));
    if (Number.isFinite(v) && v >= 0) onParam(k, v);
  }
}

function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}

if (location.protocol === 'file:') {
  const other = document.getElementById('btn-other');
  if (other) other.href = '夫子庙秦淮画廊-3D全景.html';
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.stack || err.message}`;
});
