import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, M } from './kit.js';
import { STATIONS, SHOWS, SITE } from './data.js';
import { buildEnvironment } from './environment.js';
import { buildQuarter } from './architecture.js';
import { buildGround, buildWater, LightColumns, Reflections, RippleRings } from './water.js';
import { buildProps, buildFireflies } from './props.js';
import { createShow } from './show.js';
import { KunQu } from './kunqu.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('stage');
// rAF 在后台标签里是冻住的，所以每一步都留一个定时器兜底
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
const camera = new THREE.PerspectiveCamera(58, 1, 0.15, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.58, 0.52, 1.03);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, quarter, props, fireflies, water, columns, reflections, hotspots, show, kun;
let stationIndex = 0, wantShot = false, qualityLevel = 0, beats = 0, tourClock = 0;
const latticeBase = { a: new THREE.Color('#6d7484'), b: new THREE.Color('#6f8398') };
const state = {
  lantern: 1, lotus: 1, firefly: 1, ripple: 1, window: 1, bloom: 0.58,
  reflect: true, labels: true, mist: true, lamp: true, tour: false, autoQuality: true, autoShow: true,
};

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
function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.8 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  ui.setShow(s.show);
  if (s.kun) {
    ui.setKunTitle(s.kun);
    ui.kunNote(`此处可起腔：${SHOWS[s.show] ? SHOWS[s.show].name + '起时笛声自会跟上。' : '按 N 起一段，按 B 击一板。'}`);
  } else {
    ui.kunNote('笛声只在上船与入厅两段起来；其余时辰园子里只有水声。');
  }
  if (state.autoShow && s.show) show.run(s.show, clock.elapsedTime, state.lantern);
  else show.stop();
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 参数 */
function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setDensity(value); break;
    case 'lotus': state.lotus = value; props.field.setDensity(value); break;
    case 'firefly': state.firefly = value; fireflies.setDensity(value); break;
    case 'ripple': state.ripple = value; break;
    case 'window': {
      state.window = value;
      const k = 0.25 + 0.85 * value;
      M.lattice.color.copy(latticeBase.a).multiplyScalar(k);
      M.latticeBlue.color.copy(latticeBase.b).multiplyScalar(k);
      break;
    }
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; env.setMist(value); break;
    case 'lamp': state.lamp = value; if (!value) show.stop(); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onKun(kind) {
  if (kind === 'tap') kun.tap('board');
  else if (kind === 'stop') kun.stop();
  else if (kind === 'sing') {
    if (kun.ringing) kun.stop();
    else {
      const s = STATIONS[stationIndex];
      kun.sing(s.kun || 'xiangzhou');
      ui.setKunTitle(s.kun || 'xiangzhou');
      ui.kunNote('板落腔起，笛从舱里出来。');
    }
  }
}

function onShow(kind) {
  if (kind === 'off') { show.stop(); ui.setShow(null); return; }
  if (kind === 'lamp') {
    show.run('corridor', clock.elapsedTime, state.lantern);
    ui.setShow('corridor');
    return;
  }
  const s = STATIONS[stationIndex];
  if (!s.show) { ui.setShow(null); return; }
  show.run(s.show, clock.elapsedTime, state.lantern);
  ui.setShow(s.show);
}

/* ------------------------------------------------------------------ 画质 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  env.setQuality(level);
  fireflies.setQuality(level >= 1 ? 1 : DPR);
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭倒影与影子；荷、灯与流萤仍按你设定的密度。',
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
  props.update(t, dt);
  fireflies.update(t);
  water.update(t, state.ripple, water.uniforms.uGlow.value);
  columns.update(t, state.ripple, 0.7 + 0.5 * Math.min(1.4, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  show.update(t, dt);

  // 气口推着水面与舱灯一起呼吸
  const air = kun.update();
  env.accents[1].intensity = 46 + 26 * air + (show.activeId === 'boatlamp' ? 40 : 0);
  if (air > 0.25 && Math.random() < 0.06 * air) {
    water.rings.emit(-16 + (Math.random() - 0.5) * 6, -8 + (Math.random() - 0.5) * 6, t, 0.5 * air);
  }

  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 12 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }

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
    a.download = `拙政问雅-${s.short}.png`;
    a.click();
  } catch (e) { /* 某些环境下 canvas 不可读 */ }
}

/* ------------------------------------------------------------------ 启动 */
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
    onKun,
    onShow,
  });
  ui.loading(0.04, '铺开中部的水面…');
  ui.setKun(0, false);
  ui.setShow(null);

  const qs = new URLSearchParams(location.search);
  if (qs.get('bare') !== null) {
    document.body.classList.add('bare');
    state.labels = false;
  }
  if (qs.get('noauto') !== null) state.autoShow = false;

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.14, '压下西沉的月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.3, '挖池、堆山、叠驳岸…');
  buildGround(scene);
  await nextFrame();

  ui.loading(0.5, '起堂、立亭、架廊桥…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.66, '点亮园灯与荷…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns);
  fireflies = buildFireflies(scene);
  await nextFrame();

  ui.loading(0.8, '放水下塘、起倒影…');
  water = buildWater(scene, new RippleRings());
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.9, '排一场问雅光影…');
  kun = new KunQu({
    position: new THREE.Vector3(-16, 1.6, -8),
    onBeat: () => { beats++; ui.setKun(beats, kun.ringing); },
  });
  show = createShow({ scene, env, props, water, columns, kun });

  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = state.labels;
  // 静帧模式连热点环一起收掉，出干净画面
  if (document.body.classList.contains('bare')) hotspots.exteriorShown = false;

  // 相机只能在园子与水面之上活动
  rig.bounds = {
    x: [SITE.minX + 6, SITE.maxX - 6],
    z: [SITE.minZ + 6, SITE.maxZ - 6],
    y: [1.5, 46],
  };

  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false });
  rig.setFov(58);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  ui.setShow(STATIONS[0].show);
  if (state.autoShow && STATIONS[0].show) show.run(STATIONS[0].show, clock.elapsedTime, state.lantern);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[0].id);
  onParam('window', state.window);
  onParam('lantern', state.lantern);
  onParam('lotus', state.lotus);
  onParam('firefly', state.firefly);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '问雅…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();

  window.zhuozheng = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, SHOWS,
    goToStation, setMode, show, kun, props, water, columns, env, fireflies, state, reflections,
    stationIndex: () => stationIndex,
  };

  // 深链：?st=id / ?eye=x,y,z&at=x,y,z&fov= / ?show=id / ?kun=1 / ?bare
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  const eye = qs.get('eye'), at = qs.get('at');
  if (eye && at) {
    const p = eye.split(',').map(Number);
    const l = at.split(',').map(Number);
    rig.goTo(p, l, { animate: false });
    if (qs.get('fov')) rig.setFov(Number(qs.get('fov')));
  }
  const sh = qs.get('show');
  if (sh) show.run(sh, clock.elapsedTime, state.lantern);
  if (qs.get('kun')) { kun.sing(qs.get('kun') === '1' ? 'xiangzhou' : qs.get('kun')); beats = 4; ui.setKun(beats, true); }
  if (qs.get('win') === '0') onParam('window', 0);

  requestAnimationFrame(frame);
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) {
      const i = STATIONS.indexOf(hit);
      goToStation(i);
      // 点当前站的热点等于重放这一站的光影
      if (i === stationIndex && STATIONS[i].show) show.run(STATIONS[i].show, clock.elapsedTime, state.lantern);
    }
  };
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
