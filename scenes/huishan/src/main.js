import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { lanternMaterial } from './build.js';
import { buildSky } from './sky.js';
import { buildHills } from './hills.js';
import { buildWater, LightColumns, Reflections } from './water.js';
import { buildStreet } from './street.js';
import { buildSpring } from './spring.js';
import { buildGarden } from './garden.js';
import { buildTemple } from './temple.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, GARDEN, SPRING, TEMPLE } from './data.js';
import { createSong } from './song.js';

const canvas = document.getElementById('stage');
// 后台标签页里 rAF 会被冻住，所以每一步都另挂一个计时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.35, 2600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.4, 0.66, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode };
window.huishan = api;

let ui, sky, hills, water, columns, reflections, street, spring, garden, temple, hotspots;
let stationIndex = 0, wantShot = false, qualityLevel = 0;
const state = { lantern: 1, spring: 1, pagoda: 1, ripple: 1, bloom: 0.4, reflect: true, labels: true, tour: false, autoQuality: true };
let lanternGroups = [];
let song = null;
/** 灯浪：从街西头扫到浜口，配合"庙市夜晚灯火如海" */
let wave = null;
let moonLift = 0;

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
  const fov = s.id === 'aerial' ? 48 : s.id === 'spring' ? 60 : 55;
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
  else rig.goTo(s.pos, s.look, { animate: false, fov: 55 });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function setLantern(v) {
  state.lantern = v;
  const c = 0.3 + 1.25 * Math.min(1.6, v);
  lanternMaterial().color.setScalar(c);
  for (const g of lanternGroups) {
    g.visible = v > 0.02;
    g.traverse((o) => {
      if (o.isSprite && o.userData.halo) {
        const k = o.userData.halo * (0.72 + 0.3 * Math.min(1.4, v));
        o.scale.set(k, k, 1);
      }
    });
  }
}

function onParam(key, value) {
  switch (key) {
    case 'lantern': setLantern(value); break;
    case 'spring': state.spring = value; break;
    case 'pagoda':
      state.pagoda = value;
      hills.tower.lampMesh.visible = value > 0.02;
      hills.tower.halo.visible = value > 0.02;
      hills.tower.halo.scale.set(30 + 26 * Math.min(1.4, value), 42 + 36 * Math.min(1.4, value), 1);
      break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect':
      state.reflect = value;
      for (const r of reflections) r.enabled = value && qualityLevel < 2;
      break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ quality */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  for (const r of reflections) r.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水面倒影；惠山古镇的夜景很吃这一层镜面，可手动调低沿街灯火换回画质。',
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
  sky.update(t);
  water.update(t, state.ripple);
  columns.update(t, state.ripple, 0.55 + 0.65 * Math.min(1.4, state.lantern));
  spring.update(t, state.spring * (1 + moonLift));
  garden.update(t, state.lantern);
  temple.update(t, state.lantern);
  const flick = 1 + 0.03 * Math.sin(t * 3.1);
  for (const r of reflections) if (r.enabled) r.update(t, state.ripple * flick);
  if (wave) {
    const w = t - wave.t0;
    if (w > 3.6) wave = null;
    else {
      const front = -60 + (w / 3.2) * 420;
      for (const g of lanternGroups) {
        g.traverse((o) => {
          if (!o.isSprite || !o.userData.halo) return;
          const near = Math.exp(-((o.position.z - front) ** 2) / (2 * 34 ** 2));
          const k = o.userData.halo * (1 + 0.85 * near);
          o.scale.set(k, k, 1);
        });
      }
    }
    if (!wave) setLantern(state.lantern);
  }
  moonLift *= 0.988;
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

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
    a.download = `惠山古镇二泉灯影-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 55 : 50); },
    onStep: (d) => goToStation(stationIndex + d),
    onSong: () => playSong(),
  });
  ui.loading(0.05, '铺开夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.18, '升起星月…');
  sky = buildSky(scene);
  await nextFrame();

  ui.loading(0.34, '堆起惠山与锡山…');
  hills = buildHills(scene);
  await nextFrame();

  ui.loading(0.5, '放下寺塘泾的水…');
  columns = new LightColumns(scene, 1600);
  columns.mesh.renderOrder = 5;
  water = buildWater(scene);
  reflections = [
    new Reflections(scene, 0),            // 浜
    new Reflections(scene, GARDEN.pond.y),   // 锦汇漪
    new Reflections(scene, SPRING.lower.y),  // 二泉三池
    new Reflections(scene, TEMPLE.lotus.y),  // 金莲池
  ];
  await nextFrame();

  ui.loading(0.66, '沿河摆下祠堂与铺面…');
  street = buildStreet(scene, columns, reflections[0]);
  await nextFrame();

  ui.loading(0.78, '叠二泉的三池一亭…');
  spring = buildSpring(scene, columns, reflections[2]);
  await nextFrame();

  ui.loading(0.88, '开锦汇漪、借龙光塔…');
  garden = buildGarden(scene, columns, reflections[1]);
  await nextFrame();

  ui.loading(0.95, '点亮惠山寺…');
  temple = buildTemple(scene, columns, reflections[3]);
  // 唐经幢与金莲桥的倒影值得单独走一遍水
  // 龙光塔借进锦汇漪：塔影入池是写意，但镜面几何是真的
  reflections[1].add(hills.tower.group);
  // 镇区顶光：鸟瞰时屋脊要分得出前后
  const townGlow = new THREE.PointLight(0xffb478, 14000, 900, 2);
  townGlow.position.set(4, 74, 150);
  const gardenGlow = new THREE.PointLight(0x9fc4ff, 5200, 620, 2);
  gardenGlow.position.set(56, 62, -150);
  scene.add(townGlow, gardenGlow);
  lanternGroups = [street.eaveLanterns, ...street.strings, garden.lanterns, temple.lanterns];
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
    viewRange: 620,
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: 55 });
  rig.setFov(55);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  composer.render();   // 先暖一次，把着色器编好再幕启
  ui.loading(1, '二泉灯影…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  song = createSong({
    spring,
    onLanternWave: (delay) => { wave = { t0: clock.elapsedTime + delay }; },
    onMoonRise: (delay) => { setTimeout(() => { moonLift = 0.9; }, delay * 1000); },
  });
  Object.assign(api, { hills, street, spring, garden, temple, hotspots, columns, reflections, playSong });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 截图与脚本机位用的深链：
 *   #station=spring · #eye=x,y,z&at=x,y,z&fov=60 · #bare（隐藏 HUD）
 */
function applyDeepLink() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.has('bare')) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    document.getElementById('loader').style.display = 'none';
  }
  const want = hash.get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (idx >= 0) { goToStation(idx, { info: false, animate: false }); return; }
  if (hash.get('eye')) {
    const eye = hash.get('eye').split(',').map(Number);
    const at = (hash.get('at') || '0,6,0').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(hash.get('fov') || 55) });
  }
}

function playSong() {
  if (!song) return;
  if (!song.play()) ui.perfHint('这台浏览器不放音频，泉声只能看涟漪。');
  else if (stationIndex !== 1) goToStation(1);   // 泉声当然要在二泉听
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
