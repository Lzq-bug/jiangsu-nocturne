import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { STATIONS, DEFAULTS, STREET } from './data.js';
import { initMaterials, halos, lightPools } from './kit.js';
import { buildSky, FOG_DENSITY } from './sky.js';
import { buildStreet } from './street.js';
import { buildProps } from './props.js';
import { buildWharf } from './wharf.js';
import { buildCanal, LightColumns } from './canal.js';
import { CameraRig } from './controls.js';
import { Hotspots } from './hotspots.js';
import { createUI } from './ui.js';
import * as T from './textures.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
let dpr = Math.min(window.devicePixelRatio || 1, 1.25);
renderer.setPixelRatio(dpr);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.12, 3200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), DEFAULTS.bloom / 100, 0.66, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
// 面板上的滑杆是百分数，内部一律用 0..1
const norm = (v) => v / 100;
const state = {
  lantern: norm(DEFAULTS.lantern),
  crowd: norm(DEFAULTS.crowd),
  shop: norm(DEFAULTS.shop),
  ripple: norm(DEFAULTS.ripple),
  bloom: norm(DEFAULTS.bloom),
  reflect: DEFAULTS.reflect,
  labels: DEFAULTS.labels,
  tour: DEFAULTS.tour,
  autoQuality: DEFAULTS.autoQuality,
};
let street, props, wharf, canal, columns, halo, pools, poolsWater, hotspots, ui;
let current = STATIONS[0];
let tourOn = false, tourClock = 0;

/** 无头截图时合成器不一定按帧走，所以 rAF 必须配一个定时器兜底 */
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}

/** 灯辉按"米"给尺寸，所以每帧把视野角换算成像素系数，缩放视野时光晕不会飘 */
function syncHaloScale() {
  if (!halo) return;
  const h = canvas.clientHeight || window.innerHeight;
  halo.setViewport((h / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 0.42);
}

/* ------------------------------------------------------------------ 机位切换 */

function goTo(station, { animate = true, seconds = 1.6, showInfo = true, writeHash = true } = {}) {
  current = station;
  if (rig.mode === 'pano') rig.goTo(station.pos, station.look, { animate, seconds, fov: station.fov || 55 });
  else rig.goToOrbit(station.pos, station.look, { animate, seconds });
  ui.setActive(station.id);
  hotspots.setCurrent(station.id);
  if (showInfo) ui.showInfo(station);
  if (writeHash) location.hash = station.id;
}

function step(dir) {
  const i = STATIONS.findIndex((s) => s.id === current.id);
  goTo(STATIONS[(i + dir + STATIONS.length) % STATIONS.length]);
}

function setMode(m) {
  const from = rig.mode;
  rig.mode = m;
  if (m === 'free') rig.goToOrbit(current.pos, current.look, { animate: false });
  else rig.goTo(current.pos, current.look, { animate: false, fov: current.fov || 55 });
  if (from !== m) ui.setMode(m);
}

/* -------------------------------------------------------------------- 参数 */

function onParam(key, value) {
  if (key === 'lantern' || key === 'crowd' || key === 'shop' || key === 'ripple' || key === 'bloom') state[key] = value;
  switch (key) {
    case 'lantern': props.setLantern(value); break;
    case 'crowd': props.setCrowd(value); break;
    case 'shop': props.setShopLit(value); break;
    case 'bloom': bloom.strength = value; break;
    case 'reflect':
      columns.mesh.visible = value;
      pools.mesh.visible = value;
      poolsWater.mesh.visible = value;
      break;
    case 'labels': hotspots.labelsVisible = value; break;
    case 'tour': setTour(value); break;
    case 'autoQuality':
      state.autoQuality = value;
      if (!value) applyQuality(0);
      break;
    default: break;
  }
}

function applyAll() {
  props.setLantern(state.lantern);
  props.setCrowd(state.crowd);
  props.setShopLit(state.shop);
  bloom.strength = state.bloom;
  columns.mesh.visible = state.reflect;
  pools.mesh.visible = state.reflect;
  poolsWater.mesh.visible = state.reflect;
  hotspots.labelsVisible = state.labels;
}

function setTour(on) {
  tourOn = on;
  tourClock = 0;
  rig.autoRotate = on;
}

/* ------------------------------------------------------------------ 画质阶梯 */

let quality = 0, slowBeats = 0, fpsAcc = 0, fpsFrames = 0, fpsShown = 0;

function applyQuality(level) {
  quality = level;
  const ladder = [1.25, 1.0, 0.82, 0.7];
  dpr = Math.min(window.devicePixelRatio || 1, ladder[level]);
  renderer.setPixelRatio(dpr);
  resize();
  if (level >= 2) { columns.mesh.visible = false; pools.mesh.visible = false; poolsWater.mesh.visible = false; }
  else if (state.reflect) { columns.mesh.visible = true; pools.mesh.visible = true; poolsWater.mesh.visible = true; }
  if (level >= 3) bloom.strength = Math.min(bloom.strength, 0.3);
  ui.perfHint(level >= 2 ? `已自动降到画质档 ${level}：关闭水中灯影与地面灯斑` : '');
}

/* -------------------------------------------------------------------- 主循环 */

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  syncHaloScale();

  halo.update(t);
  props.update(t);
  wharf.update(t);
  canal.update(t, state.ripple);
  columns.update(t, state.ripple, columns.mesh.visible ? 0.5 + 0.5 * state.lantern : 0);
  hotspots.update(camera, t, { width: canvas.clientWidth, height: canvas.clientHeight });

  if (rig.mode === 'pano') ui.setCompass((rig.yaw * 180) / Math.PI);
  else ui.setCompass((rig.theta * 180) / Math.PI);

  if (tourOn && !rig.travel) {
    tourClock += dt;
    if (tourClock > 9) { tourClock = 0; step(1); }
  }

  composer.render();

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.6) {
    fpsShown = Math.round(fpsFrames / fpsAcc);
    ui.setFps(fpsShown, fpsShown < 34);
    fpsAcc = 0; fpsFrames = 0;
    if (state.autoQuality) {
      if (fpsShown < 28) slowBeats++; else slowBeats = Math.max(0, slowBeats - 1);
      if (slowBeats >= 3 && quality < 3) { applyQuality(quality + 1); slowBeats = 0; }
    }
  }
}

// 启动期异常带回 window.__err，截图脚本与调试面板都读这一处
window.addEventListener('error', (e) => { window.__err = `${window.__err ? window.__err + ' | ' : ''}${e.message}`; });
window.addEventListener('unhandledrejection', (e) => {
  const m = e.reason && e.reason.message ? e.reason.message : e.reason;
  window.__err = `${window.__err ? window.__err + ' | ' : ''}${m}`;
});

/* -------------------------------------------------------------------- 截图 */

function capture() {
  composer.render();
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `东关街-${current.id}-${Date.now()}.png`;
  a.click();
}

/* -------------------------------------------------------------------- 深链 */

function applyDeepLink() {
  const tokens = decodeURIComponent(location.hash || '').replace(/^#/, '').split(/[\/&]/).filter(Boolean);
  const bare = tokens.includes('bare');
  hotspots.grp.visible = !bare;
  hotspots.labelsVisible = !bare && state.labels;
  for (const tk of tokens) {
    if (tk === 'bare') document.body.classList.add('bare');
    else if (tk === 'noaq') { state.autoQuality = false; ui.params.autoQuality = false; }
    else {
      const s = STATIONS.find((x) => x.id === tk);
      // 点机位时 goTo 已经把 hash 写成目标了，别把自己再跳一次
      if (s && s.id !== current.id) goTo(s, { animate: false, showInfo: !bare, writeHash: false });
    }
  }
}

/* -------------------------------------------------------------------- 启动 */

async function boot() {
  ui = createUI({
    stations: STATIONS,
    onChange: onParam,
    onSelect: (s) => goTo(s),
    onMode: setMode,
    onTour: setTour,
    onShot: capture,
    onReset: () => goTo(current, { animate: true, showInfo: false }),
    onStep: step,
  });
  ui.loading(0.04, '准备材质…');

  const stages = [
    [0.1, '铺开夜色…', () => { initMaterials(); buildSky(scene); }],
    [0.34, '铺主街与两侧铺面…', () => { street = buildStreet(scene); }],
    [0.56, '挂檐灯、立幌子、放人流…', () => {
      halo = halos(scene, { capacity: 1500, map: T.softGlow('255,178,104', 0.16), fogDensity: FOG_DENSITY });
      pools = lightPools(scene, { capacity: 340, map: T.softGlow('255,160,84', 0.2), y: STREET.deck + 0.13 });
      poolsWater = lightPools(scene, { capacity: 120, map: T.softGlow('255,160,84', 0.2), y: 0.06, gain: 0.5 });
      props = buildProps(scene, street, { halo, pools });
    }],
    [0.74, '放出古运河…', () => {
      canal = buildCanal(scene);
      columns = new LightColumns(scene, 420);
      columns.mesh.renderOrder = 5;
    }],
    [0.9, '搭东关古渡与灯船…', () => { wharf = buildWharf(scene, { halo, poolsWater, columns }); }],
    [0.98, '点亮热点与解说…', () => {
      hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goTo(s), viewRange: 340 });
      rig.onTap = (p) => {
        const ndc = new THREE.Vector2(
          (p.x / window.innerWidth) * 2 - 1,
          -(p.y / window.innerHeight) * 2 + 1,
        );
        const hit = hotspots.pick(ndc, camera);
        if (hit) goTo(hit);
      };
      resize();
    }],
  ];

  for (const [p, text, run] of stages) {
    ui.loading(p, text);
    await nextFrame();
    run();
    await nextFrame();
  }

  ui.loading(1, '好了');
  // 首帧不能写 hash，否则 applyDeepLink 读到的已经是 #head 了
  goTo(STATIONS[0], { animate: false, showInfo: true, writeHash: false });
  applyAll();
  ui.loaded();
  frame();

  window.addEventListener('resize', resize);
  window.addEventListener('hashchange', applyDeepLink);
  applyDeepLink();

  window.dongguan = {
    scene, camera, renderer, rig, STATIONS, state,
    get station() { return current.id; },
    go: (id) => { const s = STATIONS.find((x) => x.id === id); if (s) goTo(s, { animate: false }); },
    fps: () => fpsShown,
    capture,
    counts: () => ({
      streetSegs: street.segs.length,
      halos: halo.count,
      columns: columns.items.length,
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
    }),
  };
}

boot();
