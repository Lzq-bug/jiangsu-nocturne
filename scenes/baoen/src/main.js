import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from '../../src/kit.js';
import { buildEnvironment } from './environment.js';
import { buildTower } from './tower.js';
import { buildPalace } from './palace.js';
import { buildQuarter } from './architecture.js';
import { buildProps } from './props.js';
import { buildWaters, LightColumns, Reflections } from './water.js';
import { Hotspots } from '../../src/hotspots.js';
import { CameraRig } from '../../src/controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS, LAMP_LINE, PIT_LINE, RIVER, POOL, inChannel } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签页里 rAF 会冻住，所以每一步都再挂一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.36, 0.62, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, lightUp, openPit };
window.baoen = api;

let ui, env, tower, palace, quarter, props, waters, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let lampOn = false, pitOn = false, verseClock = 0;
const state = { moon: 1.1, lamp: 1, street: 1, wave: 1, bloom: 0.36, reflect: true, labels: true, tour: false, autoQuality: true };

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
const FOV = {
  kiln: 60, street: 52, river: 82, bridge: 58, tianwang: 58, dadian: 60,
  pool: 62, door: 50, eaves: 74, dig: 62, palace: 50, aerial: 46,
};
let bareMode = false;

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = FOV[s.id] || 58;
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.8, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  // 地宫机位在地坪之下：地面上的热点与标签在那里没有意义；bare 时一律不收
  hotspots.exteriorShown = !bareMode && s.pos[1] > 0;
  if (info) ui.showInfo(s);
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false, fov: FOV[s.id] || 58 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 两个动作 */
/** 燃灯：146 盏篝灯自第一层南门起、逐层向上次第点亮 */
function lightUp(force, snap) {
  lampOn = force === undefined ? !lampOn : !!force;
  tower.release(lampOn, snap);
  ui.setLamp(lampOn);
  if (lampOn) { ui.showVerse(LAMP_LINE); verseClock = 0; }
  else ui.hideVerse();
}

/** 开宫：抽掉探方盖板，露出塔基之下的北宋地宫 */
function openPit(force, snap) {
  pitOn = force === undefined ? !pitOn : !!force;
  palace.open(pitOn, snap);
  ui.setPit(pitOn);
  if (pitOn && !lampOn) ui.showVerse(PIT_LINE);
  if (!pitOn && !lampOn) ui.hideVerse();
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'moon': state.moon = value; env.setMoon(value); break;
    case 'lamp': state.lamp = value; tower.setLampBright(value); break;
    case 'street': state.street = value; props.setLantern(value); break;
    case 'wave': state.wave = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value && qualityLevel < 2; break;
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
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水里的倒影；这塔七十八米、146 盏灯自己撑得住画面，可手动调低街市灯火换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);
  const st = tower.update(t, dt);
  const pz = palace.update(t, dt);
  waters.update(t, state.wave);
  columns.update(t, state.wave, 1.1 + 0.7 * Math.min(1, state.street) + 0.9 * st.lamp + 0.3 * pz.open);
  if (reflections.enabled) reflections.update(t, state.wave);
  props.setLampProgress(st.lamp, state.lamp * (lampOn ? 1 : 0.05));
  props.update(t, dt);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  // 诗句浮一句就收，灯留着
  if (lampOn || pitOn) {
    verseClock += dt;
    if (verseClock > 12) ui.hideVerse();
  }

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 11 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
    a.download = `大报恩寺琉璃塔夜景-${s.short}.png`;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? (FOV[STATIONS[stationIndex].id] || 58) : 54); },
    onStep: (d) => goToStation(stationIndex + d),
    onLamp: () => lightUp(),
    onPit: () => openPit(),
  });
  ui.loading(0.05, '铺开长干里的地坪、河汊与探方…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.2, '升起西北天上那轮月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.42, '叠九层八面、砌琉璃砖…');
  tower = buildTower(scene);
  await nextFrame();

  ui.loading(0.56, '在塔基之下六米七四放下北宋地宫…');
  palace = buildPalace(scene);
  await nextFrame();

  ui.loading(0.7, '立山门两殿、围院墙、开琉璃窑…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.84, '放下香水河与放生池的水…');
  columns = new LightColumns(scene);
  waters = buildWaters(scene);
  reflections = new Reflections(scene);
  reflections.add(tower.group);
  reflections.add(quarter.group);
  tower.bindMirror(reflections.mirror);
  await nextFrame();

  ui.loading(0.93, '点亮石灯、檐前灯笼与窑火…');
  props = buildProps(scene, quarter.anchors, columns, tower.anchors.lampHalos);
  // 桥上与岸上的灯，光柱一律折进水道
  for (const [x, z] of quarter.anchors.lampPosts) {
    if (z > RIVER.at - 14 && z < RIVER.at + 14) columns.add(new THREE.Vector3(x, 0, inChannel(z)), '#ffbe72', 0.8, 6.5, 0.55);
  }
  await nextFrame();

  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)) });
  hotspots.labelsVisible = true;
  applyDeepLink();
  rig.goTo(STATIONS[stationIndex].pos, STATIONS[stationIndex].look, { animate: false, fov: FOV[STATIONS[stationIndex].id] || 58 });
  rig.setFov(FOV[STATIONS[stationIndex].id] || 58);
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[stationIndex].id);
  hotspots.exteriorShown = !bareMode && STATIONS[stationIndex].pos[1] > 0;
  env.setMoon(state.moon);
  props.setLantern(state.street);
  props.setCrowd(52);
  tower.setLampBright(state.lamp);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先暖一次渲染，把 shader 编译掉再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '大报恩寺琉璃塔…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  Object.assign(api, { env, tower, palace, quarter, props, waters, columns, hotspots });
  requestAnimationFrame(frame);
}

/**
 * 截图与自检用的深链（hash 与 query 都吃）：
 *   #station=door · ?eye=x,y,z&at=x,y,z&fov=60 · #bare（隐去界面）
 *   ?lamp=1（146 盏直接点亮）· ?pit=1（盖板直接抽掉）· ?moon=0.6
 *   机位可串动作：#station=dig.lamp / #station=palace.pit.lamp
 */
function applyDeepLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(location.search);
  const get = (k) => (h.has(k) ? h.get(k) : q.get(k));
  const has = (k) => h.has(k) || q.has(k);
  if (has('bare')) {
    bareMode = true;
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    hotspots.labelsVisible = false;
    document.getElementById('loader').style.display = 'none';
  }
  const want = get('station');
  let flags = '';
  if (want !== null) {
    const [id, f] = String(want).split('.');
    const idx = STATIONS.findIndex((s) => s.id === id);
    if (idx >= 0) stationIndex = idx;
    flags = f || '';
  }
  const eye = get('eye'), at = get('at');
  if (eye && at) {
    STATIONS[stationIndex] = {
      ...STATIONS[stationIndex],
      pos: eye.split(',').map(Number),
      look: at.split(',').map(Number),
    };
  }
  const fov = Number(get('fov'));
  if (Number.isFinite(fov) && fov > 0) FOV[STATIONS[stationIndex].id] = fov;
  // 预置状态必须 snap 直接落位——SwiftShader 下一张静帧只有十几帧，
  // 靠时间推进的序列走不到
  if (Number(get('lamp')) > 0 || flags.includes('lamp')) lightUp(true, true);
  if (Number(get('pit')) > 0 || flags.includes('pit')) openPit(true, true);
  const moon = Number(get('moon'));
  if (Number.isFinite(moon) && moon > 0) onParam('moon', moon);
}

function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}

// 打包成单文件后是 file://，跨场景的链接要改指到 dist 里的兄弟文件
if (location.protocol === 'file:') {
  const other = document.getElementById('btn-other');
  if (other) other.href = '夫子庙秦淮画廊-3D全景.html';
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.stack || err.message}`;
});
