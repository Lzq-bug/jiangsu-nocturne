import * as THREE from 'three';
import { M, glow, box, mesh } from './kit.js';
import { GATE, LAKE } from './data.js';

const H = GATE.height;
const DEPTH = GATE.depth;
const FRONT = DEPTH / 2;

/** where the built parts are, for the water columns and the light show */
export const ANCHORS = { crown: [], archEdge: [], podium: [], soffit: [] };

/* ------------------------------------------------------------------ profile */

/** outer elevation barely moves — 150 m at the feet, 142 m under the crown */
const outerHalf = (y) => GATE.outerHalf - 8 * (y / H) ** 2;

const ARCH_A = GATE.archHalf;  // half gap at ground level
const APEX = GATE.archApex;    // crown of the arch, underside of the bridge
const APEX1 = APEX * 0.962;    // where the straight run hands over to the cap

function archHalf(y) {
  if (y <= 0) return ARCH_A;
  if (y <= APEX1) {
    const u = Math.min(1, y / APEX);
    return ARCH_A * Math.pow(Math.max(0, 1 - Math.pow(u, 2.6)), 0.72);
  }
  const cap = archHalf(APEX1);
  const t = Math.min(1, (y - APEX1) / (APEX - APEX1));
  return cap * Math.sqrt(Math.max(0, 1 - t * t));
}

/** the 门 as one closed, concave outline — no holes needed */
function outline() {
  const pts = [];
  const push = (x, y) => {
    const l = pts[pts.length - 1];
    if (l && Math.abs(l[0] - x) < 1e-4 && Math.abs(l[1] - y) < 1e-4) return;
    pts.push([x, y]);
  };
  const nOut = 24, nIn = 26;
  for (let i = 0; i <= nOut; i++) push(-outerHalf((H * i) / nOut), (H * i) / nOut);
  for (let i = nOut; i >= 0; i--) push(outerHalf((H * i) / nOut), (H * i) / nOut);
  push(archHalf(0), 0);
  for (let i = 1; i <= nIn; i++) {
    const y = (APEX * i) / nIn;
    push(archHalf(y), y);
  }
  for (let i = nIn; i >= 1; i--) {
    const y = (APEX * i) / nIn;
    push(-archHalf(y), y);
  }
  push(-archHalf(0), 0);
  return pts;
}

function gateGeometry() {
  const pts = outline();
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -FRONT);
  g.computeVertexNormals();
  return { shape, geometry: g, points: pts };
}

/* ------------------------------------------------------------------ lights on the edges */

/** a glowing tube following a 2-D point list, placed on a face of the tower */
function edgeTube(points, { z, radius, color, intensity = 1.7, seg = 3 }) {
  const pts = points.map(([x, y]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02);
  const g = new THREE.TubeGeometry(curve, Math.max(24, pts.length * 3), radius, seg, false);
  return new THREE.Mesh(g, glow(color, intensity));
}

/** the inner arch curve only — the signature outline of the gate */
function archCurvePoints() {
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const y = (APEX * i) / 30;
    pts.push([archHalf(y), y]);
  }
  for (let i = 30; i >= 0; i--) {
    const y = (APEX * i) / 30;
    pts.push([-archHalf(y), y]);
  }
  return pts;
}

/* ------------------------------------------------------------------ pieces */

function towers(geo) {
  const m = new THREE.Mesh(geo, [M.glass, M.glassSide]);
  m.name = 'gate-body';
  m.receiveShadow = true;
  ANCHORS.crown.push(new THREE.Vector3(0, H + 1, 0));
  return m;
}

/** vertical light lines on the four outer arrises + the crown cornice */
function edgeLights(g) {
  const parts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (outerHalf(H) - 1.2), z = sz * (FRONT - 1.4);
      const v = new THREE.BoxGeometry(0.7, H - 6, 0.7);
      v.translate(x, (H - 6) / 2 + 3, z);
      parts.push(v);
    }
  }
  // crown cornice — one bright ring at the top of the bridge
  const oh = outerHalf(H);
  parts.push(box(oh * 2, 1.4, 1.2, 0, H - 2.6, FRONT - 0.6));
  parts.push(box(oh * 2, 1.4, 1.2, 0, H - 2.6, -FRONT + 0.6));
  for (const sx of [-1, 1]) {
    const side = new THREE.BoxGeometry(1.2, 1.4, DEPTH - 1.6);
    side.translate(sx * (oh - 0.6), H - 2.6, 0);
    parts.push(side);
  }
  const m = mesh(parts, glow('#cfe9ff', 2.1));
  m.name = 'gate-edges';
  g.add(m);

  // a warm second outline just under the cornice, so the crown reads at distance
  const sub = mesh([box(oh * 2 - 6, 0.8, 0.9, 0, H - 12, FRONT - 0.4)], glow('#ffd9a0', 1.5));
  g.add(sub);
}

/** the traced arch: the curve that makes the silhouette readable at night */
function archLights(g) {
  const curve = archCurvePoints();
  for (const z of [FRONT + 0.5, -FRONT - 0.5]) {
    const t = edgeTube(curve, { z, radius: 0.55, color: '#8fe8ff', intensity: 2.0 });
    t.name = 'gate-arch';
    g.add(t);
  }
  // the two feet of the arch, where the curve meets the plaza
  ANCHORS.soffit.push(new THREE.Vector3(0, APEX - 6, FRONT - 8), new THREE.Vector3(0, APEX - 6, -FRONT + 8));
}

/** skybridge band + observation deck on the lake face */
function bridge(g) {
  const oh = outerHalf(H);
  // a bright horizontal seam where the arch closes into the bridge
  const seam = mesh([
    box(oh * 2 - 10, 1.3, 1, 0, APEX + 1.5, FRONT + 0.3),
    box(oh * 2 - 10, 1.3, 1, 0, APEX + 1.5, -FRONT - 0.3),
  ], glow('#ffdcae', 1.5));
  g.add(seam);

  // deck at 246 m: the camera stands here in the 连廊 station
  const deck = mesh([box(52, 1.2, 11, 0, 246, FRONT + 5)], M.deck);
  deck.receiveShadow = true;
  deck.name = 'gate-deck';
  g.add(deck);
  // a dim lit underside, otherwise the platform reads as a black slab from the arch
  g.add(mesh([box(46, 0.3, 8, 0, 245.5, FRONT + 5)], glow('#ffd9a0', 0.3)));
  const rail = [];
  for (let i = 0; i <= 13; i++) rail.push(box(0.18, 1.15, 0.18, -26 + i * 4, 247.2, FRONT + 10.2));
  for (const sx of [-1, 1]) rail.push(box(0.18, 1.15, 10.6, sx * 25.9, 247.2, FRONT + 5));
  g.add(mesh(rail, M.steel));
  // the handrail sits at eye level 8 m from the 连廊 camera: any brighter than a
  // hint and it smears across the whole frame
  g.add(mesh([box(53, 0.12, 0.2, 0, 248.35, FRONT + 10.2)], glow('#9fe6ff', 0.07)));
  ANCHORS.crown.push(new THREE.Vector3(0, 248, FRONT + 5));
}

/** 裙房：the mall wings hugging the two legs, kept clear of the arch opening */
function podium(g) {
  const grp = new THREE.Group();
  grp.name = 'gate-podium';
  const top = 18;
  const parts = [], glass = [];
  for (const sx of [-1, 1]) {
    const x0 = GATE.outerHalf + 4, x1 = 330;
    const w = x1 - x0;
    parts.push(box(w, top, 150, (x0 + x1) / 2 * sx, 0, -30));
    glass.push(box(w - 6, 6.2, 2, (x0 + x1) / 2 * sx, 6.6, 46));
  }
  // rear slab on the city side, so the gate never looks like a freestanding arch
  parts.push(box(700, top - 4, 130, 0, 0, -FRONT - 70));
  const body = mesh(parts, M.concrete);
  body.receiveShadow = true;
  const bands = mesh(glass, glow('#ffcf94', 0.8));
  bands.name = 'podium-band';
  grp.add(body, bands);

  // roof edge lighting — the flat top of the podium reads as a bright shelf
  const edge = [];
  for (const sx of [-1, 1]) {
    edge.push(box(170, 0.5, 0.9, sx * 244, top, 46));
    edge.push(box(0.9, 0.5, 150, sx * 330, top, -30));
  }
  grp.add(mesh(edge, glow('#cfe0ff', 1.25)));

  // arcade columns under the arch, at the mouth of the passage
  const col = [];
  for (const sx of [-1, 1]) for (let i = -2; i <= 2; i++) col.push(box(2.4, top - 2, 2.4, sx * (ARCH_A - 12) + i * 6, 0, FRONT - 4));
  grp.add(mesh(col, M.stoneDark));
  ANCHORS.podium.push(new THREE.Vector3(-244, top, 46), new THREE.Vector3(244, top, 46));
  g.add(grp);
  return grp;
}

/** rooftop plant + aviation warning lights */
function crown(g) {
  const grp = new THREE.Group();
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(box(60, 5, 40, sx * 96, H, -4));
    parts.push(box(24, 9, 18, sx * 96, H + 5, -2));
  }
  grp.add(mesh(parts, M.dark));
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), glow('#ff5a4a', 2.4));
    b.position.set(sx * 96, H + 15, 0);
    b.name = 'beacon';
    grp.add(b);
  }
  g.add(grp);
  return grp;
}

/** plaza deck, the stepped lakeside terrace and the passage through the arch */
function ground(g) {
  const grp = new THREE.Group();
  const DECK = 5.5;              // promenade level, metres above the lake surface
  const zBack = -1900, zShore = GATE.shoreZ + 4;
  const deck = mesh([box(3600, DECK + 4, zShore - zBack, 0, -4, (zBack + zShore) / 2)], M.stone);
  deck.receiveShadow = true;
  deck.name = 'plaza';
  grp.add(deck);

  // the far and opposite shores: without ground the mirrored towers would hang
  // in mid-air past the water's edge
  const land = [];
  land.push(box(7000, 12, 2400, 0, -12.2, LAKE.farZ + 1200));
  for (const sx of [-1, 1]) land.push(box(2200, 12, LAKE.farZ, sx * (LAKE.halfWidth + 1100), -12.2, (LAKE.nearZ + LAKE.farZ) / 2));
  const lm = mesh(land, M.stoneDark);
  lm.name = 'far-ground';
  grp.add(lm);

  // stepped terrace down to the water, the last few treads stay wet
  const steps = [];
  for (let k = 0; k < 6; k++) {
    steps.push(box(760 - k * 24, 0.9, 5.6, 0, DECK - 0.9 - k * 0.92, GATE.shoreZ - 6 + k * 5.6));
  }
  const sm = mesh(steps, M.stone);
  sm.receiveShadow = true;
  grp.add(sm);
  const lip = mesh([box(760, 0.3, 1.1, 0, DECK + 0.15, GATE.shoreZ - 7)], glow('#ffd9a0', 1.35));
  grp.add(lip);

  // lamp posts along the promenade — the eye's ruler against a 300 m tower
  const posts = [], lamps = [];
  for (let x = -340; x <= 340; x += 26) {
    const z = GATE.shoreZ - 24;
    posts.push(box(0.45, 6, 0.45, x, DECK, z));
    posts.push(box(2.8, 0.32, 0.32, x, DECK + 5.9, z - 1.1));
    lamps.push(box(2, 0.28, 0.28, x, DECK + 5.6, z - 1.6));
    ANCHORS.podium.push(new THREE.Vector3(x, DECK + 5.4, z - 1.6));
  }
  grp.add(mesh(posts, M.steel));
  grp.add(mesh(lamps, glow('#ffe2b0', 1.9)));

  // inlay stripes in the plaza pointing at the gate
  const inlay = [];
  for (const sx of [-1, 1]) inlay.push(box(1.1, 0.12, 170, sx * 52, DECK + 0.06, GATE.shoreZ - 100));
  grp.add(mesh(inlay, glow('#8fe0ff', 0.9)));
  g.add(grp);
  return grp;
}

/* ------------------------------------------------------------------ assembly */

export function buildGate(scene) {
  const { shape, geometry } = gateGeometry();
  const group = new THREE.Group();
  group.name = 'gate';
  scene.add(group);

  group.add(towers(geometry));
  edgeLights(group);
  archLights(group);
  bridge(group);
  const pod = podium(group);
  const crownGrp = crown(group);
  // the plaza is deliberately kept out of `group`: mirroring a 1500 m slab would
  // paint the whole lake bed and swallow the tower reflections
  const groundGrp = ground(scene);

  return {
    group,
    /** front elevation outline, reused by the media facade in show.js */
    shape,
    podium: pod,
    crown: crownGrp,
    ground: groundGrp,
    anchors: ANCHORS,
    frontZ: FRONT,
    height: H,
    archHalf,
    outerHalf,
    apex: APEX,
    archCurve: archCurvePoints(),
  };
}
