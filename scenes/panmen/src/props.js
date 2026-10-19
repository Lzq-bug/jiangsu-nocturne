import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, glow, box, mesh, rand, rr, chineseRoof, stringPath, figureGeo,
} from './kit.js';
import { SITE, RIVER, LEVEL, STATIONS } from './data.js';
import * as T from './textures.js';

const HALF = RIVER.halfWidth;
const Q = LEVEL.quay;
const P = SITE.pagoda;
const W = SITE.wall;
const LG = SITE.landGate;
const BR = SITE.bridge;

/** 这一处该不该空出来：机位、三景本体、城墙、河道都不许压房子 */
function free(x, z) {
  const BC = LG.barbican;
  if (Math.abs(x) < HALF + 5.5) return false;
  if (STATIONS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < 11)) return false;
  if (Math.abs(z - W.z) < 10) return false;
  if (Math.hypot(x - P.x, z - P.z) < P.yard.r + 6) return false;
  if (Math.abs(x - BC.cx) < BC.halfW + 7 && z > BC.cz0 - 8 && z < BC.cz0 + BC.run + 8) return false;
  if (Math.hypot(x, z - BR.z) < 17) return false;
  if (Math.abs(x - SITE.quay.dockX) < 12 && z > SITE.quay.dockZ - 10 && z < SITE.quay.dockZ + 32) return false;
  return true;
}

/* ------------------------------------------------------------------ 民居 */
function houses() {
  const walls = [], roofs = [], dark = [], wins = [];
  for (const side of [-1, 1]) {
    for (let z = -168; z <= 168; z += 12) {
      for (let row = 0; row < 2; row++) {
        if (row === 1 && rand() > 0.62) continue;
        const x = side * (HALF + 9 + row * 26 + rr(0, 9));
        const zz = z + rr(-3, 3);
        if (!free(x, zz)) continue;
        buildHouse(x, zz);
      }
    }
  }

  function buildHouse(x, zz) {
    {
      const side = x > 0 ? 1 : -1;
      const w = rr(7.5, 13), d = rr(6, 10.5);
      const h = rand() > 0.72 ? rr(5.6, 7.2) : rr(3.4, 4.4);
      // 山面朝河：临水那一排正对运河，往里走的才随意偏一点
      const base = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const rot = base + (Math.abs(x) > HALF + 25 ? rr(-0.7, 0.7) : rr(-0.14, 0.14));
      const place = (g) => { g.rotateY(rot); g.translate(x, 0, zz); return g; };

      walls.push(place(box(w, h, d, 0, h / 2, 0)));
      dark.push(place(box(w + 0.5, 0.3, d + 0.5, 0, h + 0.12, 0)));
      const roof = chineseRoof({
        width: w, depth: d, height: 1.5 + w * 0.06, ridgeRatio: 0.92,
        overhang: 0.55, hip: false, segU: 14, segV: 9,
      });
      roof.translate(0, h + 0.22, 0);
      roofs.push(place(roof));

      const rows = h > 5 ? 2 : 1;
      for (let f = 0; f < rows; f++) {
        const n = Math.max(1, Math.round(w / 3.4));
        for (let i = 0; i < n; i++) {
          if (rand() > 0.6) continue;
          const g = new THREE.PlaneGeometry(1.05, 1.25);
          g.translate(-w / 2 + (w * (i + 0.5)) / n, 1.6 + f * 2.5, d / 2 + 0.07);
          wins.push(place(g));
        }
      }
    }
  }
  const grp = new THREE.Group();
  grp.add(mesh(walls, M.wall), mesh(dark, M.ink), mesh(roofs, M.roof));
  grp.add(mesh(wins, new THREE.MeshBasicMaterial({ map: T.lattice(), toneMapped: false, side: THREE.DoubleSide })));
  return grp;
}

/* ------------------------------------------------------------------ 花灯 */
function lanternStrings(columns) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: T.lanternPaper(), toneMapped: false });
  const lampGeo = new THREE.SphereGeometry(0.3, 8, 7);
  lampGeo.scale(1, 1.25, 1);
  const pairs = [];

  const runs = [
    [[LG.barbican.cx - 9, Q + 3.4, 44], [LG.barbican.cx + 9, Q + 3.4, 44], 0.9],
    [[-HALF + 1.8, Q + 3.2, 20], [-HALF + 1.8, Q + 3.2, 68], 1.2],
    [[HALF - 1.8, Q + 3.2, 8], [HALF - 1.8, Q + 3.2, 60], 1.1],
    [[-HALF + 1.8, Q + 3.3, -20], [-HALF + 1.8, Q + 3.3, -74], 1.2],
    [[HALF - 1.8, Q + 3.3, -18], [HALF - 1.8, Q + 3.3, -62], 1.0],
    [[P.x + 9, Q + 3.2, P.z + 15], [P.x + 19, Q + 3.2, P.z + 3], 0.8],
    [[-6, W.top + 2.4, W.z + 4.4], [10, W.top + 2.4, W.z + 4.4], 0.7],
  ];
  const cords = [];
  for (const [a, b, sag] of runs) {
    const path = stringPath(new THREE.Vector3(...a), new THREE.Vector3(...b), sag, 30);
    cords.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 24, 0.035, 4, false), M.ink));
    for (let i = 2; i < path.length - 1; i += 2) {
      const p = path[i];
      const body = new THREE.Mesh(lampGeo, mat);
      body.position.copy(p).add(new THREE.Vector3(0, -0.44, 0));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,190,120', 0.16), transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      halo.scale.setScalar(0.8);
      halo.position.copy(body.position);
      pairs.push({ body, halo });
      grp.add(body, halo);
      if (Math.abs(p.x) < HALF + 3 && p.y < Q + 6) {
        columns.add(new THREE.Vector3(p.x, p.y, p.z), '#ff9a52', 0.9, 5.5, 0.7);
      }
    }
  }
  for (const c of cords) grp.add(c);
  return {
    group: grp,
    pairs,
    setDensity(v) {
      const on = Math.round(pairs.length * Math.min(1, Math.max(0, v)));
      pairs.forEach((p, i) => {
        p.body.visible = i < on;
        p.halo.visible = i < on;
      });
    },
  };
}

/* ------------------------------------------------------------------ 船 */
function makeBoat(scene, columns, { len, beam, color = '#ffbe7c' }) {
  const grp = new THREE.Group();
  const slices = [];
  const st = 9;
  for (let i = 0; i < st; i++) {
    const t = i / (st - 1);
    const z = -len / 2 + t * len;
    const full = Math.min(1, Math.sin(Math.PI * Math.min(0.96, 0.12 + t * 0.86)) * 1.25);
    const w = beam * Math.max(0.18, full);
    slices.push(box(w, 0.86, len / st * 1.04, 0, 0, z));
  }
  const deck = [
    box(beam * 1.02, 0.2, len * 0.9, 0, 0.5, 0),
    box(beam * 0.86, 1.5, len * 0.34, 0, 1.06, -len * 0.08),
  ];
  const canopy = new THREE.CylinderGeometry(beam * 0.6, beam * 0.6, len * 0.36, 10, 1, false, 0, Math.PI);
  canopy.rotateZ(Math.PI / 2);
  canopy.rotateY(Math.PI / 2);
  canopy.translate(0, 1.3, -len * 0.08);
  deck.push(canopy);
  const rudder = box(0.16, 1.4, 1.0, 0, -0.15, -len / 2 - 0.35);
  deck.push(rudder);
  const mast = new THREE.CylinderGeometry(0.1, 0.14, 7.0, 7);
  mast.translate(0, 3.5, len * 0.24);

  grp.add(mesh(mergeGeometries(slices), M.beam));
  grp.add(mesh(deck, M.dark));
  grp.add(mesh([mast], M.beam));

  for (const [y, z, halo] of [[6.85, len * 0.24, 1.05], [2.3, -len * 0.3, 0.75], [1.5, len * 0.44, 0.6]]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow(color, 1.5));
    lamp.position.set(0, y, z);
    grp.add(lamp);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,196,128', 0.16), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.scale.setScalar(halo * 0.55);
    sp.position.set(0, y, z);
    grp.add(sp);
  }
  const col = columns.add(new THREE.Vector3(0, 1.5, 0), color, 1.0, 7, 0.9);
  scene.add(grp);
  return { grp, col };
}

function fleet(scene, columns) {
  const boats = [
    { b: makeBoat(scene, columns, { len: 12.5, beam: 2.9 }), x: -2.7, from: -150, to: 150, speed: 3.4, phase: 0.15, axis: 'z' },
    { b: makeBoat(scene, columns, { len: 10.5, beam: 2.5 }), x: 8.5, from: 150, to: 30, speed: 2.5, phase: 0.62, axis: 'z' },
    { b: makeBoat(scene, columns, { len: 9.0, beam: 2.2, color: '#ffb066' }), x: SITE.quay.dockX - 2.4, z: SITE.quay.dockZ + 8, from: 0, to: 0, speed: 0, phase: 0.3, axis: 'z' },
    { b: makeBoat(scene, columns, { len: 8.0, beam: 2.0 }), z: BR.z + 14, from: -30, to: 30, speed: 1.7, phase: 0.85, axis: 'x' },
  ];
  return {
    list: boats,
    update(t, dt, speed) {
      for (const v of boats) {
        const range = v.to - v.from;
        const bob = Math.sin(t * 1.05 + v.phase * 6) * 0.07;
        const roll = Math.sin(t * 0.75 + v.phase * 4) * 0.016;
        if (Math.abs(range) < 0.01) {
          v.b.grp.position.set(v.x || 0, bob, v.z || 0);
          v.b.grp.rotation.set(0, 0, roll);
          columns.setPos(v.b.col, v.b.grp.position);
          continue;
        }
        const cycle = ((t * speed * v.speed) / Math.abs(range) + v.phase * 2) % 2;
        const u = cycle <= 1 ? cycle : 2 - cycle;
        const along = v.from + range * u;
        const goNeg = range < 0;
        if (v.axis === 'z') {
          v.b.grp.position.set(v.x, bob, along);
          v.b.grp.rotation.set(0, goNeg ? Math.PI : 0, roll);
        } else {
          v.b.grp.position.set(along, bob, v.z);
          v.b.grp.rotation.set(0, u > 0.5 ? -Math.PI / 2 : Math.PI / 2, roll);
        }
        columns.setPos(v.b.col, v.b.grp.position);
      }
      void dt;
    },
  };
}

/* ------------------------------------------------------------------ 人影 */
function crowd(scene, deckY) {
  const geo = figureGeo(1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x191e2a, roughness: 0.92 });
  const CAP = 260;
  const inst = new THREE.InstancedMesh(geo, mat, CAP);
  inst.frustumCulled = false;
  const paths = [];
  const walk = (a, b, y, n) => {
    for (let i = 0; i < n && paths.length < CAP; i++) {
      paths.push({
        a: new THREE.Vector3(a[0], y, a[1]),
        b: new THREE.Vector3(b[0], y, b[1]),
        t: rand(), v: rr(0.01, 0.032) * (rand() > 0.5 ? 1 : -1),
        s: rr(0.86, 1.1),
      });
    }
  };
  walk([-HALF + 2.6, -70], [-HALF + 2.6, 60], Q, 52);
  walk([HALF - 2.6, -60], [HALF - 2.6, 66], Q, 52);
  walk([LG.x - 13, 12], [LG.x + 13, 28], Q, 20);
  walk([-30, W.z + 0.6], [60, W.z + 1.4], W.top + 0.2, 30);
  for (let i = 0; i < 40 && paths.length < CAP; i++) {
    const x = rr(-BR.length / 2 + 3, BR.length / 2 - 3);
    const y = deckY(x) - 0.05;
    paths.push({
      a: new THREE.Vector3(x - 2.5, y, BR.z - 1.3),
      b: new THREE.Vector3(x + 2.5, y, BR.z + 1.3),
      t: rand(), v: rr(0.008, 0.026) * (rand() > 0.5 ? 1 : -1), s: rr(0.85, 1.05),
    });
  }
  scene.add(inst);
  const d = new THREE.Object3D();
  return {
    update(t, dt, n) {
      const count = Math.max(0, Math.min(CAP, n | 0));
      inst.count = count;
      for (let i = 0; i < count; i++) {
        const p = paths[i];
        p.t += p.v * dt;
        if (p.t > 1 || p.t < 0) { p.t = Math.min(1, Math.max(0, p.t)); p.v *= -1; }
        d.position.lerpVectors(p.a, p.b, p.t);
        const dx = p.b.x - p.a.x, dz = p.b.z - p.a.z;
        d.rotation.y = p.v > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
        d.scale.setScalar(p.s);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      void t;
    },
  };
}

/* ------------------------------------------------------------------ 主入口 */
export function buildProps(scene, columns, deckY) {
  const group = new THREE.Group();
  group.name = 'panmen-props';
  group.add(houses());
  const strings = lanternStrings(columns);
  group.add(strings.group);
  scene.add(group);
  const fl = fleet(scene, columns);
  const cr = crowd(scene, deckY);
  return { group, fleet: fl, crowd: cr, strings, setLanternDensity: strings.setDensity };
}
