import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, glow, box, mesh, rand, rr, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, plaqueMesh, registerOccluder, M } from './kit.js';
import * as T from './textures.js';
import { terrainH } from './environment.js';
import { BRIDGE_PTS, BRIDGE, RAMPS, TOWER, SHORE_X, SWAN, BOARDWALK, TRAIL, STRIP_COLORS, PEAR } from './layout.js';

/** 构建时回填，供 huaxin.js / portals.js / main.js 读 */
export const LAYOUT = {
  chime: { pos: new THREE.Vector3(), pivot: null, bells: [] },
  tower: { pos: new THREE.Vector3(), top: 0, door: new THREE.Vector3() },
  bridge: { deck: [], curve: null },
  car: { door: new THREE.Vector3() },
};

const group = () => new THREE.Group();

/* ==================================================== 空中廊桥
 * 实景 2266 m、净宽 3~6 m、最大跨径 20 m、钢箱梁、红黄渐变、8 处匝道。
 * 这里压缩成约 240 m 的一段，桥身沿衲田上空蜿蜒，南红北金。
 */
function skyBridge(parent) {
  const grp = group();
  const pts = BRIDGE_PTS.map(([x, z, h]) => new THREE.Vector3(x, terrainH(x, z) + h, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const S = 260;
  const samples = curve.getSpacedPoints(S);
  const half = BRIDGE.width / 2;

  const frames = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const p = samples[i];
    const tan = curve.getTangent(t).setY(0).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x);
    // 净宽 3~6 m：中段最宽，两头收
    const w = half * (0.66 + 0.5 * Math.sin(t * Math.PI));
    frames.push({ p, side, w, t });
  }

  // —— 桥面 + 箱梁两侧
  const deckPos = [], deckIdx = [], deckCol = [];
  const cA = new THREE.Color(), cB = new THREE.Color();
  const grad = (t, out) => {
    const k = Math.min(0.999, t * (STRIP_COLORS.length - 1));
    const i = Math.floor(k);
    cA.set(STRIP_COLORS[i]); cB.set(STRIP_COLORS[i + 1]);
    return out.copy(cA).lerp(cB, k - i);
  };
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    deckPos.push(f.p.x - f.side.x * f.w, f.p.y, f.p.z - f.side.z * f.w);
    deckPos.push(f.p.x + f.side.x * f.w, f.p.y, f.p.z + f.side.z * f.w);
    const c = grad(f.t, new THREE.Color());
    deckCol.push(0.16, 0.16, 0.19, 0.16, 0.16, 0.19);
    void c;
    if (i < frames.length - 1) { const a = i * 2; deckIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  const deckUv = [];
  for (let i = 0; i < frames.length; i++) deckUv.push(0, i * 0.62, 1, i * 0.62);
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(deckUv, 2));
  deckGeo.setIndex(deckIdx); deckGeo.computeVertexNormals();
  const deck = new THREE.Mesh(deckGeo, lit('#d3d8e1', { map: T.deckPlate(), rough: 0.78, side: THREE.DoubleSide, emissive: '#252b36', ei: 0.6 }));
  deck.receiveShadow = true;
  grp.add(deck);

  // 箱梁：底面与两道侧腹
  const girder = [];
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1], h = BRIDGE.girder;
    const q = (f, sx) => [f.p.x + f.side.x * f.w * sx, f.p.y - h, f.p.z + f.side.z * f.w * sx];
    const v = [q(a, -1), q(a, 1), q(b, -1), q(b, 1)];
    const base = girder.length / 3;
    // 侧壁
    girder.push(...v[0], ...v[2], ...v[1], ...v[1], ...v[2], ...v[3]);
    // 底
    girder.push(...v[0], ...v[1], ...v[2], ...v[1], ...v[3], ...v[2]);
    void base;
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute(girder, 3));
  gGeo.computeVertexNormals();
  const gm = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ vertexColors: false, color: new THREE.Color('#c2562f'), roughness: 0.55, metalness: 0.25 }));
  grp.add(gm);

  // —— 灯带：两道贴边的发光薄带，红→金，交给 bloom
  // —— 灯带：桥缘一条窄带、腹下再一条，红→金渐变，交给辉光
  const stripMat = (up, sgn, hi) => {
    const pos = [], col = [], idx = [];
    for (let i = 0; i < frames.length; i++) {
      const a = frames[i];
      const o = a.w + 0.2, inn = a.w - 0.08;
      pos.push(a.p.x + a.side.x * o * sgn, a.p.y + up, a.p.z + a.side.z * o * sgn);
      pos.push(a.p.x + a.side.x * inn * sgn, a.p.y + up, a.p.z + a.side.z * inn * sgn);
      const c = grad(a.t, new THREE.Color());
      col.push(c.r * hi, c.g * hi, c.b * hi, c.r * hi, c.g * hi, c.b * hi);
      if (i < frames.length - 1) { const v = i * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, side: THREE.DoubleSide });
    return new THREE.Mesh(g, m);
  };
  const strips = [stripMat(0.06, 1, 1.3), stripMat(0.06, -1, 1.3), stripMat(-0.36, 1, 0.95), stripMat(-0.36, -1, 0.95)];
  strips.forEach((sm, i) => { sm.renderOrder = 8; sm.name = `light-strip-${i}`; grp.add(sm); });
  const stripBase = strips.map((sm) => Float32Array.from(sm.geometry.attributes.color.array));
  const setStrip = (f) => {
    strips.forEach((sm, si) => {
      const arr = sm.geometry.attributes.color.array;
      const base = stripBase[si];
      for (let i = 0; i < arr.length; i++) arr[i] = base[i] * f;
      sm.geometry.attributes.color.needsUpdate = true;
    });
  };

  // —— 栏杆：两道竖向栏板 + 立柱实例
  const railPos = [], railIdx = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    for (const s of [-1, 1]) {
      railPos.push(f.p.x + f.side.x * f.w * s, f.p.y + BRIDGE.rail, f.p.z + f.side.z * f.w * s);
      railPos.push(f.p.x + f.side.x * f.w * s, f.p.y + 0.34, f.p.z + f.side.z * f.w * s);
    }
    if (i < frames.length - 1) {
      const v = i * 4, n = (i + 1) * 4;
      railIdx.push(v, v + 1, n, n, v + 1, n + 1);
      railIdx.push(v + 2, n + 2, v + 3, v + 3, n + 2, n + 3);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
  rg.setIndex(railIdx); rg.computeVertexNormals();
  const railMat = lit('#e0b878', { rough: 0.42, metal: 0.5, emissive: '#2a1c08', ei: 0.6, side: THREE.DoubleSide });
  railMat.transparent = true; railMat.opacity = 0.34;
  grp.add(new THREE.Mesh(rg, railMat));
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, BRIDGE.rail, 5);
  const posts = new THREE.InstancedMesh(postGeo, lit('#c9a468', { rough: 0.5, metal: 0.4 }), Math.ceil(frames.length / 3) * 2);
  const dum = new THREE.Object3D();
  let pi = 0;
  for (let i = 0; i < frames.length; i += 3) {
    const f = frames[i];
    for (const s of [-1, 1]) {
      dum.position.set(f.p.x + f.side.x * f.w * s, f.p.y + BRIDGE.rail / 2, f.p.z + f.side.z * f.w * s);
      dum.rotation.set(0, 0, 0); dum.scale.set(1, 1, 1); dum.updateMatrix();
      if (pi < posts.count) posts.setMatrixAt(pi++, dum.matrix);
    }
  }
  posts.count = pi;
  grp.add(posts);

  // 矮柱灯：每约 5 个采样点一对，暖头朝上
  const bn = Math.floor(frames.length / 5) * 2;
  const bolls = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6), lit('#4a4238', { rough: 0.7 }), bn);
  const capsB = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), glow('#ffd39a', 1.15), bn);
  let bi = 0;
  for (let i = 2; i < frames.length && bi < bn; i += 5) {
    const f = frames[i];
    for (const s of [-1, 1]) {
      if (bi >= bn) break;
      const x = f.p.x + f.side.x * (f.w - 0.28) * s, z = f.p.z + f.side.z * (f.w - 0.28) * s;
      dum.rotation.set(0, 0, 0); dum.scale.setScalar(1);
      dum.position.set(x, f.p.y + 0.28, z); dum.updateMatrix(); bolls.setMatrixAt(bi, dum.matrix);
      dum.position.set(x, f.p.y + 0.62, z); dum.updateMatrix(); capsB.setMatrixAt(bi, dum.matrix);
      bi++;
    }
  }
  bolls.count = capsB.count = bi;
  grp.add(bolls, capsB);

  // —— 桥墩：净跨按 20 m 上下的实桥感觉，落进坡面
  const pierGeo = new THREE.CylinderGeometry(0.62, 1.05, 1, 10);
  const pierTop = new THREE.CylinderGeometry(1.35, 1.1, 0.5, 10);
  const pierList = [];
  for (let i = 6; i < frames.length - 6; i += 11) pierList.push(frames[i]);
  const piers = new THREE.InstancedMesh(pierGeo, lit('#7f8592', { map: T.stone('#6b7180'), rough: 0.9 }), pierList.length);
  const caps = new THREE.InstancedMesh(pierTop, lit('#8b919d', { rough: 0.85 }), pierList.length);
  pierList.forEach((f, i) => {
    const g = terrainH(f.p.x, f.p.z);
    const h = f.p.y - g + 1.2;
    dum.position.set(f.p.x, g + h / 2 - 1.0, f.p.z);
    dum.rotation.set(0, 0, 0); dum.scale.set(1, h, 1); dum.updateMatrix();
    piers.setMatrixAt(i, dum.matrix);
    dum.position.set(f.p.x, f.p.y - BRIDGE.girder - 0.1, f.p.z);
    dum.scale.set(1, 1, 1); dum.updateMatrix();
    caps.setMatrixAt(i, dum.matrix);
  });
  piers.castShadow = true;
  grp.add(piers, caps);

  // —— 匝道：四处落地，宽 2 m
  for (const R of RAMPS) {
    const i = Math.round(R.at * S);
    const from = frames[i];
    const to = new THREE.Vector3(R.to[0], terrainH(R.to[0], R.to[1]) + 0.25, R.to[1]);
    const mid = from.p.clone().lerp(to, 0.5); mid.y = from.p.y - 1.5;
    mid.x += (mid.x - from.p.x) * 0.5; mid.z += (mid.z - from.p.z) * 0.5;
    const c2 = new THREE.CatmullRomCurve3([from.p.clone(), mid, to], false, 'catmullrom', 0.4);
    const n = 46; const sp = c2.getSpacedPoints(n);
    const pos = [], idx2 = [];
    for (let k = 0; k <= n; k++) {
      const tan = c2.getTangent(k / n).setY(0).normalize();
      const sx = -tan.z, sz = tan.x, hw = R.width / 2;
      pos.push(sp[k].x - sx * hw, sp[k].y, sp[k].z - sz * hw);
      pos.push(sp[k].x + sx * hw, sp[k].y, sp[k].z + sz * hw);
      if (k < n) { const a = k * 2; idx2.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx2); g.computeVertexNormals();
    const m = new THREE.Mesh(g, lit('#868c98', { map: T.deckPlate(), rough: 0.85, side: THREE.DoubleSide, emissive: '#0b0f16', ei: 0.4 }));
    grp.add(m);
    const eg = g.clone(); eg.translate(0, -0.18, 0);
    grp.add(new THREE.Mesh(eg, lit('#c9502f', { rough: 0.62, side: THREE.DoubleSide })));
  }

  // —— 桥上两处观景台：俯瞰衲田的最佳位置就是桥本身
  for (const t of [0.34, 0.72]) {
    const f = frames[Math.round(t * S)];
    const plat = mesh([new THREE.CylinderGeometry(4.6, 4.6, 0.35, 18).translate(0, -0.2, 0)],
      lit('#9aa0ac', { map: T.stone('#8b919d'), rough: 0.86 }));
    plat.position.copy(f.p).add(new THREE.Vector3(f.side.x * 5.1, 0, f.side.z * 5.1));
    grp.add(plat);
    // 挑出去的观景台要落一根柱，不然它是浮在天上的
    const pg = terrainH(plat.position.x, plat.position.z);
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.85, plat.position.y - pg, 9),
      lit('#7f8592', { map: T.stone('#6b7180'), rough: 0.9 }));
    prop.position.set(plat.position.x, pg + (plat.position.y - pg) / 2, plat.position.z);
    prop.castShadow = true;
    grp.add(prop);
    const link = new THREE.Mesh(box(2.6, 0.3, BRIDGE.width * 0.5, 0, 0, 0),
      lit('#9aa0ac', { map: T.deckPlate(), rough: 0.85 }));
    link.position.set((f.p.x + plat.position.x) / 2, f.p.y - 0.15, (f.p.z + plat.position.z) / 2);
    link.rotation.y = Math.atan2(plat.position.x - f.p.x, plat.position.z - f.p.z) + Math.PI / 2;
    grp.add(link);
    const rail = mesh(railingGeo(9, { height: 1.1, spacing: 1.3 }), lit('#cbb27f', { rough: 0.5, metal: 0.35 }));
    rail.position.copy(plat.position).add(new THREE.Vector3(0, 0.2, 0));
    rail.rotation.y = Math.atan2(f.side.x, f.side.z);
    grp.add(rail);
    const lamp = mesh(new THREE.SphereGeometry(0.24, 10, 8), glow('#ffcf8a', 1.3));
    lamp.position.copy(plat.position).add(new THREE.Vector3(0, 3.4, 0));
    grp.add(lamp);
    const pole = mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), lit('#5b4a33', { rough: 0.7 }));
    pole.position.copy(plat.position).add(new THREE.Vector3(0, 1.7, 0));
    grp.add(pole);
  }

  parent.add(grp);
  LAYOUT.bridge.curve = curve;
  LAYOUT.bridge.deck = frames.map((f) => f.p.clone());
  return { group: grp, frames, curve, deck: frames, setStrip };
}

/* ==================================================== 天和塔
 * 可登的塔。五层楼阁式，檐角悬风铎——夜里铃阁就是花信的声源。
 */
function pagoda(parent) {
  const grp = group();
  const g = terrainH(TOWER.x, TOWER.z);
  grp.position.set(TOWER.x, g, TOWER.z);
  const tiers = 5;
  const bodyMat = lit('#d8cdb6', { map: T.plaster('#c3b795'), rough: 0.94 });
  const roofMat = M.roofTemple;
  const parts = [];
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const w = 11 - i * 1.55;
    const bh = i === 0 ? 6.2 : 4.6;
    parts.push(box(w, bh, w, 0, y + bh / 2, 0));
    // 平座
    parts.push(box(w + 2.4, 0.35, w + 2.4, 0, y + 0.1, 0));
    y += bh;
    const roof = new THREE.Mesh(chineseRoof({ width: w + 3.6, depth: w + 3.6, height: 2.5 - i * 0.12, ridgeRatio: 0.3, curve: 0.68, eaveLift: 0.62, overhang: 0.6, segU: 20, segV: 14, hip: true }), roofMat);
    roof.position.y = y;
    roof.castShadow = true;
    grp.add(roof);
    grp.add(mesh(ridgeOrnament({ width: w + 3.6, depth: w + 3.6, height: 2.5 - i * 0.12, ridgeRatio: 0.3, overhang: 0.6 }), lit('#4a4f5c', { rough: 0.8 })));
    grp.children[grp.children.length - 1].position.y = y;
    // 檐角风铎
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const bell = mesh(new THREE.ConeGeometry(0.16, 0.42, 6), M.bronze);
      bell.position.set(sx * (w / 2 + 1.9), y - 0.45, sz * (w / 2 + 1.9));
      grp.add(bell);
      LAYOUT.chime.bells.push({ mesh: bell, pos: bell.position.clone(), tier: i, phase: rand() * 6.28 });
    }
    // 每层格扇
    for (const sz of [-1, 1]) {
      const lat = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.72, bh * 0.6), M.lattice);
      lat.position.set(0, y - bh * 0.35, sz * (w / 2 + 0.02));
      if (sz < 0) lat.rotation.y = Math.PI;
      grp.add(lat);
    }
  }
  grp.add(mesh(parts, bodyMat));
  // 塔刹
  const spire = [];
  spire.push(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 8).translate(0, y + 1.8, 0));
  for (let i = 0; i < 3; i++) spire.push(new THREE.TorusGeometry(0.6 - i * 0.14, 0.1, 6, 14).rotateX(Math.PI / 2).translate(0, y + 1.0 + i * 0.85, 0));
  spire.push(new THREE.SphereGeometry(0.4, 10, 8).translate(0, y + 3.7, 0));
  grp.add(mesh(spire, lit('#d8ab63', { rough: 0.32, metal: 0.85, emissive: '#3a2408', ei: 0.7 })));

  // 塔基台与登塔券门
  grp.add(mesh([box(17, 1.6, 17, 0, -0.8, 0), box(19, 0.5, 19, 0, -1.6, 0)], lit('#8f959f', { map: T.stone('#7f8590'), rough: 0.9 })));
  const door = mesh([box(3.6, 5.2, 1.2, 0, 2.6, 8.2), box(4.6, 0.6, 1.6, 0, 5.5, 8.2)], lit('#3a2a1e', { map: T.wood('#2f2117', '#160e08'), rough: 0.8 }));
  grp.add(door);
  const plaque = plaqueMesh('天和塔', 4.2, 1.5, { bg: '#132a44' });
  plaque.position.set(0, 5.9, 8.9);
  grp.add(plaque);
  for (const s of [-1, 1]) {
    const lantern = mesh(new THREE.SphereGeometry(0.4, 12, 10), glow('#ffb063', 1.25));
    lantern.position.set(s * 5.4, 3.4, 9.4);
    grp.add(lantern);
    grp.add(mesh(pillarGeo(3.2, 0.16), lit('#4a3a28', { rough: 0.8 })).translateX(s * 5.4).translateY(1.6).translateZ(9.4));
  }

  LAYOUT.tower.pos.set(TOWER.x, g, TOWER.z);
  LAYOUT.tower.top = g + y + 3.6;
  LAYOUT.tower.door.set(TOWER.x, g + 2.6, TOWER.z + 8.6);
  registerOccluder(door, 2.4);
  parent.add(grp);
  return grp;
}

/* ==================================================== 南门石坊 */
function gateway(parent) {
  const grp = group();
  const z = TRAIL.z0 - 2, x = TRAIL.x;
  const g = terrainH(x, z);
  grp.position.set(x, g, z);
  const cols = [];
  for (const s of [-1, 0, 1]) {
    const px = s * (s === 0 ? 0 : TRAIL.half + 1.2);
    cols.push(box(1.1, 7.4, 1.1, px, 3.7, 0));
    cols.push(box(1.7, 0.7, 1.7, px, 0.35, 0));
  }
  grp.add(mesh(cols, lit('#a7adb8', { map: T.stone('#949aa6'), rough: 0.9 })));
  const beam = mesh([box(TRAIL.half * 2 + 5, 0.7, 0.9, 0, 7.2, 0), box(TRAIL.half * 2 + 2, 0.5, 0.7, 0, 6.2, 0)], lit('#8b919d', { rough: 0.88 }));
  grp.add(beam);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(chineseRoof({ width: 4.6, depth: 2.4, height: 1.4, ridgeRatio: 0.34, curve: 0.7, eaveLift: 0.7, overhang: 0.4, segU: 16, segV: 10 }), M.roofGrey);
    r.position.set(s * (TRAIL.half + 1.2), 7.6, 0);
    grp.add(r);
  }
  const mid = new THREE.Mesh(chineseRoof({ width: 6.4, depth: 3, height: 1.8, ridgeRatio: 0.3, curve: 0.72, eaveLift: 0.75, overhang: 0.5, segU: 18, segV: 12 }), M.roofGrey);
  mid.position.set(0, 7.7, 0);
  grp.add(mid);
  const sign = plaqueMesh('三台山', 3.6, 1.4, { bg: '#14324a' });
  sign.position.set(0, 6.6, 0.7);
  grp.add(sign);
  const back = plaqueMesh('衲田花海', 3.6, 1.4, { bg: '#0f2438' });
  back.position.set(0, 6.6, -0.7); back.rotation.y = Math.PI;
  grp.add(back);
  parent.add(grp);
  return grp;
}

/* ==================================================== 雾森栈道 */
function boardwalk(parent) {
  const grp = group();
  const pts = BOARDWALK.map(([x, z]) => new THREE.Vector3(x, terrainH(x, z) + 0.42, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const S = 150;
  const sp = curve.getSpacedPoints(S);
  const hw = 1.15;
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= S; i++) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    const sx = -tan.z, sz = tan.x;
    pos.push(sp[i].x - sx * hw, sp[i].y, sp[i].z - sz * hw);
    pos.push(sp[i].x + sx * hw, sp[i].y, sp[i].z + sz * hw);
    uv.push(0, i * 0.35, 1, i * 0.35);
    if (i < S) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const walk = new THREE.Mesh(g, lit('#6c5340', { map: T.planks(), rough: 0.9, side: THREE.DoubleSide, emissive: '#120c07', ei: 0.5 }));
  walk.receiveShadow = true;
  grp.add(walk);
  // 桩与栏杆
  const postG = new THREE.CylinderGeometry(0.07, 0.07, 1.05, 5);
  const posts = new THREE.InstancedMesh(postG, lit('#5a4634', { rough: 0.85 }), Math.ceil(S / 4) * 2);
  const dum = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i <= S; i += 4) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    for (const s of [-1, 1]) {
      dum.position.set(sp[i].x - tan.z * hw * s, sp[i].y + 0.5, sp[i].z + tan.x * hw * s);
      dum.updateMatrix(); if (k < posts.count) posts.setMatrixAt(k++, dum.matrix);
    }
  }
  posts.count = k;
  grp.add(posts);
  // 栈道灯：矮柱上一只暖光。实例数必须先把点位算出来，多写一个就是一张读到脏显存的巨大贴片
  const lampGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const lampAt = [];
  for (let i = 7; i < S; i += 14) lampAt.push(i);
  const lamps = new THREE.InstancedMesh(lampGeo, glow('#ffc07a', 1.3), lampAt.length * 2);
  const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 5), lit('#3f3428', { rough: 0.8 }), lampAt.length * 2);
  let li = 0;
  for (const i of lampAt) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    for (const s of [-1, 1]) {
      const x = sp[i].x - tan.z * (hw + 0.35) * s, z = sp[i].z + tan.x * (hw + 0.35) * s;
      dum.rotation.set(0, 0, 0); dum.scale.setScalar(1);
      dum.position.set(x, sp[i].y + 1.75, z); dum.updateMatrix(); lamps.setMatrixAt(li, dum.matrix);
      dum.position.set(x, sp[i].y + 0.9, z); dum.updateMatrix(); sticks.setMatrixAt(li, dum.matrix);
      li++;
    }
  }
  lamps.count = sticks.count = li;
  grp.add(lamps, sticks);
  // 亭：栈道上的一处歇山顶
  const mid = sp[Math.floor(S * 0.45)];
  const pav = group();
  pav.position.copy(mid);
  pav.add(mesh([new THREE.CylinderGeometry(2.6, 2.9, 0.3, 8).translate(0, 0.15, 0)], lit('#8f959f', { map: T.stone('#7f8590'), rough: 0.9 })));
  const pil = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28;
    pil.push(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 8).translate(Math.cos(a) * 2.2, 1.9, Math.sin(a) * 2.2));
  }
  pav.add(mesh(pil, lit('#8a3a2c', { map: T.wood('#6d2a20', '#3a1109'), rough: 0.7 })));
  const hex = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.7, 6), M.roofGrey);
  hex.position.y = 4.2; hex.rotation.y = Math.PI / 6;
  pav.add(hex);
  pav.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), glow('#ffd39a', 1.3)).translateY(5.2));
  grp.add(pav);
  parent.add(grp);
  return { group: grp, curve };
}

/* ==================================================== 天鹅湖堤与镜湖岸 */
function shores(parent, anchors) {
  const grp = group();
  // 天鹅湖环堤：石笼 + 木栏杆，绕一圈
  const n = 64;
  const dum = new THREE.Object3D();
  const curb = new THREE.InstancedMesh(box(2.4, 0.7, 1.1, 0, 0, 0), lit('#7f8592', { map: T.stone('#6f7581'), rough: 0.92 }), n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28;
    const x = SWAN.x + Math.cos(a) * (SWAN.rx + 1.6);
    const z = SWAN.z + Math.sin(a) * (SWAN.rz + 1.6);
    dum.position.set(x, terrainH(x, z) + 0.1, z);
    dum.rotation.set(0, -a + Math.PI / 2, 0);
    dum.scale.set(1, 1, 1); dum.updateMatrix();
    curb.setMatrixAt(i, dum.matrix);
  }
  grp.add(curb);
  // 镜湖与骆马湖的西岸：一段压顶石 + 灯柱
  for (let z = -116; z < 124; z += 6) {
    const x = SHORE_X + 0.4;
    grp.add(mesh(box(2.2, 0.8, 5.6, x, terrainH(x, z) + 0.4, z), lit('#868c98', { map: T.stone('#767c88'), rough: 0.9 })));
  }
  const poleG = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.13, 5.2, 6).translate(0, 2.6, 0),
    new THREE.BoxGeometry(0.5, 0.16, 0.16).translate(0, 5.0, 0),
  ]);
  const poleCount = 30;
  const poles = new THREE.InstancedMesh(poleG, lit('#4a4238', { rough: 0.75 }), poleCount);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#ffd39a', 1.1), poleCount);
  let pi = 0;
  for (let i = 0; i < 17; i++) {
    const z = -110 + i * 14;
    const x = SHORE_X - 1.6;
    dum.position.set(x, terrainH(x, z), z); dum.rotation.set(0, 0, 0); dum.scale.setScalar(1);
    dum.updateMatrix(); poles.setMatrixAt(pi, dum.matrix);
    dum.position.set(x, terrainH(x, z) + 5.2, z); dum.updateMatrix(); bulbs.setMatrixAt(pi, dum.matrix);
    anchors.shoreLamps.push(new THREE.Vector3(x, 0, z));
    pi++;
  }
  for (let i = 0; i < 13; i++) {                    // 森林步道两侧
    const z = TRAIL.z1 + 4 + i * 5;
    for (const s of [-1, 1]) {
      if (pi >= poleCount) break;
      const x = TRAIL.x + s * (TRAIL.half - 0.6);
      dum.position.set(x, terrainH(x, z), z); dum.rotation.set(0, 0, 0); dum.scale.setScalar(1);
      dum.updateMatrix(); poles.setMatrixAt(pi, dum.matrix);
      dum.position.set(x, terrainH(x, z) + 5.2, z); dum.updateMatrix(); bulbs.setMatrixAt(pi, dum.matrix);
      pi++;
    }
  }
  poles.count = bulbs.count = pi;
  grp.add(poles, bulbs);
  parent.add(grp);
  return grp;
}

/* ==================================================== 小火车轨道 */
function railway(parent, pts) {
  const grp = group();
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, terrainH(x, z) + 0.18, z)), true, 'catmullrom', 0.5);
  const S = 240;
  const sp = curve.getSpacedPoints(S);
  const railGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
  const rails = new THREE.InstancedMesh(railGeo, lit('#9aa1ad', { rough: 0.4, metal: 0.7 }), S * 2);
  const ties = new THREE.InstancedMesh(box(2.4, 0.16, 0.34, 0, 0, 0), lit('#4a3a2b', { map: T.wood('#3a2c20', '#1c130c'), rough: 0.9 }), S);
  const dum = new THREE.Object3D();
  for (let i = 0; i < S; i++) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    const sx = -tan.z, sz = tan.x;
    const yaw = Math.atan2(tan.x, tan.z);
    for (const s of [-1, 1]) {
      dum.position.set(sp[i].x + sx * 0.72 * s, sp[i].y, sp[i].z + sz * 0.72 * s);
      dum.rotation.set(0, yaw, 0); dum.scale.set(1, 1, 1); dum.updateMatrix();
      rails.setMatrixAt(i * 2 + (s < 0 ? 0 : 1), dum.matrix);
    }
    dum.position.set(sp[i].x, sp[i].y - 0.1, sp[i].z);
    dum.rotation.set(0, yaw, 0); dum.updateMatrix();
    ties.setMatrixAt(i, dum.matrix);
  }
  rails.count = S * 2; ties.count = S;
  grp.add(rails, ties);
  // 站台
  const st = sp[Math.floor(S * 0.03)];
  grp.add(mesh(box(9, 0.9, 3.4, st.x, st.y - 0.2, st.z), lit('#8f959f', { map: T.stone('#7f8590'), rough: 0.9 })));
  const canopy = new THREE.Mesh(chineseRoof({ width: 9, depth: 3.6, height: 1.3, ridgeRatio: 0.42, curve: 0.7, eaveLift: 0.5, overhang: 0.5, segU: 18, segV: 10 }), M.roofGrey);
  canopy.position.set(st.x, st.y + 3.2, st.z);
  canopy.rotation.y = Math.PI / 2;
  grp.add(canopy);
  for (const s of [-1, 1]) {
    grp.add(mesh(pillarGeo(3.2, 0.14), lit('#7d211f', { map: T.wood('#5e1a17', '#2c0a08'), rough: 0.7 }))
      .translateX(st.x + s * 3.6).translateY(st.y).translateZ(st.z));
  }
  const sign = plaqueMesh('三台山站', 2.8, 0.9, { bg: '#1b3a2e' });
  sign.position.set(st.x, st.y + 3.4, st.z + 1.9);
  grp.add(sign);
  parent.add(grp);
  return { group: grp, curve };
}

/* ==================================================== 花信铃架（在塔顶） */
function chimeFrame(parent) {
  const grp = group();
  const y = LAYOUT.tower.top - 3.4;
  grp.position.set(TOWER.x, y, TOWER.z);
  const frame = [];
  for (const s of [-1, 1]) frame.push(box(0.3, 3.2, 0.3, s * 2.6, 1.6, 0));
  frame.push(box(5.8, 0.3, 0.3, 0, 3.2, 0));
  grp.add(mesh(frame, lit('#5a3f28', { map: T.wood('#46301e', '#20130a'), rough: 0.8 })));
  const bells = [];
  for (let i = 0; i < 12; i++) {
    const b = mesh(new THREE.ConeGeometry(0.3, 0.72, 8, 1, true), M.bronze);
    b.position.set(-2.3 + (i % 6) * 0.92, i < 6 ? 2.5 : 1.7, (i < 6 ? -0.5 : 0.5));
    b.rotation.x = Math.PI;
    grp.add(b);
    bells.push(b);
  }
  const pivot = group();
  const clapper = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), lit('#3a2a1c', { rough: 0.8 }));
  clapper.position.y = -1.3;
  const head = mesh(new THREE.SphereGeometry(0.26, 10, 8), lit('#b8453a', { rough: 0.6 }));
  head.position.y = -2.5;
  pivot.add(clapper, head);
  pivot.position.set(0, 3.1, 0.55);
  grp.add(pivot);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), glow('#ffe0a8', 3.2));
  flash.visible = false;
  flash.position.set(0, 2.2, 0);
  grp.add(flash);
  LAYOUT.chime.pos.set(TOWER.x, y + 2.2, TOWER.z);
  LAYOUT.chime.pivot = pivot;
  LAYOUT.chime.bells = bells.concat(LAYOUT.chime.bells);
  parent.add(grp);
  return { group: grp, pivot, flash, bells };
}

/* ==================================================== 装配 */
export function buildQuarter(scene) {
  const root = group();
  root.name = 'quarter';
  const anchors = {
    deck: [], shoreLamps: [], trailLamps: [], stringEnds: [], crowdPaths: [],
    swan: [], platform: [], towerTop: new THREE.Vector3(), berth: [], station: new THREE.Vector3(),
    fieldEdge: [], pearPath: [],
  };
  const bridge = skyBridge(root);
  anchors.deck = bridge.deck.map((f) => f.p.clone());
  const tower = pagoda(root);
  gateway(root);
  const walk = boardwalk(root);
  shores(root, anchors);
  const railPts = [[30, 150], [18, 132], [2, 124], [-16, 128], [-30, 118], [-34, 98], [-24, 84], [-4, 82], [18, 90], [28, 108]];
  const rail = railway(root, railPts);
  const chime = chimeFrame(root);

  anchors.towerTop.copy(LAYOUT.chime.pos);
  anchors.crowdPaths.push(anchors.deck.filter((_, i) => i % 6 === 0));
  anchors.crowdPaths.push(walk.curve.getSpacedPoints(40));
  anchors.crowdPaths.push(rail.curve.getSpacedPoints(48));
  for (let i = 0; i < 16; i++) {                     // 步道路口的灯串端点
    const z = TRAIL.z1 + i * 4.4;
    anchors.stringEnds.push([
      new THREE.Vector3(TRAIL.x - TRAIL.half + 0.6, terrainH(TRAIL.x - TRAIL.half, z) + 5.0, z),
      new THREE.Vector3(TRAIL.x + TRAIL.half - 0.6, terrainH(TRAIL.x + TRAIL.half, z) + 5.0, z),
    ]);
  }
  for (let i = 0; i < 10; i++) {                     // 镜湖岸上
    const z = -96 + i * 20;
    anchors.stringEnds.push([
      new THREE.Vector3(SHORE_X - 1.4, terrainH(SHORE_X, z) + 5.1, z),
      new THREE.Vector3(SHORE_X - 1.4, terrainH(SHORE_X, z + 20) + 5.1, z + 20),
    ]);
  }
  for (let i = 0; i < 26; i++) {                     // 梨园里拉在树间
    const a = (i / 26) * 6.28;
    const x1 = PEAR.x + Math.cos(a) * 15, z1 = PEAR.z + Math.sin(a) * 11;
    const x2 = PEAR.x + Math.cos(a + 1.1) * 21, z2 = PEAR.z + Math.sin(a + 1.1) * 16;
    anchors.stringEnds.push([
      new THREE.Vector3(x1, terrainH(x1, z1) + 4.6, z1),
      new THREE.Vector3(x2, terrainH(x2, z2) + 4.4, z2),
    ]);
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * 6.28;
    anchors.swan.push(new THREE.Vector3(SWAN.x + Math.cos(a) * SWAN.rx * 0.72, SWAN.y, SWAN.z + Math.sin(a) * SWAN.rz * 0.72));
  }
  anchors.berth = [[30, 150], [18, 132]].map(([x, z]) => new THREE.Vector3(x, terrainH(x, z) + 0.4, z));
  anchors.station.set(30, terrainH(30, 150) + 0.4, 150);
  anchors.platform = [bridge.frames[Math.round(0.34 * bridge.frames.length)].p.clone(), bridge.frames[Math.round(0.72 * bridge.frames.length)].p.clone()];
  for (let i = 0; i < 60; i++) {
    const x = -44 + (i % 12) * 7.4, z = -108 + Math.floor(i / 12) * 40;
    anchors.fieldEdge.push(new THREE.Vector3(x, terrainH(x, z), z));
  }
  LAYOUT.car.door.set(30, terrainH(30, 150) + 1.9, 150);

  scene.add(root);
  return { group: root, anchors, bridges: [bridge, walk], fengqiao: bridge, tower, rail, chime, setStrip: bridge.setStrip };
}
