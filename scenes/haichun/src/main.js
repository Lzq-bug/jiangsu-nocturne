import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from '../../src/kit.js';
import { buildEnvironment } from './environment.js';
import { buildTower } from './tower.js';
import { buildQuarter } from './architecture.js';
import { buildProps } from './props.js';
import { buildRiver, LightColumns, Reflections } from './water.js';
import { Hotspots } from '../../src/hotspots.js';
import { CameraRig } from '../../src/controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS, NICHE_LINE, REVEAL_LINE, inChannel } from './data.js';

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
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.4, 0.62, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, release, reveal };
window.haichun = api;

let ui, env, tower, quarter, props, river, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let nicheOn = false, revealOn = false, verseClock = 0;
const state = { moon: 1.15, niche: 1, lantern: 1, wave: 1, bloom: 0.4, reflect: true, labels: true, tour: false, autoQuality: true };

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
const FOV = { door: 64, eaves: 68, canal: 62, yard: 62, temple: 60, salt: 62, moon: 44, aerial: 46 };

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = FOV[s.id] || 58;
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.8, fov });
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
  else rig.goTo(s.pos, s.look, { animate: false, fov: FOV[s.id] || 58 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 两个动作 */
/** 放龛：48 龛自塔门所在面起、自下而上次第点亮 */
function release(force, snap) {
  nicheOn = force === undefined ? !nicheOn : !!force;
  tower.release(nicheOn, snap);
  ui.setNiche(nicheOn);
  if (nicheOn) { ui.showVerse(NICHE_LINE); verseClock = 0; }
  else ui.hideVerse();
}

/** 剖视：宋皮渐隐，露出包在里面的唐塔 */
function reveal(force, snap) {
  revealOn = force === undefined ? !revealOn : !!force;
  tower.reveal(revealOn, snap);
  ui.setReveal(revealOn);
  if (revealOn && !nicheOn) ui.showVerse(REVEAL_LINE);
  if (!revealOn && !nicheOn) ui.hideVerse();
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'moon': state.moon = value; env.setMoon(value); break;
    case 'niche': state.niche = value; tower.setNicheBright(value); break;
    case 'lantern': state.lantern = value; props.setLantern(value); break;
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
    '并已关闭河里的倒影；这塔的夜景靠塔身与 48 龛撑住，可手动调低檐下灯火换回画质。',
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
  river.update(t, state.wave);
  columns.update(t, state.wave, 1.2 + 0.6 * Math.min(1, state.lantern) + 0.5 * st.niche + 0.3 * st.reveal);
  if (reflections.enabled) reflections.update(t, state.wave);
  props.update(t, dt);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  // 诗句浮一句就收，灯留着
  if (nicheOn || revealOn) {
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
    a.download = `海春轩塔夜景-${s.short}.png`;
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
    onNiche: () => release(),
    onReveal: () => reveal(),
  });
  ui.loading(0.05, '铺开平原上的地坪与驳岸…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.22, '升起西北天上那轮月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.46, '叠七层密檐、开 48 只圭形龛…');
  tower = buildTower(scene);
  await nextFrame();

  ui.loading(0.64, '围塔院、立寺廒、铺老街…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.8, '放下晏溪河的水…');
  columns = new LightColumns(scene);
  river = buildRiver(scene, columns);
  reflections = new Reflections(scene);
  reflections.add(tower.group);
  reflections.add(quarter.group);
  tower.bindMirror(reflections.mirror);
  await nextFrame();

  ui.loading(0.92, '点亮石灯与檐前灯笼…');
  props = buildProps(scene, quarter.anchors, columns);
  // 岸柳与灯杆脚下的光柱一律折进水道
  for (const [x, z] of quarter.anchors.lampPosts) {
    if (z > 12 && z < 26) columns.add(new THREE.Vector3(x, 0, inChannel(z + 4)), '#ffbe72', 0.85, 7, 0.7);
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
  env.setMoon(state.moon);
  props.setLantern(state.lantern);
  props.setCrowd(42);
  tower.setNicheBright(state.niche);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先暖一次渲染，把 shader 编译掉再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '海春轩塔…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  Object.assign(api, { env, tower, quarter, props, river, columns, hotspots });
  requestAnimationFrame(frame);
}

/**
 * 截图与自检用的深链（hash 与 query 都吃）：
 *   #station=door · ?eye=x,y,z&at=x,y,z&fov=60 · #bare（隐去界面）
 *   ?niche=1（48 龛直接点亮）· ?reveal=1（外皮直接渐隐，剖视内塔）· ?moon=0.6
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
  const want = get('station');
  let flags = '';
  if (want !== null) {
    // 支持 "door" 或 "door.niche" / "canal.niche.reveal"，连拍时不必额外参数
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
  // 预置状态必须把内部 target 一起设了，否则渲染循环里会收回去；
  // snap 直接落位——SwiftShader 下一张静帧只有十几帧，靠时间推进的序列走不到
  if (Number(get('niche')) > 0 || flags.includes('niche')) release(true, true);
  if (Number(get('reveal')) > 0 || flags.includes('reveal')) reveal(true, true);
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
