import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials } from './kit.js';
import { buildSky } from './sky.js';
import { buildHill } from './hill.js';
import { buildWaters, buildBed, LightColumns, Reflections } from './water.js';
import { buildTemple } from './temple.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, PADS, GROUND, RIVER, TEMPLE, HILL, heightAt, roadAt } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签里 rAF 是冻住的，每一步都留一条计时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, 1, 0.4, 5200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
rig.ground = (x, z) => heightAt(x, z);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, setRobe, playRobe };
window.langshan = api;
let ui, sky, hill, temple, props, water, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lantern: 1, robe: 1, ripple: 1, bloom: 0.3, reflect: true, labels: true, tour: false, autoQuality: true };
let robeTarget = 1, robePlaying = false;

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
 * 机位不许硬写高程：站在地面上的那些，眼高一律由 heightAt 现算，
 * 台上与塔下的目标点跟着 temple 生成的几何走。
 */
function syncStations() {
  const eye = 1.6;
  const set = (id, patch) => {
    const s = STATIONS.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    return s;
  };
  const stand = (x, z, lift = eye) => heightAt(x, z) + lift;

  // 半山路上：站在路床上
  const r = roadAt(0.78);
  const rAhead = roadAt(0.62);
  set('road', { pos: [r.x + 1.2, stand(r.x + 2.4, r.z), r.z + 1.2], look: [rAhead.x, rAhead.y + 2.4, rAhead.z], mark: [rAhead.x, rAhead.y + 1.6, rAhead.z] });

  // 山门：殿台南沿，路正好到这里
  const gt = TEMPLE.gate, gy = heightAt(gt.x, gt.z);
  set('gate', { pos: [gt.x + 5, stand(gt.x + 6, gt.z + 5), gt.z + 7], look: [gt.x, gy + 3.2, gt.z - 4], mark: [gt.x, gy + 4.4, gt.z] });

  const hy = PADS.hall.y;
  set('hall', { pos: [TEMPLE.yuantong.x + 9, stand(TEMPLE.yuantong.x + 10, TEMPLE.yuantong.z + 8), TEMPLE.yuantong.z + 8], look: [TEMPLE.yuantong.x, hy + 3.4, TEMPLE.yuantong.z], mark: [TEMPLE.yuantong.x, temple.yuantong.eaveY - 1.4, TEMPLE.yuantong.z] });
  set('faru', { pos: [TEMPLE.faru.x - 9, stand(TEMPLE.faru.x - 10, TEMPLE.faru.z - 4), TEMPLE.faru.z - 4], look: [TEMPLE.faru.x, hy + 2.8, TEMPLE.faru.z], mark: [TEMPLE.faru.x - 2, hy + 3.2, TEMPLE.faru.z] });

  const pd = PADS.tower;
  set('pagoda', {
    pos: [TEMPLE.pagoda.x, stand(TEMPLE.pagoda.x, TEMPLE.pagoda.z + pd.z1 - pd.z0 - 20), TEMPLE.pagoda.z + 22],
    look: [temple.tower.top.x, temple.tower.top.y - 9, temple.tower.top.z],
    mark: [temple.tower.top.x, temple.tower.top.y, temple.tower.top.z],
  });

  const cp = PADS.cliff, cy = PADS.cliff.y;
  set('cliff', {
    pos: [TEMPLE.daxiang.x + 5, stand(TEMPLE.daxiang.x + 6, TEMPLE.daxiang.z + 5), TEMPLE.daxiang.z + 5],
    look: [RIVER.shoreX - 260, cy - 24, TEMPLE.daxiang.z - 10],
    mark: [TEMPLE.pavilion.x, cy + 1.8, TEMPLE.pavilion.z],
  });

  set('shore', { pos: [-176, GROUND + eye, 46], look: [HILL.cx, heightAt(HILL.cx, HILL.cz) - 36, HILL.cz], mark: [TEMPLE.pavilion.x, cy + 1.4, TEMPLE.pavilion.z] });
  set('luo', {
    pos: [TOMB.x - 20, stand(TOMB.x - 20, TOMB.z - 12), TOMB.z - 12],
    look: [TOMB.x, heightAt(TOMB.x, TOMB.z) + 2.4, TOMB.z],
    mark: [TOMB.x - 12, heightAt(TOMB.x - 12, TOMB.z) + 4.4, TOMB.z],
  });
  set('aerial', { pos: [46, temple.tower.top.y + 34, 216], look: [-40, 82, -30] });
  set('jiang', { mark: [temple.tower.top.x, temple.tower.top.y, temple.tower.top.z] });
}

function fovFor(s) {
  if (s.id === 'aerial') return 44;
  if (s.id === 'jiang') return 48;
  if (s.id === 'pagoda' || s.id === 'cliff') return 62;
  return 55;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = fovFor(s);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.2, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 2 });
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

/* ------------------------------------------------------------------ 袈裟 */

function setRobe(v, { snap = false } = {}) {
  state.robe = Math.min(1, Math.max(0, v));
  robeTarget = state.robe;
  if (snap) {
    robePlaying = false;
    props.setRobe(state.robe);
    ui.setRobeSlider(state.robe);
  } else {
    robePlaying = true;
  }
}

function playRobe() {
  setRobe(0, { snap: true });
  robePlaying = true;
  robeTarget = 1;
}

/* ------------------------------------------------------------------ 参数 */

function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setLantern(value); break;
    case 'robe': setRobe(value, { snap: true }); break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质 */

const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭江中倒影；这一景的夜景大半靠江面那层倒影与光柱，可手动调低灯火亮度换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ 循环 */

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (robePlaying) {
    const v = props.robe + (robeTarget - props.robe) * Math.min(1, dt * 0.55);
    props.setRobe(v);
    ui.setRobeSlider(v);
    state.robe = v;
    if (Math.abs(robeTarget - v) < 0.004) {
      props.setRobe(robeTarget);
      ui.setRobeSlider(robeTarget);
      robePlaying = false;
    }
  }

  rig.update(dt);
  sky.update(t);
  hill.update(t);
  water.update(t, state.ripple);
  props.update(t, state.ripple);
  columns.update(t, state.ripple, 0.7 + 0.55 * Math.min(1.4, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  for (const s of temple.windowSheets) {
    s.mesh.material.emissiveIntensity = s.base * state.lantern * (0.86 + 0.14 * Math.sin(t * 0.8 + s.phase));
  }
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });

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
    a.download = `狼山夜景-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
}

/* ------------------------------------------------------------------ 启动 */

async function boot() {
  ui = createUI({
    stations: STATIONS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onRobe: playRobe,
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(fovFor(STATIONS[stationIndex])); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '放开江面…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.14, '升起星月…');
  sky = buildSky(scene);
  await nextFrame();

  ui.loading(0.3, '垒起江海平原与五山…');
  hill = buildHill(scene);
  columns = new LightColumns(scene, 320);
  columns.mesh.renderOrder = 5;
  water = buildWaters(scene);
  buildBed(scene, hill.group.getObjectByName('sister-hills').material);
  reflections = new Reflections(scene, { amp: 0.55, fade: 110 });
  reflections.add(hill.group.getObjectByName('hill-body'));
  await nextFrame();

  ui.loading(0.52, '切出五方台地与盘山石蹬…');
  await nextFrame();

  ui.loading(0.66, '立塔、殿、门、坊…');
  temple = buildTemple(scene);
  reflections.add(temple.group);
  await nextFrame();

  ui.loading(0.84, '点上灯，放下袈裟…');
  props = buildProps(scene, temple, columns);
  reflections.add(props.group);
  syncStations();
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)), viewRange: 330 });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: fovFor(STATIONS[0]) });
  rig.setFov(fovFor(STATIONS[0]));
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[0].id);
  onParam('lantern', state.lantern);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  composer.render();
  ui.loading(1, '江海第一山…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { hill, temple, props, hotspots, columns, state });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 静帧与脚本相机用的深链，query 与 hash 两种写法都吃：
 *   ?st=pagoda · ?eye=x,y,z&at=x,y,z&fov=60 · ?bare=1 · ?robe=0.55&snap=1
 */
function applyDeepLink() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(location.search);
  const get = (k) => (q.has(k) ? q.get(k) : hash.has(k) ? hash.get(k) : null);

  if (get('bare') !== null) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    document.getElementById('loader').style.display = 'none';
  }
  const r = get('robe');
  if (r !== null) setRobe(Number(r), { snap: true });
  if (get('lantern') !== null) onParam('lantern', Number(get('lantern')) / 100);
  if (get('bloom') !== null) onParam('bloom', Number(get('bloom')) / 100);

  const want = get('st') ?? get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (idx >= 0) { goToStation(idx, { info: get('info') !== null, animate: false }); return; }
  if (get('eye')) {
    const eye = get('eye').split(',').map(Number);
    const at = (get('at') || '-300,60,0').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(get('fov') || 56) });
  }
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
