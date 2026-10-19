import * as THREE from 'three';
import { mergeAll, mesh, lit, glow, rand,   box,  nanCheck } from './kit.js';
import * as T from './textures.js';
import { VOYAGE, BRIDGES, WALK } from './data.js';

/**
 * 灯船。同里是"以港成市"的水镇，船原本是走路用的：一橹、一篷、一船人的高度。
 * 夜航本身查不到可靠记载，所以这一景的船只做两件事——
 * 一是给河一个比例尺（船肚比岸顶低两米，站在桥上刚好看得见篷顶），
 * 二是把"走三桥"的次序走一遍：一走太平、二走吉利、三走长庆。
 *
 * 关掉开关时三条船分泊在三处河湾，摇橹人不在；开了就走。
 */

const HULL = lit('#3a2c20', { map: T.noise(), rough: 0.86, side: THREE.DoubleSide });
const MAT = lit('#241b14', { rough: 0.9 });
const CANOPY = lit('#2e3540', { map: T.tiles({ meters: 1.0, base: '#262d38' }), rough: 0.8, side: THREE.DoubleSide, emissive: '#131a22', ei: 0.3 });
const ROPE = lit('#4a4034', { rough: 0.9 });

/** 船体：中段宽、两头收，舷侧略高 */
function hullGeo(len = 6.2, beam = 1.9) {
  const sections = 9;
  const pos = [], uv = [], idx = [];
  const at = (i) => {
    const t = i / (sections - 1);
    const x = -len / 2 + len * t;
    const w = beam / 2 * Math.pow(Math.sin(Math.PI * (0.08 + 0.86 * t)), 0.55);
    const sheer = 0.28 + 0.2 * Math.pow(Math.abs(t - 0.42) * 2, 1.6);
    return { x, w, sheer };
  };
  const rows = [
    { k: 0, yf: -0.34 },   // 龙骨
    { k: 1, yf: 0.12 },    // 水线附近
    { k: 2, yf: 0.62 },    // 舷顶
  ];
  for (const r of rows) {
    for (let i = 0; i < sections; i++) {
      const s = at(i);
      const y = s.yf + (r.k === 2 ? s.sheer * 0.18 : 0);
      const spread = r.k === 0 ? 0.34 : r.k === 1 ? 0.92 : 1;
      pos.push(s.x, y, -s.w * spread, s.x, y, s.w * spread);
      uv.push(s.x / 1.2, y / 1.2, s.x / 1.2, y / 1.2);
    }
  }
  const W = 2;
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < sections - 1; i++) {
      const a = (r * sections + i) * W, b = a + W, c = ((r + 1) * sections + i) * W, d = c + W;
      idx.push(a, c, b, b, c, d);
    }
  }
  // 甲板
  const deckStart = pos.length / 3;
  for (let i = 0; i < sections; i++) {
    const s = at(i);
    pos.push(s.x, s.yf + 0.62 + s.sheer * 0.18 - 0.06, -s.w * 0.86, s.x, s.yf + 0.62 + s.sheer * 0.18 - 0.06, s.w * 0.86);
    uv.push(s.x / 1.2, 0, s.x / 1.2, 1);
  }
  for (let i = 0; i < sections - 1; i++) {
    const a = deckStart + i * 2, b = a + 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  nanCheck(g, HULL);
  return g;
}

/** 一扇船篷：几道弧骨撑起来的一段半筒 */
function canopyGeo({ len = 3.0, beam = 1.7, rise = 1.25 } = { }) {
  const ribs = 6;
  const geo = [];
  for (let i = 0; i < ribs; i++) {
    const t = i / (ribs - 1);
    const x = -len / 2 + len * t;
    const h = rise * Math.sin(Math.PI * (0.12 + 0.78 * Math.sin(Math.PI * t))) ** 0.7;
    const arc = new THREE.TorusGeometry(beam / 2, 0.035, 4, 10, Math.PI);
    arc.rotateY(Math.PI / 2);
    arc.rotateX(0);
    arc.scale(1, h / (beam / 2), 1);
    arc.translate(x, 0, 0);
    geo.push(arc);
  }
  const skin = new THREE.CylinderGeometry(beam / 2, beam / 2, len, 12, 1, true, 0, Math.PI);
  skin.rotateZ(Math.PI / 2);
  skin.rotateY(Math.PI / 2);
  skin.scale(1, 1, 1);
  geo.push(skin);
  return mergeAll(geo);
}

/** 摇橹人：一个暗团加一柄橹 */
function rowerGeo() {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.19, 0.3, 0.95, 7);
  body.translate(0, 0.72, 0);
  const head = new THREE.SphereGeometry(0.16, 7, 6);
  head.translate(0, 1.32, 0);
  const hat = new THREE.ConeGeometry(0.3, 0.16, 8);
  hat.translate(0, 1.48, 0);
  const oar = new THREE.CylinderGeometry(0.04, 0.055, 2.6, 5);
  oar.rotateZ(Math.PI / 3.2);
  oar.translate(0.5, 0.85, 0.35);
  parts.push(body, head, hat, oar);
  return mergeAll(parts);
}

/** 一条船：船体 + 篷 + 灯 + 人 */
function boatScene({ len, beam, withRower = true } = { }) {
  const grp = new THREE.Group();
  grp.name = 'boat';
  const hull = mesh(hullGeo(len, beam), HULL);
  hull.renderOrder = 1;
  grp.add(hull);
  const cap = mesh(canopyGeo({ len: len * 0.5, beam: beam * 0.94, rise: 1.15 }), CANOPY);
  cap.position.set(-len * 0.04, 0.86, 0);
  grp.add(cap);
  // 船头一盏、篷内一盏
  const lampGeo = new THREE.SphereGeometry(0.2, 8, 6);
  lampGeo.scale(1, 1.3, 1);
  lampGeo.translate(len * 0.42, 1.15, 0);
  const lamp2 = new THREE.SphereGeometry(0.16, 8, 6);
  lamp2.scale(1, 1.3, 1);
  lamp2.translate(-len * 0.1, 1.25, 0);
  const lamps = mesh(mergeAll([lampGeo, lamp2]), glow('#ffbf7e', 1.5));
  lamps.name = 'boat-lamps';
  grp.add(lamps);
  if (withRower) {
    const r = mesh(rowerGeo(), MAT);
    r.position.set(len * 0.34, 0.7, 0);
    grp.add(r);
  }
  // 舷边一道吃水线：夜里读得出船坐在水里多深
  const waterline = mesh(mergeAll([box(len * 0.94, 0.06, 0.05, 0, 0.1, beam * 0.47), box(len * 0.94, 0.06, 0.05, 0, 0.1, -beam * 0.47)]), ROPE);
  grp.add(waterline);
  return grp;
}

/* ------------------------------------------------------------------ 编队 */

const curve = new THREE.CatmullRomCurve3(
  VOYAGE.route.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.06,
);
const SAMPLES = 460;
const LUT = [];
for (let i = 0; i <= SAMPLES; i++) {
  const p = curve.getPoint(i / SAMPLES);
  LUT.push({ x: p.x, z: p.z });
}

/** 三桥在航线上的位置（参数 u），过桥的次第由此算出 */
export function chainParams() {
  return WALK.map((id) => {
    const b = BRIDGES.find((x) => x.id === id);
    let best = 0, bd = 1e9;
    for (let i = 0; i <= SAMPLES; i++) {
      const d = Math.hypot(LUT[i].x - b.at[0], LUT[i].z - b.at[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return { id, u: best / SAMPLES, dist: bd };
  });
}

/** 泊位：头一条就泊在吉利桥下——'船底'那个机位站的正是它 */
const CHAIN0 = chainParams();
const MOOORED = [
  { u: CHAIN0[1].u - 0.014, off: 1.1 },
  { u: CHAIN0[0].u + 0.05, off: -1.8 },
  { u: 0.88, off: 2.2 },
];

export function buildBoats(scene) {
  const group = new THREE.Group();
  group.name = 'boats';
  const CHAIN = chainParams();

  const boats = MOOORED.map((m, i) => {
    const len = 5.6 + i * 0.5, beam = 1.75 + i * 0.1;
    const g = boatScene({ len, beam, withRower: false });
    group.add(g);
    return { mesh: g, u: m.u, off: m.off, len, beam, speed: 1, phase: rand() * 6.28, rowerOn: false };
  });

  scene.add(group);

  let voyage = false;
  let clock = 0;

  function place(b, u) {
    const p = curve.getPoint(((u % 1) + 1) % 1);
    const t = curve.getTangent(((u % 1) + 1) % 1);
    const nx = t.z, nz = -t.x;
    b.mesh.position.set(p.x + nx * b.off, 0.06, p.z + nz * b.off);
    b.mesh.rotation.y = Math.atan2(-t.z, t.x);
    b.mesh.position.y = 0.06 + Math.sin(clock * 1.3 + b.phase) * 0.035;
    b.mesh.rotation.z = Math.sin(clock * 0.9 + b.phase) * 0.02;
    return { x: p.x, z: p.z };
  }

  return {
    group, boats, chain: CHAIN,
    /** 走三桥：三条船依次解缆，过一桥亮一桥 */
    setVoyage(on, { snap = false } = { }) {
      voyage = on;
      for (const b of boats) b.rowerOn = on;
      if (on && snap) {
        // 静帧里靠 dt 走不到位置，直接把三条船放到三桥上
        boats.forEach((b, i) => { b.u = CHAIN[Math.min(i, CHAIN.length - 1)].u - 0.004; });
      }
      if (!on) boats.forEach((b, i) => { b.u = MOOORED[i].u; place(b, b.u); });
    },
    get voyaging() { return voyage; },
    update(t, dt) {
      clock = t;
      if (voyage) {
        const step = (VOYAGE.speed * dt) / (curve.getLength() || 1);
        boats.forEach((b, i) => { b.u = (b.u + step * (1 - i * 0.04)) % 1; place(b, b.u); });
      } else {
        boats.forEach((b) => place(b, b.u));
      }
    },
    /** 每一座桥此刻该亮多少：船过桥洞前后各 3% 航程 ramp */
    chainLevels(width = 0.05) {
      const out = { };
      for (const c of CHAIN) {
        let v = 0;
        for (const b of boats) {
          const d = Math.abs(((b.u - c.u) % 1 + 1) % 1);
          const near = Math.min(d, 1 - d);
          v = Math.max(v, voyage ? Math.max(0, 1 - near / width) : (c.id === 'jili' ? 0.7 : 0.34));
        }
        out[c.id] = v;
      }
      return out;
    },
    /** 船头的灯在水面拖的那一道 */
    lampSpots() {
      return boats.map((b) => ({
        x: b.mesh.position.x + Math.sin(b.mesh.rotation.y) * b.len * 0.4,
        z: b.mesh.position.z,
        width: 1.0, depth: 5.5 }));
    } };
}
