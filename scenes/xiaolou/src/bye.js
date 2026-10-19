import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, glow, rand, rr, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { BYE, lanePoint, laneHW, centerZ } from './plan.js';

/**
 * 备弄：巷内一条百米窄弄，两侧高墙只留一线天。
 * 备弄是这一带大宅的通行说法（小娄巷有"最长的备弄"约百米【可考】），
 * 宽度 1.45 米、墙高 3.7 米为写意取值；弄内门洞、滴水、砖纹皆按常例补设。
 */

/** 折线展开：返回一串世界坐标的骨架点与每段的朝向 */
function skeleton() {
  let heading = 0; // 朝北（-Z）：forward = (sin h, -cos h)
  let px = 0, pz = 0;
  const segs = [];
  for (const leg of BYE.legs) {
    heading += leg.turn;
    const dx = Math.sin(heading) * leg.len;
    const dz = -Math.cos(heading) * leg.len;
    segs.push({
      x0: px, z0: pz, x1: px + dx, z1: pz + dz,
      len: leg.len, heading,
      cx: px + dx / 2, cz: pz + dz / 2,
    });
    px += dx; pz += dz;
  }
  return { segs, end: { x: px, z: pz } };
}

/** 弧长 s 处的世界点位（s 从巷口算起） */
export function byePoint(s) {
  const { segs } = byePoint.cache || (byePoint.cache = skeleton());
  let acc = 0;
  for (const g of segs) {
    if (s <= acc + g.len) {
      const t = (s - acc) / g.len;
      return {
        x: g.x0 + (g.x1 - g.x0) * t,
        z: g.z0 + (g.z1 - g.z0) * t,
        heading: g.heading,
        yaw: Math.PI / 2 - g.heading,
      };
    }
    acc += g.len;
  }
  const g = segs[segs.length - 1];
  return { x: g.x1, z: g.z1, heading: g.heading, yaw: Math.PI / 2 - g.heading };
}

/** 弄口的落位：挂在主巷北岸 */
function mouth() {
  const p = lanePoint(BYE.x, BYE.side * (laneHW(BYE.x) + 0.2));
  return { x: p.x, z: p.z };
}

function walls(segs) {
  const parts = [];
  const half = BYE.width / 2;
  for (const g of segs) {
    const len = g.len;
    const yaw = Math.PI / 2 - g.heading;
    for (const s of [-1, 1]) {
      const off = s * (half + 0.16);
      const mx = g.cx + Math.cos(g.heading) * off;
      const mz = g.cz + Math.sin(g.heading) * off;
      const h = BYE.wallH + rr(-0.12, 0.3);
      const b = box(len + 0.24, h, 0.4);
      b.rotateY(yaw);
      b.translate(mx, h / 2, mz);
      parts.push(b);
      const cap = box(len + 0.3, 0.2, 0.62);
      cap.rotateY(yaw);
      cap.translate(mx, h + 0.1, mz);
      parts.push(cap);
    }
  }
  return parts;
}

function floor(segs) {
  const parts = [];
  const half = BYE.width / 2 + 0.3;
  for (const g of segs) {
    const n = Math.max(2, Math.round(g.len / 1.1));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const px = g.x0 + (g.x1 - g.x0) * t;
      const pz = g.z0 + (g.z1 - g.z0) * t;
      const b = box(1.0, 0.1, half * 2);
      b.rotateY(Math.PI / 2 - g.heading);
      b.translate(px, 0.05, pz);
      parts.push(b);
    }
  }
  return parts;
}

export function buildBye(scene) {
  const group = new THREE.Group();
  group.name = 'bye';
  scene.add(group);
  const { segs, end } = skeleton();
  const m = mouth();

  // 把整条弄搬到巷口的位置上，起头与主巷北岸接上
  const holder = new THREE.Group();
  holder.position.set(m.x, 0, m.z);
  group.add(holder);

  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b3a992'), map: T.plaster('#9d927c'), roughness: 0.96,
    emissive: new THREE.Color('#12161f'), emissiveIntensity: 0.36,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8b93a4'), map: T.roofTiles('#333c52', '#47516b', '#70809e'), roughness: 0.76,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8e95a4'), map: T.stone('#7e8592'), roughness: 0.52, metalness: 0.08,
    emissive: new THREE.Color('#101726'), emissiveIntensity: 0.4,
  });

  holder.add((() => { const mesh = new THREE.Mesh(mergeGeometries(walls(segs)), wallMat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; })());
  holder.add((() => { const mesh = new THREE.Mesh(mergeGeometries(floor(segs)), floorMat); mesh.receiveShadow = true; return mesh; })());

  // 墙顶压瓦另做一批，暗色才压得住一线天
  const capParts = [];
  const half = BYE.width / 2;
  for (const g of segs) {
    for (const s of [-1, 1]) {
      const off = s * (half + 0.16);
      const mx = g.cx + Math.cos(g.heading) * off;
      const mz = g.cz + Math.sin(g.heading) * off;
      const cap = box(g.len + 0.34, 0.16, 0.7);
      cap.rotateY(Math.PI / 2 - g.heading);
      cap.translate(mx, BYE.wallH + 0.22, mz);
      capParts.push(cap);
    }
  }
  holder.add(new THREE.Mesh(mergeGeometries(capParts), capMat));

  // 弄内的门、门灯、滴水石与一线天漏下的月
  const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4e3324'), map: T.wood('#412a1d', '#241710'), roughness: 0.8 });
  for (const d of BYE.doors) {
    const pt = byePoint(d.s);
    const inward = d.side > 0 ? 1 : -1;
    const nx = Math.cos(pt.heading) * inward, nz = Math.sin(pt.heading) * inward;
    const g = new THREE.Group();
    // holder 已经落在巷口，这里一律用弄内局部坐标
    g.position.set(pt.x + nx * (half + 0.02), 0, pt.z + nz * (half + 0.02));
    g.rotation.y = Math.PI / 2 - pt.heading + (inward > 0 ? 0 : Math.PI);
    g.add(new THREE.Mesh(box(1.05, 2.3, 0.12, 0, 1.15, 0), woodMat));
    g.add(new THREE.Mesh(box(1.3, 0.24, 0.3, 0, 2.36, 0.06), capMat));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), glow('#ffc885', 2.2));
    bulb.position.set(0.72, 2.1, 0.3);
    g.add(bulb);
    holder.add(g);
    registerOccluder(g, 0.9, new THREE.Vector3(pt.x + m.x, 1.2, pt.z + m.z));
  }

  // 弄口：一对石鼓 + 一方"备弄"砖额
  const mouthGrp = new THREE.Group();
  mouthGrp.position.set(m.x, 0, m.z);
  mouthGrp.rotation.y = -Math.atan((centerZ(BYE.x + 1) - centerZ(BYE.x - 1)) / 2);
  const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color('#868d9b'), map: T.stone('#757c8a'), roughness: 0.86 });
  for (const s of [-1, 1]) {
    mouthGrp.add(new THREE.Mesh(box(0.5, 0.62, 0.5, s * 1.15, 0.31, -0.1), stone));
  }
  const lintel = new THREE.Mesh(box(2.9, 0.5, 0.42, 0, 3.15, -0.05), stone);
  mouthGrp.add(lintel);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.4),
    new THREE.MeshBasicMaterial({ map: T.plaque('备弄', { dir: 'h', bg: '#1d2536', fg: '#e9dcbe', border: '#98a2b2' }), toneMapped: false }));
  plate.position.set(0, 3.15, 0.18);
  mouthGrp.add(plate);
  const wash = new THREE.SpotLight(new THREE.Color('#ffd9a4'), 7, 6, 0.6, 0.6, 1.7);
  wash.position.set(0, 2.2, 1.2);
  wash.target.position.set(0, 3.15, 0.1);
  mouthGrp.add(wash, wash.target);
  group.add(mouthGrp);

  // 一线天：弄顶之上开一条发光带，月从那里落进来
  const sky = [];
  for (const g of segs) {
    const beam = box(g.len * 0.7, 0.05, 0.5);
    beam.rotateY(Math.PI / 2 - g.heading);
    beam.translate(g.cx, BYE.wallH + 0.4, g.cz);
    sky.push(beam);
  }
  const beamMesh = new THREE.Mesh(mergeGeometries(sky), glow('#cfe0ff', 0.9));
  holder.add(beamMesh);

  // 弄底的灯串：隔二十来米一盏，把砖墙刷出暖调
  const lamps = [];
  for (let s = 12; s < BYE.legs.reduce((a, l) => a + l.len, 0) - 6; s += 27) {
    const pt = byePoint(s);
    const light = new THREE.PointLight(new THREE.Color('#ff9f57'), 9.5, 15, 2.1);
    light.position.set(pt.x, 2.5, pt.z);
    holder.add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#ffbe72', 2.4));
    bulb.position.copy(light.position);
    holder.add(bulb);
    lamps.push(light);
  }

  // 一线天漏下的月：弄底中线一条冷白带，两侧墙脚仍是黑的
  const slit = [];
  for (const g of segs) {
    const n = Math.max(2, Math.round(g.len / 1.2));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const b = box(1.1, 0.04, 0.36);
      b.rotateY(Math.PI / 2 - g.heading);
      b.translate(g.x0 + (g.x1 - g.x0) * t, 0.18, g.z0 + (g.z1 - g.z0) * t);
      slit.push(b);
    }
  }
  holder.add(new THREE.Mesh(mergeGeometries(slit), glow('#cfe0ff', 0.85)));

  return {
    group, holder, lamps, mouth: m, end,
    totalLen: BYE.legs.reduce((a, l) => a + l.len, 0),
    point: (s) => {
      const pt = byePoint(s);
      return { x: pt.x + m.x, z: pt.z + m.z, yaw: pt.yaw };
    },
  };
}

export const BYE_LEN = BYE.legs.reduce((a, l) => a + l.len, 0);
