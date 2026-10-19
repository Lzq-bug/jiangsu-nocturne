import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, loft, roundedSection, rand, rr } from './kit.js';
import { GATE, LAKE, STATIONS } from './data.js';
import * as T from './textures.js';

/** keep the water, the gate footprint and every camera position clear */
function freeOf(x, z) {
  if (z > GATE.shoreZ - 20 && z < 1900) return false;            // the lake
  if (Math.abs(x) < 360 && z > -300) return false;                 // gate + podium
  for (const s of STATIONS) {
    if (Math.hypot(s.pos[0] - x, s.pos[2] - z) < 70) return false;
  }
  return true;
}

const SECTION = roundedSection(0.16, 3);

/** one tower as a tapered prism, UV baked in metres so window scale is uniform */
function towerGeo({ x, z, w, d, h, twist = 0, taper = 0.86 }) {
  const levels = [
    { y: -6, cx: x, cz: z, sx: w / 2, sz: d / 2 },
    { y: h * 0.55, cx: x, cz: z, sx: w * taper / 2, sz: d * taper / 2 },
    { y: h, cx: x, cz: z, sx: w * taper * 0.9 / 2, sz: d * taper * 0.9 / 2 },
  ];
  if (twist) {
    for (const lv of levels) {
      const c = Math.cos(twist), s = Math.sin(twist);
      const nx = lv.cx * c - lv.cz * s, nz = lv.cx * s + lv.cz * c;
      lv.cx = nx; lv.cz = nz;
    }
  }
  return loft(levels, SECTION, { uvScale: 6.2 });
}

/* ------------------------------------------------------------------ districts */

function westDistrict(n = 74) {
  const parts = [], tops = [], beacons = [];
  let guard = 0;
  while (parts.length < n && guard++ < n * 12) {
    const x = rr(-1250, 1250);
    const z = rr(-1700, -320);
    if (!freeOf(x, z)) continue;
    const w = rr(26, 62), d = rr(24, 58);
    const h = 46 + Math.pow(rand(), 1.7) * 175;
    parts.push(towerGeo({ x, z, w, d, h, taper: rr(0.78, 0.98) }));
    tops.push(new THREE.BoxGeometry(w * 0.8, 0.9, d * 0.8).translate(x, h + 0.6, z));
    if (h > 150 && rand() > 0.4) beacons.push(new THREE.SphereGeometry(1.3, 6, 5).translate(x, h + 8, z));
  }
  return { body: mergeGeometries(parts), tops: mergeGeometries(tops), beacons };
}

function flankDistrict(n = 52) {
  const parts = [], tops = [];
  let guard = 0;
  while (parts.length < n && guard++ < n * 14) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * rr(400, 1500);
    const z = rr(-560, 40);
    if (!freeOf(x, z)) continue;
    const w = rr(24, 54), d = rr(22, 50);
    const h = 40 + Math.pow(rand(), 1.6) * 130;
    parts.push(towerGeo({ x, z, w, d, h, taper: rr(0.8, 1) }));
    tops.push(new THREE.BoxGeometry(w * 0.76, 0.8, d * 0.76).translate(x, h + 0.5, z));
  }
  return { body: mergeGeometries(parts), tops: mergeGeometries(tops) };
}

/** 湖东：the row the 连廊 platform looks at, including three tall landmarks */
function eastDistrict() {
  const parts = [], tops = [], beacons = [];
  const z0 = LAKE.farZ + 60;
  for (let i = 0; i < 26; i++) {
    const x = -780 + (1560 * i) / 26 + rr(-24, 24);
    const z = z0 + rr(0, 340);
    const w = rr(28, 58), d = rr(26, 54);
    const h = 60 + Math.pow(rand(), 1.5) * 150;
    parts.push(towerGeo({ x, z, w, d, h, taper: rr(0.82, 1) }));
    tops.push(new THREE.BoxGeometry(w * 0.8, 0.9, d * 0.8).translate(x, h + 0.6, z));
  }
  // the financial cluster on the east shore
  const tall = [[-190, 1380, 74, 66, 336], [60, 1520, 66, 60, 292], [250, 1330, 58, 56, 236]];
  for (const [x, z, w, d, h] of tall) {
    parts.push(towerGeo({ x, z, w, d, h, taper: 0.7, twist: rand() * 0.25 }));
    tops.push(new THREE.BoxGeometry(w * 0.7, 1.2, d * 0.7).translate(x, h + 0.8, z));
    beacons.push(new THREE.SphereGeometry(1.6, 6, 5).translate(x, h + 12, z));
  }
  return { body: mergeGeometries(parts), tops: mergeGeometries(tops), beacons };
}

/** far city — a dark band with pinprick windows, closing the horizon */
function farCity() {
  const N = 520;
  const pos = new Float32Array(N * 3);
  const sil = [];
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const band = 2200 + Math.pow(rand(), 0.6) * 900;
    const x = Math.cos(a) * band, z = Math.sin(a) * band;
    const h = 12 + rand() * 46, w = 24 + rand() * 40;
    sil.push(new THREE.BoxGeometry(w, h, w * 0.8).translate(x, h / 2, z));
    pos.set([x + rr(-w * 0.3, w * 0.3), h * rr(0.3, 0.8), z + rr(-w * 0.3, w * 0.3)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    map: T.softGlow('255,206,150', 0.2), size: 9, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  m.toneMapped = false;
  return { mesh: mergeGeometries(sil), points: new THREE.Points(g, m) };
}

/* ------------------------------------------------------------------ traffic */

/** car streams along the lakeside road and two cross-city axes */
const ROADS = [
  { a: [-820, 6.5, 132], b: [820, 6.5, 132] },
  { a: [820, 6.5, 150], b: [-820, 6.5, 150] },
  { a: [-700, 6.5, -260], b: [700, 6.5, -260] },
  { a: [700, 6.5, -280], b: [-700, 6.5, -280] },
  { a: [-360, 6.5, -340], b: [-360, 6.5, 120] },
  { a: [360, 6.5, 120], b: [360, 6.5, -340] },
];

function traffic() {
  const per = 26;
  const N = ROADS.length * per;
  const pos = new Float32Array(N * 3);
  const dir = new Float32Array(N * 3);
  const len = new Float32Array(N);
  const meta = new Float32Array(N * 2);
  const col = new Float32Array(N * 3);
  let k = 0;
  for (let r = 0; r < ROADS.length; r++) {
    const { a, b } = ROADS[r];
    const d = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]);
    const L = d.length();
    d.divideScalar(L);
    // one carriageway carries headlight white, the other taillight red
    const warm = r % 2 === 0;
    for (let i = 0; i < per; i++) {
      pos.set(a, k * 3);
      d.toArray(dir, k * 3);
      len[k] = L;
      meta[k * 2] = i / per + rr(-0.014, 0.014);
      meta[k * 2 + 1] = rr(0.028, 0.05);
      col.set(warm ? [1.0, 0.92, 0.78] : [1.0, 0.3, 0.22], k * 3);
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aLen', new THREE.BufferAttribute(len, 1));
  g.setAttribute('aMeta', new THREE.BufferAttribute(meta, 2));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uTex: { value: T.softGlow('255,230,190', 0.15) }, uScale: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aDir; attribute vec2 aMeta; attribute float aLen; attribute vec3 aColor;
      uniform float uTime; uniform float uScale;
      varying vec3 vCol;
      void main(){
        float t = fract(aMeta.x + uTime * aMeta.y);
        vec3 p = position + aDir * (t * aLen);
        vCol = aColor;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 11.0 * clamp(260.0 / -mv.z, 0.3, 1.8);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; varying vec3 vCol;
      void main(){ vec4 s = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol, s.a * 0.9); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return { mesh: pts, uni: m.uniforms };
}

/* ------------------------------------------------------------------ assembly */

export function buildSkyline(scene) {
  const group = new THREE.Group();
  group.name = 'skyline';
  scene.add(group);

  const west = westDistrict();
  const flank = flankDistrict();
  const east = eastDistrict();
  const bodies = [west, flank, east].flatMap((d) => (d.body ? [d.body] : []));
  const merged = mergeGeometries(bodies);
  const cityMesh = new THREE.Mesh(merged, M.city);
  cityMesh.name = 'cbd-towers';
  group.add(cityMesh);

  const capParts = [];
  for (const d of [west, flank, east]) if (d.tops) capParts.push(d.tops);
  group.add(new THREE.Mesh(mergeGeometries(capParts), glow('#a9d8ff', 1.1)));

  const beaconParts = [];
  for (const d of [west, flank, east]) if (d.beacons) beaconParts.push(...d.beacons);
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6250').multiplyScalar(2.2) });
  beaconMat.toneMapped = false; beaconMat.fog = false;
  const beacons = new THREE.Mesh(mergeGeometries(beaconParts), beaconMat);
  beacons.name = 'skyline-beacons';
  group.add(beacons);

  const far = farCity();
  const farMesh = new THREE.Mesh(far.mesh, M.silhouette);
  group.add(farMesh, far.points);

  const car = traffic();
  group.add(car.mesh);

  // a thin band of shore lighting all the way round, so the water has an edge
  const shoreLight = [];
  for (let x = -900; x <= 900; x += 18) shoreLight.push(new THREE.BoxGeometry(9, 0.5, 0.9).translate(x, 5.9, GATE.shoreZ - 2));
  group.add(new THREE.Mesh(mergeGeometries(shoreLight), glow('#ffdda6', 1.35)));

  const beaconBase = new THREE.Color('#ff6250').multiplyScalar(2.2);
  return {
    group,
    /** the merged CBD mass — mirrored into the lake by main.js */
    towers: cityMesh,
    update(t) {
      car.uni.uTime.value = t;
      const on = Math.sin(t * 3.1) > 0.15;
      beaconMat.color.copy(beaconBase).multiplyScalar(on ? 1 : 0.12);
    },
    setTrafficScale(v) { car.uni.uScale.value = v; },
  };
}
