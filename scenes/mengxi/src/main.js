import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment, MOON_DIR } from './environment.js';
import { initMXMaterials, buildQuarter } from './architecture.js';
import { buildProps } from './props.js';
import { buildStudy, buildHall } from './study.js';
import { buildStream } from './stream.js';
import { LightColumns, Reflections } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, DEFAULTS } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签页里 rAF 会冻住，所以每一步都留一个计时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1100);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.42, 0.6, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, props, study, stream, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
let tourClock = 0;
const state = { lantern: 1, ripple: 1, firefly: 1, people: 8, bloom: 0.42, reflect: true, labels: true, tour: false, autoQuality: true };

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
function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.6 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.4 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  hotspots.exteriorShown = !s.indoor;
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
    case 'lantern':
      state.lantern = value;
      props.setLanterns(value);
      env.fillsOn(value);
      break;
    case 'people': state.people = value; break;
    case 'ripple': state.ripple = value; break;
    case 'firefly': state.firefly = value; env.setStarBright(0.55 + 0.45 * Math.min(1.4, value)); break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；如需更高画质可手动调低巷中灯火。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ 主循环 */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t);
  props.update(t, dt, state, camera.position);
  stream.water.update(t, state.ripple);
  columns.update(t, state.ripple, 1.4 + 0.8 * Math.min(1.4, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  study.update(t, state);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 9 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
    a.download = `梦溪园巷夜景-${s.short}.png`;
    a.click();
  } catch (e) { /* 少数环境下画布不可导出 */ }
}

/* ------------------------------------------------------------------ 装配 */
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
  ui.loading(0.05, '铺开青石板…');

  resize();
  initMaterials();
  initMXMaterials();
  await nextFrame();

  ui.loading(0.2, '升起东南那个月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.4, '起巷、筑园、开月洞…');
  const quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.6, '放下梦溪一泓水…');
  columns = new LightColumns(scene);
  stream = buildStream(scene, MOON_DIR, columns);
  await nextFrame();

  ui.loading(0.74, '挂起沿街灯火…');
  props = buildProps(scene, quarter.anchors);
  props.setLanterns(1);
  await nextFrame();

  ui.loading(0.86, '点上书斋那一盏…');
  study = buildStudy(scene);
  buildHall(scene);
  await nextFrame();

  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  reflections.add(props.grp);

  ui.loading(0.94, '安顿灯影与归人…');
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)) });

  // #station=<id> 直接落机位；#eye=&at= 试构图；#bare 出干净静帧
  const bare = /bare/.test(location.hash);
  if (bare) document.body.classList.add('bare');
  const deep = (location.hash.match(/station=([\w-]+)/) || [])[1];
  stationIndex = Math.max(0, STATIONS.findIndex((s) => s.id === deep));
  const eye = (location.hash.match(/eye=([-\d.,]+)/) || [])[1];
  const at = (location.hash.match(/at=([-\d.,]+)/) || [])[1];
  const pose = eye && at ? { pos: eye.split(',').map(Number), look: at.split(',').map(Number) } : STATIONS[stationIndex];
  rig.goTo(pose.pos, pose.look, { animate: false });
  rig.setFov(Number((location.hash.match(/fov=(\d+)/) || [])[1] || 60));
  ui.setActive(STATIONS[stationIndex].id);
  ui.showInfo(STATIONS[stationIndex]);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[stationIndex].id);
  hotspots.exteriorShown = !STATIONS[stationIndex].indoor;
  if (bare) hotspots.exteriorShown = false;

  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // 先烘一遍阴影与着色器，幕布才不至于黑着揭
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '泉声灯影…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  window.mx = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, state };
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
