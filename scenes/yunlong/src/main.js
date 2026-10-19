import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildSky } from './sky.js';
import { buildTerrain } from './terrain.js';
import { buildLake, buildLakeBed, LightColumns, Reflections, FOG_COLOR, FOG_DENSITY } from './water.js';
import { buildHill } from './hill.js';
import { buildArchitecture } from './buildings.js';
import { buildPlants } from './plants.js';
import { buildProps } from './props.js';
import { buildCranes } from './cranes.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, SITES, terrainHeight } from './data.js';

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
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 4200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.5, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, THREE, goToStation, setMode };
window.yunlong = api;
let ui, sky, terrain, lake, hill, arch, plants, props, cranes, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { lamp: 1, niche: 0.55, pine: 1, ripple: 1, bloom: 0.3, crane: false, reflect: true, labels: true, tour: false, autoQuality: true };
const ridge = { on: false, v: 0, target: 1 };

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
 * 机位落在真实几何上：站脚取 terrainHeight（或建筑自己的楼面），
 * 视点取目标点的地面高再加 lift。山一动，眼高、视线与热点都跟着动。
 */
function resolveStations() {
  for (const s of STATIONS) {
    const ground = s.site ? SITES[s.site] : null;
    const bx = ground ? ground.x : s.at[0];
    const bz = ground ? ground.z : s.at[1];
    let by = ground ? ground.y : terrainHeight(bx, bz);
    if (s.floorY !== undefined) by = s.floorY;
    else if (by < 0.4) by = 0.4;                    // 站在水上就当是堤顶/船头
    if (s.site === 'pavilion') by = arch?.built.pavilion.floorY ?? by;
    if (s.site === 'temple') by = arch?.built.hall.floorY ?? by;
    if (s.site === 'academy') by = arch?.built.academy.courts[0].floorY ?? by;
    if (s.site === 'terrace') by = arch?.built.terrace.deck ?? by;
    s.pos = [bx, by + (s.hOff ?? 1.7), bz];

    const [lx, lz, lift] = s.look;
    s.look = [lx, terrainHeight(lx, lz) + (lift ?? 0), lz];

    if (s.mark) {
      const [mx, mz, mlift] = s.mark;
      s.mark = [mx, terrainHeight(mx, mz) + (mlift ?? 3), mz];
    }

    // 佛前这一站站在月台东头：一眼要同时收下殿、佛首与它背后的崖
    if (s.id === 'buddha' && arch) {
      const [fx, fz] = arch.built.buddhaStand;
      const [mx, my, mz] = arch.built.buddhaFace;
      s.pos = [fx, arch.built.templeDeck + 1.9, fz];
      s.look = [mx, my, mz];
      if (s.mark) s.mark = [mx, my + 1.6, mz];
    }
    // 龛壁这一站对着的是龛群的形心，不是崖根的地面
    if (s.id === 'niche' && hill && hill.nicheAnchors.length) {
      let cx = 0, cy = 0, cz = 0;
      for (const [ax, ay, az] of hill.nicheAnchors) { cx += ax; cy += ay; cz += az; }
      const n = hill.nicheAnchors.length;
      s.look = [cx / n, cy / n, cz / n];
    }
    // 大士岩：站到岩前小殿的月台上，回头仰看那块巨石
    if (s.id === 'dashiyan' && arch) {
      const [fx, fz] = arch.built.dashiFront;
      const [mx, my, mz] = arch.built.guanyinMid;
      s.pos = [fx, terrainHeight(fx, fz) + 1.8, fz];
      s.look = [mx, my + 1.4, mz];
      if (s.mark) s.mark = [mx, my + 2.6, mz];
    }
    // 黄茅冈：站到石阵里去，视线顺着这道南北走向的冈
    if (s.id === 'huangmao' && hill?.rockList?.length) {
      const list = hill.rockList;
      const a = list[Math.floor(list.length * 0.12)];
      const b = list[Math.floor(list.length * 0.86)];
      s.pos = [b.x + 2.6, b.y + 1.8, b.z + 3.2];
      s.look = [a.x, a.y + 0.9, a.z];
      if (s.mark) s.mark = [(a.x + b.x) / 2, (a.y + b.y) / 2 + 1.6, (a.z + b.z) / 2];
    }
    // 东坡石床：低头看那块磨平的顶
    if (s.id === 'bed') {
      const B = SITES.bed;
      s.pos = [B.x + 5.4, B.y + 1.75, B.z + 3.6];
      s.look = [B.x, B.y + 1.85, B.z];
      if (s.mark) s.mark = [B.x, B.y + 2.3, B.z];
    }
  }
  // 索道的机位挂在绳上：正好在一节吊箱里
  const cab = STATIONS.find((s) => s.id === 'cable');
  if (cab && arch) {
    const p = arch.built.cable.curve.getPoint(0.42);
    cab.pos = [p.x, p.y - 1.4, p.z];
    cab.look = [p.x + 60, p.y - 8, p.z + 30];
    cab.mark = null;
  }
}

function fovFor(s) {
  if (s.id === 'aerial') return 42;
  if (s.id === 'gap') return 66;                     // 亭上望湖：要把月子收进檐口
  if (s.id === 'lake') return 58;
  if (s.id === 'buddha' || s.id === 'niche' || s.id === 'bed') return 60;
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
 * 放鹤：鹤出去一趟，山脊九节自北而南次第亮起。
 * snap=true 直接把两样都落到终态——SwiftShader 下一张静帧只有十几帧，
 * 靠 dt 推进的序列根本走不完。
 */
function release({ snap = false } = {}) {
  state.crane = true;
  cranes.release(snap);
  ridge.on = true;
  ridge.target = 1;
  if (snap) {
    ridge.v = 1;
    props.setRidge(1);
    ridge.on = false;
  }
  ui.setToggle('crane', true);
}

function onParam(key, value) {
  switch (key) {
    case 'lamp': state.lamp = value; props.setLamp(value); break;
    case 'niche': state.niche = value; hill.setNicheRamp(value); break;
    case 'pine':
      state.pine = value;
      for (const u of plants.windUniforms) u.uWind.value = value;
      break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'crane':
      state.crane = value;
      if (value) release(); else { cranes.recall(); ridge.on = false; ridge.target = 0; }
      break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭湖中灯影；这一景的湖面全靠那一片倒影，可手动调低寺观灯火换回画质。',
  ];
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
  lake.update(t, state.ripple);
  props.update(t, state.lamp);
  hill.nicheUpdate(t);
  arch.built.cable.update(t);
  cranes.update(t, dt);
  if (ridge.on) {
    ridge.v = Math.min(ridge.target, ridge.v + dt / 7.5);
    props.setRidge(ridge.v);
    if (ridge.v >= ridge.target) ridge.on = false;
  }
  columns.update(t, state.ripple, 0.7 + 0.5 * Math.min(1.4, state.lamp));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

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
    a.download = `云龙山夜景-${s.short}.png`;
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
  ui.loading(0.05, '把山铺成一只环…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.14, '升起星月…');
  sky = buildSky(scene);
  scene.fog.color.copy(FOG_COLOR);
  scene.fog.density = FOG_DENSITY;
  await nextFrame();

  ui.loading(0.26, '铺开湖与城…');
  terrain = buildTerrain(scene);
  columns = new LightColumns(scene, 220);
  columns.mesh.renderOrder = 5;
  lake = buildLake(scene);
  buildLakeBed(scene, terrain.materials.CITY);
  reflections = new Reflections(scene, { amp: 0.26, fade: 70 });
  await nextFrame();

  ui.loading(0.46, '垒起九节冈岭…');
  hill = buildHill(scene);
  await nextFrame();

  ui.loading(0.62, '立寺、亭、书院、索道…');
  arch = buildArchitecture(scene);
  reflections.add(arch.group);
  await nextFrame();

  ui.loading(0.76, '栽松…');
  plants = buildPlants(scene);
  await nextFrame();

  ui.loading(0.86, '点上灯…');
  props = buildProps(scene, arch.anchors, arch.built, hill, terrain);
  for (const [x, z] of props.waterLamps) {
    columns.add(new THREE.Vector3(x, 0, z), '#ffc48c', 1.3, 12, 0.62);
  }
  reflections.add(props.group);
  reflections.add(terrain.cityWindows);
  // 亭与殿值得在水里留一份，山本身不投进湖里：夜里那是一整块黑
  resolveStations();
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)), viewRange: 620 });
  hotspots.labelsVisible = true;

  cranes = buildCranes(scene);

  onParam('lamp', state.lamp);
  onParam('niche', state.niche);
  onParam('pine', state.pine);
  onParam('bloom', state.bloom);
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
  ui.loading(1, '望西山之缺…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { hill, arch, props, cranes, hotspots, release, setNiche: (v) => onParam('niche', v), setRidge: (v) => props.setRidge(v) });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 静帧与脚本走位用的深链（query 与 hash 两种写法都读）：
 *   ?st=crane&bare=1 · ?eye=x,y,z&at=x,y,z&fov=58 · ?crane=1&niche=1&ridge=1
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
  if (has('niche')) onParam('niche', Number(get('niche')));
  if (has('lamp')) onParam('lamp', Number(get('lamp')));
  if (has('ridge')) { props.setRidge(Number(get('ridge'))); ridge.v = Number(get('ridge')); }
  if (idx >= 0) {
    if (has('crane') && get('crane') !== '0') release({ snap: true });
    goToStation(idx, { info: has('info'), animate: false });
    if (has('fov')) rig.setFov(Number(get('fov')));
    return;
  }
  if (has('eye')) {
    const eye = get('eye').split(',').map(Number);
    const at = (get('at') || '-60,120,-40').split(',').map(Number);
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
    if (e.key.toLowerCase() === 'c') ui.setToggle('crane', !state.crane), onParam('crane', !state.crane);
  });
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
