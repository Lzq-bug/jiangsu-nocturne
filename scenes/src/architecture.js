import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, bracketGeo, plaqueMesh, box, mesh, rand, rr, glow, PAL, registerOccluder } from './kit.js';
import { RIVER, STATIONS } from './data.js';
import * as T from './textures.js';

const Q = RIVER.quayY;          // quay deck height
const HW = RIVER.halfWidth;     // water half width

/** where the built structures actually are, filled in as they are built */
export const LAYOUT = {};

/* ---------------------------------------------------------------- banks & quays */
function banks() {
  const parts = [], partsStone = [];
  for (const s of [-1, 1]) {
    const inner = HW * s;
    // retaining wall down to the water
    const wall = new THREE.BoxGeometry(1.6, Q + 1.4, RIVER.length);
    wall.translate(inner + s * 0.8, (Q + 1.4) / 2 - 1.0, 0);
    partsStone.push(wall);
    // coping stripe along the edge
    const cop = new THREE.BoxGeometry(0.7, 0.32, RIVER.length);
    cop.translate(inner + s * 1.55, Q + 0.16, 0);
    partsStone.push(cop);
    // promenade
    const ground = new THREE.BoxGeometry(60, 0.7, RIVER.length + 90);
    ground.translate(inner + s * 31.5, Q - 0.35, 0);
    parts.push(ground);
  }
  const g = new THREE.Group();
  const quay = mesh(partsStone, M.stone);
  quay.receiveShadow = true;
  const ground = mesh(parts, M.stoneDark);
  ground.receiveShadow = true;
  g.add(ground, quay);
  return g;
}

/** steps, bollards and lamp posts reaching the water on both sides */
function quayFurniture(anchors) {
  const g = new THREE.Group();
  const steps = [];
  const bollards = [];
  for (const s of [-1, 1]) {
    for (let z = -84; z <= 84; z += 12) {
      for (let k = 0; k < 4; k++) {
        steps.push(box(3.4, 0.5, 0.75, s * (HW + 0.4 - k * 0.7), Q - 0.55 - k * 0.55, z));
      }
      const b = new THREE.CylinderGeometry(0.22, 0.3, 1.1, 8);
      b.translate(s * (HW + 2.4), Q + 0.55, z + 4.5);
      bollards.push(b);
    }
    // pole lamps along the promenade
    for (let z = -88; z <= 88; z += 11) {
      const x = s * (HW + 4.6);
      const pole = new THREE.CylinderGeometry(0.09, 0.14, 4.4, 6);
      pole.translate(x, Q + 2.2, z);
      const arm = box(0.9, 0.12, 0.12, x - s * 0.45, Q + 4.35, z);
      const post = mesh([pole, arm], M.ink);
      g.add(registerOccluder(post, 2.6, new THREE.Vector3(x, Q + 2.2, z)));
      anchors.lampPosts.push(new THREE.Vector3(x, Q + 3.9, z));
    }
  }
  const sMesh = mesh(steps, M.stone); sMesh.receiveShadow = true;
  const bMesh = mesh(bollards, M.stoneDark); bMesh.castShadow = true;
  g.add(sMesh, bMesh);
  return g;
}

/* ---------------------------------------------------------------- 秦淮画廊 */
function gallery(anchors) {
  const g = new THREE.Group();
  const x0 = -HW - 5.5;          // waterside colonnade
  const x1 = -HW - 12.5;         // inner colonnade
  const zA = -74, zB = 74;
  LAYOUT.gallery = { x0, x1, zA, zB, deckY: Q + 0.45, eaveY: Q + 4.95, bay: (zB - zA) / Math.round((zB - zA) / 3.4) };
  const span = zB - zA, bays = Math.round(span / 3.4);

  const deck = mesh(box(Math.abs(x1 - x0) + 3.2, 0.55, span + 3.4, (x0 + x1) / 2, Q - 0.1, 0), M.stone);
  deck.receiveShadow = true;
  g.add(deck);

  const beamParts = [], bracketParts = [], latticeMeshes = [];
  const pillarSpots = [];
  for (let i = 0; i <= bays; i++) {
    const z = zA + (span * i) / bays;
    for (const x of [x0, x1]) {
      pillarSpots.push([x, Q + 0.2, z]);
      anchors.eaves.push(new THREE.Vector3(x + (x === x0 ? 0.7 : -0.7), Q + 4.3, z));
    }
    if (i < bays) {
      const zc = zA + (span * (i + 0.5)) / bays;
      const bay = span / bays;
      for (const x of [x0, x1]) beamParts.push(box(0.34, 0.55, bay, x, Q + 4.5, zc));
      beamParts.push(box(Math.abs(x1 - x0), 0.3, 0.34, (x0 + x1) / 2, Q + 4.62, z));
      for (const x of [x0, x1]) {
        const br = bracketGeo(0.9);
        br.translate(x, Q + 4.85, zc);
        bracketParts.push(br);
      }
    }
  }
  const pillars = new THREE.InstancedMesh(pillarGeo(4.6, 0.26), M.pillar, pillarSpots.length);
  const dum = new THREE.Object3D();
  pillarSpots.forEach(([x, y, z], i) => {
    dum.position.set(x, y, z);
    dum.updateMatrix();
    pillars.setMatrixAt(i, dum.matrix);
  });
  pillars.castShadow = true;
  pillars.frustumCulled = false;
  g.add(pillars);
  g.add(mesh(beamParts, M.beam));
  const brM = mesh(bracketParts, M.gilt);
  g.add(brM);

  //美人靠 railing on the river side
  const rail = new THREE.Mesh(railingGeo(span + 1, { height: 0.95, spacing: 1.4 }), M.pillarBright);
  rail.position.set(x0 + 1.1, Q + 0.4, 0);
  rail.rotation.y = Math.PI / 2;
  g.add(rail);
  const rail2 = new THREE.Mesh(railingGeo(span + 1, { height: 0.9, spacing: 1.7 }), M.stone);
  rail2.position.set(x1 - 1.0, Q + 0.4, 0);
  rail2.rotation.y = Math.PI / 2;
  g.add(rail2);

  // inner wall with lattice windows
  const wallParts = [];
  for (let i = 0; i < bays; i++) {
    const z = zA + (span * (i + 0.5)) / bays;
    if (i % 3 === 1) continue;
    wallParts.push(box(0.3, 3.3, span / bays - 0.9, x1 - 1.6, Q + 1.9, z));
  }
  const wall = mesh(wallParts, M.wall);
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);
  for (let i = 0; i < bays; i += 3) {
    const z = zA + (span * (i + 0.5)) / bays;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.2), M.lattice);
    win.position.set(x1 - 1.44, Q + 2.0, z);
    win.rotation.y = Math.PI / 2;
    g.add(win);
    anchors.windowGlow.push(new THREE.Vector3(x1 - 1.4, Q + 2.0, z));
  }

  // double eave roof
  const lower = new THREE.Mesh(chineseRoof({
    width: span + 4, depth: Math.abs(x1 - x0) + 3.4, height: 1.5, ridgeRatio: 0.78,
    curve: 0.55, eaveLift: 0.35, overhang: 0.9, hip: true,
  }), M.roof);
  lower.rotation.y = Math.PI / 2;
  lower.position.set((x0 + x1) / 2, Q + 4.95, 0);
  lower.castShadow = true;
  const upper = new THREE.Mesh(chineseRoof({
    width: span - 8, depth: Math.abs(x1 - x0) - 3.4, height: 1.9, ridgeRatio: 0.86,
    curve: 0.5, eaveLift: 0.5, overhang: 0.5, hip: true,
  }), M.roof);
  upper.rotation.y = Math.PI / 2;
  upper.position.set((x0 + x1) / 2, Q + 6.2, 0);
  upper.castShadow = true;
  const ridge = mesh(ridgeOrnament({ width: span - 8, depth: 6, height: 1.9, ridgeRatio: 0.86 }), M.ridge);
  ridge.rotation.y = Math.PI / 2;
  ridge.position.set((x0 + x1) / 2, Q + 8.1, 0);
  g.add(lower, upper, ridge);

  // entrance gate of the gallery
  const gz = -22;
  const gate = mesh([
    box(0.9, 5.2, 0.9, x0 + 0.4, Q + 2.6, gz - 2.4),
    box(0.9, 5.2, 0.9, x0 + 0.4, Q + 2.6, gz + 2.4),
    box(0.7, 0.5, 5.6, x0 + 0.4, Q + 5.4, gz),
  ], M.pillarBright);
  gate.castShadow = true;
  g.add(gate);
  const sign = plaqueMesh('秦淮画廊', 4.4, 1.25, { dir: 'h', bg: '#173a2e' });
  sign.position.set(x0 + 0.85, Q + 5.95, gz);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  anchors.gate.push(new THREE.Vector3(x0 + 0.9, Q + 6.6, gz));
  return g;
}

/* ---------------------------------------------------------------- 文德桥 */
function bridge(anchors) {
  const g = new THREE.Group();
  const z0 = 0, half = 2.7, span = 19;
  const deckY = (x) => Q + 0.6 + 5.3 * Math.max(0, 1 - (x / span) ** 2) ** 0.86;

  const shape = new THREE.Shape();
  shape.moveTo(-span - 1, 0.2);
  for (let i = 0; i <= 60; i++) {
    const x = -span - 1 + ((span * 2 + 2) * i) / 60;
    shape.lineTo(x, deckY(Math.min(span, Math.max(-span, x))) - 0.55);
  }
  shape.lineTo(span + 1, 0.2);
  shape.closePath();
  // segmental arch: keep the soffit below the deck curve, clear of the boat masts
  const arch = new THREE.Path();
  arch.moveTo(-6.0, 0.2);
  arch.absarc(0, 0.4, 6.0, 0, Math.PI, false);
  shape.holes.push(arch);

  const solid = new THREE.ExtrudeGeometry(shape, { depth: half * 2, bevelEnabled: false, curveSegments: 24 });
  solid.translate(0, 0, z0 - half);
  const body = new THREE.Mesh(solid, M.stoneDressed);
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  // parapets follow the deck curve
  for (const s of [-1, 1]) {
    const segs = 46, parts = [];
    for (let i = 0; i < segs; i++) {
      const x = -span + (2 * span * i) / segs;
      const xn = -span + (2 * span * (i + 1)) / segs;
      const y = (deckY(x) + deckY(xn)) / 2;
      const len = Math.hypot(xn - x, deckY(xn) - deckY(x)) * 1.03;
      const b = new THREE.BoxGeometry(len, 1.0, 0.26);
      const a = Math.atan2(deckY(xn) - deckY(x), xn - x);
      const m = new THREE.Matrix4().makeRotationZ(a);
      b.applyMatrix4(m);
      b.translate(x + (xn - x) / 2, y + 0.75, s * (half - 0.13));
      parts.push(b);
      if (i % 3 === 0) {
        const post = new THREE.BoxGeometry(0.24, 1.45, 0.34);
        post.translate(x, y + 0.9, s * (half - 0.13));
        parts.push(post);
        const cap = new THREE.SphereGeometry(0.17, 8, 6);
        cap.translate(x, y + 1.68, s * (half - 0.13));
        parts.push(cap);
      }
    }
    // raised bridge-heart stones at the crown
    parts.push(box(1.3, 0.3, 0.4, 0, deckY(0) + 1.28, s * (half - 0.13)));
    const pm = mesh(parts, M.stone);
    pm.castShadow = true;
    g.add(pm);
    const plaque = plaqueMesh('文德桥', 2.5, 0.9, { dir: 'h', bg: '#243040', fg: '#dfe6f2' });
    plaque.position.set(s * -0.2, deckY(0) + 0.4, s * (half + 0.02));
    plaque.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(plaque);
  }

  // abutment lanterns
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const x = s * (span + 0.6), z = k * (half - 0.2);
    const st = mesh([box(0.5, 2.4, 0.5, x, Q + 1.2, z), box(1.0, 0.3, 1.0, x, Q + 2.55, z)], M.stone);
    st.castShadow = true;
    g.add(st);
    anchors.bridgeLamps.push(new THREE.Vector3(x, Q + 3.1, z));
  }
  // arch keel lamp row, the classic lit soffit
  for (let i = -4; i <= 4; i++) {
    const a = (i / 4.6) * Math.PI * 0.86;
    anchors.archLamps.push(new THREE.Vector3(Math.cos(a) * 5.2, 0.4 + Math.sin(a) * 5.2, z0));
  }
  return g;
}

/* ---------------------------------------------------------------- 夫子庙 */
function temple(anchors) {
  const g = new THREE.Group();
  const cx = 58;

  // silled platform
  const plat = mesh(box(24, 2.6, 30, cx, Q + 1.3, 0), M.stone);
  plat.castShadow = plat.receiveShadow = true;
  g.add(plat);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railingGeo(28, { height: 1.1, spacing: 1.5 }), M.stone);
    r.position.set(cx + s * 11.6, Q + 2.6, 0);
    r.rotation.y = Math.PI / 2;
    g.add(r);
  }
  // central stairs with 御路
  const stairParts = [];
  for (let k = 0; k < 7; k++) stairParts.push(box(7.5, 0.42, 1.0, cx - 12 - 0.4 + k * 0.15, Q + 2.5 - k * 0.42, -k * 0.95));
  const stair = mesh(stairParts, M.stone);
  stair.receiveShadow = true;
  g.add(stair);
  const ramp = mesh(box(3.2, 0.3, 6.6, cx - 12.6, Q + 1.35, -3.2), M.stoneDark);
  ramp.rotation.x = -0.36;
  g.add(ramp);

  // hall body
  const wallH = 6.0, wy = Q + 2.6;
  LAYOUT.temple = { x0: cx - 5.7, x1: cx + 9.7, halfZ: 9.6, floorY: wy, ceilY: wy + wallH, axisZ: 0, doorX: cx - 6.1 };
  const shell = mesh([
    box(0.5, wallH, 20, cx + 10, wy + wallH / 2, 0),
    box(16, wallH, 0.5, cx + 2, wy + wallH / 2, -9.9),
    box(16, wallH, 0.5, cx + 2, wy + wallH / 2, 9.9),
    box(0.5, wallH, 20, cx - 6, wy + wallH / 2, 0),
  ], M.redWall);
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);

  // colonnade on the front (riverside) face
  const cols = [];
  for (let i = 0; i <= 6; i++) {
    const z = -9 + (18 * i) / 6;
    const c = new THREE.Mesh(pillarGeo(wallH + 0.6, 0.34), M.pillarBright);
    c.position.set(cx - 7.4, wy, z);
    c.castShadow = true;
    g.add(c);
    cols.push(z);
    anchors.templeLamps.push(new THREE.Vector3(cx - 7.6, wy + wallH - 0.4, z));
  }
  const archi = mesh([box(19, 0.6, 0.6, cx - 6.6, wy + wallH + 0.2, 0), box(0.6, 0.6, 19, cx - 7.4, wy + wallH + 0.2, 0)], M.beam);
  g.add(archi);

  // lattice doors
  for (let i = 0; i < 6; i++) {
    const z = -9 + (18 * (i + 0.5)) / 6;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), M.lattice);
    w.position.set(cx - 5.9, wy + 1.9, z);
    w.rotation.y = Math.PI / 2;
    g.add(w);
    anchors.templeWindows.push(new THREE.Vector3(cx - 6.2, wy + 2.2, z));
  }

  // double-eave hip roof, upper and lower
  const lower = new THREE.Mesh(chineseRoof({
    width: 24, depth: 19, height: 3.0, ridgeRatio: 0.46, curve: 0.62, eaveLift: 0.62, overhang: 1.4, segU: 30, segV: 20,
  }), M.roofGreen);
  lower.rotation.y = Math.PI / 2;
  lower.position.set(cx + 2, wy + wallH + 0.5, 0);
  lower.castShadow = true;
  const upper = new THREE.Mesh(chineseRoof({
    width: 17, depth: 12, height: 3.2, ridgeRatio: 0.4, curve: 0.6, eaveLift: 0.75, overhang: 1.1, segU: 26, segV: 18,
  }), M.roofGreen);
  upper.rotation.y = Math.PI / 2;
  upper.position.set(cx + 2, wy + wallH + 3.6, 0);
  upper.castShadow = true;
  const ridge = mesh(ridgeOrnament({ width: 17, depth: 12, height: 3.2, ridgeRatio: 0.4, overhang: 1.1 }), M.gilt);
  ridge.rotation.y = Math.PI / 2;
  ridge.position.set(cx + 2, wy + wallH + 6.8, 0);
  g.add(lower, upper, ridge);

  const sign = plaqueMesh('大成殿', 6.4, 1.8, { dir: 'h', bg: '#123057', fg: '#f5e2b4' });
  sign.position.set(cx - 6.0, wy + wallH - 0.4, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  anchors.dian.sign = sign.position;

  // side wings / 廊
  for (const s of [-1, 1]) {
    const wing = mesh([
      box(12, 3.4, 0.5, cx - 12, Q + 2.6 + 1.7, s * 14),
      box(0.5, 3.4, 6, cx - 6, Q + 2.6 + 1.7, s * 12),
    ], M.wall);
    wing.castShadow = true;
    g.add(wing);
    const wr = new THREE.Mesh(chineseRoof({
      width: 13, depth: 5, height: 1.4, ridgeRatio: 0.9, curve: 0.5, eaveLift: 0.3, overhang: 0.8,
    }), M.roof);
    wr.position.set(cx - 12, Q + 6.1, s * 14);
    wr.rotation.y = Math.PI / 2;
    g.add(wr);
    for (let i = 0; i < 4; i++) anchors.courtyardLamps.push(new THREE.Vector3(cx - 12 + rr(-5, 5), Q + 4.6, s * (10 + i * 1.4)));
  }
  return g;
}

/* ---------------------------------------------------------------- 天下文枢坊 & 照壁 */
function paifang(anchors) {
  const g = new THREE.Group();
  const cx = 36;
  const colH = 7.4;
  const zs = [-8.5, -4.6, 4.6, 8.5];
  for (const z of zs) {
    const c = new THREE.Mesh(pillarGeo(colH, 0.42), M.pillarBright);
    c.position.set(cx, Q + 0.2, z);
    c.castShadow = true;
    g.add(c);
    const base = mesh(box(1.6, 0.8, 1.0, cx, Q + 0.4, z), M.stone);
    g.add(base);
  }
  const tiers = [[colH, 19.4], [colH - 2.2, 11.6]];
  for (const [y, w] of tiers) {
    const beamParts = [box(0.8, 0.7, w, cx, Q + y, 0)];
    for (let i = 0; i < 9; i++) beamParts.push(box(0.62, 0.5, 0.5, cx, Q + y + 0.6, -w / 2 + (w * i) / 8));
    const bm = mesh(beamParts, M.beam);
    bm.castShadow = true;
    g.add(bm);
    const roof = new THREE.Mesh(chineseRoof({
      width: w + 2.2, depth: 2.6, height: 1.15, ridgeRatio: 0.55, curve: 0.55, eaveLift: 0.55, overhang: 0.4, hip: true,
    }), M.roof);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(cx, Q + y + 1.1, 0);
    roof.castShadow = true;
    g.add(roof);
    const rg = mesh(ridgeOrnament({ width: w + 2.2, depth: 2.6, height: 1.15, ridgeRatio: 0.55, overhang: 0.4 }), M.ridge);
    rg.rotation.y = Math.PI / 2;
    rg.position.set(cx, Q + y + 2.25, 0);
    g.add(rg);
  }
  const sign = plaqueMesh('天下文枢', 5.6, 1.6, { dir: 'h', bg: '#123057', fg: '#f0d7a2' });
  sign.position.set(cx + 0.45, Q + 4.9, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  const sign2 = plaqueMesh('夫子庙', 4.2, 1.3, { dir: 'h', bg: '#2b1a3a', fg: '#f0d7a2' });
  sign2.position.set(cx - 0.45, Q + 8.0, 0);
  sign2.rotation.y = -Math.PI / 2;
  g.add(sign2);
  for (const z of [-3, 3]) anchors.paifangLamps.push(new THREE.Vector3(cx, Q + 4.1, z));

  // 大照壁 screen-walling the river frontage, downstream of the bridge axis
  const wallZ = 15, zbZ = 28;
  const zb = mesh([
    box(1.4, 3.4, 2 * wallZ, 21, Q + 1.7, zbZ),
    box(2.2, 0.6, 2 * wallZ + 1.4, 21, Q + 3.6, zbZ),
  ], M.wall);
  zb.castShadow = zb.receiveShadow = true;
  g.add(zb);
  const zbRoof = new THREE.Mesh(chineseRoof({
    width: 2 * wallZ + 3, depth: 2.6, height: 1.1, ridgeRatio: 0.9, curve: 0.5, eaveLift: 0.4, overhang: 0.5,
  }), M.roof);
  zbRoof.rotation.y = Math.PI / 2;
  zbRoof.position.set(21, Q + 4.2, zbZ);
  zbRoof.castShadow = true;
  g.add(zbRoof);
  const panel = mesh(box(0.3, 2.2, 9, 20.2, Q + 1.8, zbZ), M.stoneDark);
  g.add(panel);
  for (let i = -2; i <= 2; i++) anchors.zhaobiLamps.push(new THREE.Vector3(20.4, Q + 2.0, zbZ + i * 4));
  return g;
}

/* ---------------------------------------------------------------- 江南贡院 */
function examinationHall(anchors) {
  const g = new THREE.Group();
  const cx = -52, cz = 46;
  LAYOUT.gongyuan = { cx, cz, hallX: cx - 12, cellsX0: cx - 22, cellsZ: cz };
  const gate = mesh([
    box(0.8, 6.2, 0.8, cx, Q + 3.1, cz - 5.4),
    box(0.8, 6.2, 0.8, cx, Q + 3.1, cz + 5.4),
    box(0.8, 4.6, 0.8, cx + 4.5, Q + 2.3, cz - 5.4),
    box(0.8, 4.6, 0.8, cx + 4.5, Q + 2.3, cz + 5.4),
    box(1.1, 0.7, 12.6, cx, Q + 6.5, cz),
    box(1.1, 0.6, 12.6, cx, Q + 4.1, cz),
  ], M.pillar);
  gate.castShadow = true;
  g.add(gate);
  for (const [y, w] of [[Q + 7.2, 14.4], [Q + 4.8, 12.6]]) {
    const r = new THREE.Mesh(chineseRoof({ width: w, depth: 3, height: 1.0, ridgeRatio: 0.5, curve: 0.55, eaveLift: 0.5, overhang: 0.4 }), M.roof);
    r.rotation.y = Math.PI / 2;
    r.position.set(cx, y, cz);
    r.castShadow = true;
    g.add(r);
  }
  const sign = plaqueMesh('江南贡院', 5.2, 1.5, { dir: 'h', bg: '#1a2f24', fg: '#eeddb0' });
  sign.position.set(cx - 0.7, Q + 5.4, cz);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  for (const dz of [-4.4, 4.4]) anchors.gongyuanLamps.push(new THREE.Vector3(cx - 0.9, Q + 4.6, cz + dz));

  // hall behind the gate
  const hall = mesh(box(13, 5.2, 17, cx - 12, Q + 2.6, cz), M.wall);
  hall.castShadow = hall.receiveShadow = true;
  g.add(hall);
  const hr = new THREE.Mesh(chineseRoof({ width: 20, depth: 16, height: 2.4, ridgeRatio: 0.5, curve: 0.6, eaveLift: 0.55, overhang: 1.2 }), M.roof);
  hr.rotation.y = Math.PI / 2;
  hr.position.set(cx - 12, Q + 5.4, cz);
  hr.castShadow = true;
  g.add(hr);
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.6), M.lattice);
    w.position.set(cx - 5.4, Q + 2.9, cz - 7 + i * 3.5);
    g.add(w);
    anchors.gongyuanWindows.push(new THREE.Vector3(cx - 5.6, Q + 3.0, cz - 7 + i * 3.5));
  }

  // rows of 号舍, tiny cells receding into the dark
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 14; i++) {
      const x = cx - 22 - r * 3.4, z = cz - 10.5 + i * 1.6;
      cells.push(box(2.6, 1.9, 1.4, x, Q + 0.95, z));
      const pr = new THREE.BoxGeometry(2.9, 0.7, 1.7);
      pr.rotateY(Math.PI / 4);
      pr.scale(1, 1, 0.6);
      pr.translate(x, Q + 2.2, z);
      cells.push(pr);
    }
  }
  const cm = mesh(cells, M.stoneDark);
  cm.castShadow = true;
  g.add(cm);
  anchors.gongyuanLamps.push(new THREE.Vector3(cx - 20, Q + 3.2, cz - 6), new THREE.Vector3(cx - 20, Q + 3.2, cz + 6));
  return g;
}

/* ---------------------------------------------------------------- 桃叶渡 */
function ferry(anchors) {
  const g = new THREE.Group();
  const cz = -84, x = -HW - 2.2;
  LAYOUT.ferry = { x: x - 4, z: cz };
  const pav = new THREE.Group();
  const posts = [];
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    const p = new THREE.Mesh(pillarGeo(3.6, 0.2), M.pillar);
    p.position.set(dx, Q + 0.4, dz);
    p.castShadow = true;
    posts.push(p);
  }
  pav.add(...posts);
  const roof = new THREE.Mesh(chineseRoof({ width: 5.2, depth: 5.2, height: 1.9, ridgeRatio: 0.16, curve: 0.55, eaveLift: 0.55, overhang: 0.7 }), M.roof);
  roof.position.set(0, Q + 4.0, 0);
  roof.castShadow = true;
  pav.add(roof);
  const fin = mesh([
    new THREE.ConeGeometry(0.28, 0.9, 8).translate(0, Q + 5.9, 0),
    box(0.16, 0.7, 0.16, 0, Q + 6.4, 0),
  ], M.gilt);
  pav.add(fin);
  const pl = plaqueMesh('桃叶渡', 1.05, 2.7, { dir: 'v', bg: '#2b1a3a', fg: '#f0d7a2' });
  pl.position.set(0, Q + 3.0, -1.85);
  pav.add(pl);
  pav.position.set(x - 4, 0, cz);
  g.add(pav);
  anchors.ferryLamps.push(new THREE.Vector3(x - 4, Q + 3.4, cz - 1.9), new THREE.Vector3(x - 4, Q + 3.6, cz + 1.6));

  // stone landing + mooring rings
  const land = mesh([
    box(5.4, 0.5, 12, x - 1.2, Q - 0.1, cz),
    box(4.2, 0.4, 3.2, x + 1.4, Q - 0.7, cz + 3),
    box(4.2, 0.4, 3.2, x + 1.4, Q - 1.1, cz - 3),
  ], M.stone);
  land.receiveShadow = true;
  g.add(land);
  const stele = mesh([box(1.1, 2.6, 0.3, x - 3.4, Q + 1.3, cz + 6.4), box(1.7, 0.5, 0.7, x - 3.4, Q + 2.7, cz + 6.4)], M.stone);
  g.add(stele);
  return g;
}

/* ---------------------------------------------------------------- assembly */
export function buildQuarter(scene) {
  const anchors = {
    eaves: [], lampPosts: [], windowGlow: [], bridgeLamps: [], archLamps: [],
    templeLamps: [], templeWindows: [], courtyardLamps: [], paifangLamps: [],
    zhaobiLamps: [], gongyuanLamps: [], gongyuanWindows: [], ferryLamps: [],
    shopLamps: [], stringEnds: [], gate: [], dian: {},
  };
  const group = new THREE.Group();
  group.name = 'quarter';
  group.add(banks());
  group.add(quayFurniture(anchors));
  group.add(gallery(anchors));
  group.add(bridge(anchors));
  group.add(temple(anchors));
  group.add(paifang(anchors));
  group.add(examinationHall(anchors));
  group.add(ferry(anchors));

  // pavilions and shops dotting both banks
  const walls = [], roofs = [];
  for (let i = 0; i < 9; i++) {
    const s = i % 2 ? 1 : -1;
    const z = -70 + i * 16 + rr(-4, 4);
    const x = s * (HW + rr(9, 15));
    if (Math.abs(z) < 8 && s < 0) continue;
    const w = rr(4, 6), d = rr(3.5, 5.5), h = rr(2.8, 3.8);
    walls.push(box(w, h, d, x, Q + h / 2, z));
    const rg = chineseRoof({ width: w + 1.4, depth: d + 1.4, height: 1.1, ridgeRatio: 0.45, curve: 0.55, eaveLift: 0.45, overhang: 0.3 });
    if (rand() > 0.5) rg.rotateY(Math.PI / 2);
    rg.translate(x, Q + h + 0.1, z);
    roofs.push(rg);
    anchors.shopLamps.push(new THREE.Vector3(x, Q + h * 0.8, z + d / 2));
  }
  const shopRoofs = mesh(roofs, M.roof);
  const shopWalls = mesh(walls, M.wall);
  shopRoofs.castShadow = shopWalls.castShadow = true;
  group.add(shopRoofs, shopWalls);

  // river-edge banner poles with silk streamers
  const silkParts = [];
  const near = (z) => STATIONS.some((st) => Math.abs(st.pos[2] - z) < 9);
  for (let z = -66; z <= 78; z += 13) {
    if (rand() > 0.72 || near(z)) continue;
    const x = HW + 3.4;
    silkParts.push(box(0.12, 3.6, 0.12, x, Q + 1.8, z));
    const flag = new THREE.PlaneGeometry(1.1, 1.9);
    flag.translate(x - 0.6, Q + 3.1, z);
    silkParts.push(flag);
  }
  const flags = new THREE.Mesh(mergeGeometries(silkParts), M.silk);
  group.add(flags);

  scene.add(group);

  // overhead light strings across the water, endpoints on the two lamp-post lines
  for (let z = -66; z <= 66; z += 22) {
    if (Math.abs(z) < 12) continue;
    anchors.stringEnds.push([
      new THREE.Vector3(-HW - 4.6, Q + 4.4, z - 5),
      new THREE.Vector3(HW + 4.6, Q + 4.6, z + 5),
    ]);
  }
  return { group, anchors, silkFlags: flags };
}

export { T };
