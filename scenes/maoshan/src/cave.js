/**
 * 华阳洞与"第八洞天"剖视。
 *
 * 可考的只有洞口与崖：洞在老虎岗西北坡林间山岩之下、北距印宫约三百米，仙人洞与之相连；
 * 崖上唐至清摩崖石刻早期二十多方、后世数十方，洞口"华阳洞"榜书传为苏轼书、字一米见方，
 * 清康熙御批"第八洞天"，江苏省文物保护单位。洞深旧志称"数百里"或"三里"，皆无实测——
 * 所以剖视里的洞室尺度纯是写意，只为把"洞天"这个说法画出来，帮助面板已注明。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, lit, mesh, box, glow, rand, rr, registerOccluder } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import * as T from './textures.js';
import { HUAYANG, FOOT_Y } from './data.js';
import { padTop, heightAt } from './relief.js';

const scaled = (geo, sx, sy, sz, x = 0, y = 0, z = 0) => {
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return geo;
};

/** 洞口外的崖壁：一大块斜岩 + 榜书与诸方石刻 */
function cliffFace(site) {
  const g = new THREE.Group();
  const rock = lit('#8a9099', { map: T.strata(), rough: 0.95, side: THREE.DoubleSide, emissive: '#0b0f14', ei: 0.32 });
  // 三块叠着的崖石，前面留出洞口
  for (let i = 0; i < 3; i++) {
    const s = 9 + i * 3.4;
    const blob = scaled(new THREE.IcosahedronGeometry(s, 2), 1.5, 0.9, 0.75,
      (i - 1) * 7, 2.5 + i * 5.2, -5.5 - i * 2.4);
    const p = blob.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const j = 0.86 + 0.3 * Math.abs(Math.sin(p.getX(k) * 0.4 + p.getY(k) * 0.3 + i));
      p.setXYZ(k, p.getX(k) * j, p.getY(k) * j, p.getZ(k) * j);
    }
    blob.computeVertexNormals();
    const m = new THREE.Mesh(blob, rock);
    g.add(m);
  }
  // 洞口：一个拱形黑口 + 口沿石
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(site.mouthW / 2, 18, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x05070c, fog: true }),
  );
  mouth.position.set(0, site.mouthH * 0.42, -3.1);
  g.add(mouth);
  const lintel = mesh(box(site.mouthW + 2.2, 1.1, 1.4, 0, site.mouthH * 0.9, -3.4), M.stoneDressed);
  g.add(lintel);
  // 榜书"华阳洞"：字一米见方（可考）
  const big = new THREE.Mesh(new THREE.PlaneGeometry(site.mouthW, 1.5),
    new THREE.MeshBasicMaterial({ map: TX.plaque('华阳洞', { dir: 'h', bg: '#00000000', fg: '#f2dcab' }), transparent: true, toneMapped: false }));
  big.position.set(0, site.mouthH * 1.06, -3.2);
  g.add(big);
  // 诸方摩崖石刻：可考的数目是"二十多方 + 后世数十方"，此处排 site.steles 方
  const words = ['第八洞天', '上清宗坛', '山中宰相', '华阳隐居', '唐至清', '宋黄佑题名', '明乔宇', '康熙御笔'];
  for (let i = 0; i < site.steles; i++) {
    const w = rr(1.1, 2.6), h = rr(0.7, 1.5);
    const x = -14 + (i % 7) * 4.4 + rr(-0.6, 0.6);
    const y = 2.4 + Math.floor(i / 7) * 2.1 + rr(-0.4, 0.4);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: TX.plaque(words[i % words.length], { dir: w > 2 ? 'h' : 'v', bg: '#1b1f26', fg: '#d9c9a4' }),
        toneMapped: false, transparent: true,
      }));
    face.position.set(x, y, -2.7 + rr(-0.2, 0.2));
    face.rotation.z = rr(-0.05, 0.05);
    g.add(face);
  }
  g.rotation.y = site.facing;
  return g;
}

/** 洞室：写意的洞天——穹顶、石钟乳、暗河一汪、崖上题刻发光 */
function chamber(site) {
  const c = site.chamber;
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    scaled(new THREE.SphereGeometry(1, 26, 18), c.rx, c.ry, c.rz, 0, 0, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#9a9282'), map: T.strata(), roughness: 0.96, metalness: 0,
      side: THREE.BackSide, emissive: new THREE.Color('#100d0a'), emissiveIntensity: 0.5,
    }),
  );
  g.add(shell);
  // 石钟乳与石笋
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.6) * c.rx * 0.82;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * (c.rz / c.rx);
    if (rand() > 0.42) {
      const len = 2.4 + rand() * 6.4;
      const stal = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rand() * 0.8, len, 7),
        lit('#b0a893', { rough: 0.85, emissive: '#1a1510', ei: 0.5 }));
      stal.position.set(x, c.ry * 0.86 - len / 2, z);
      g.add(stal);
    } else {
      const len = 1.6 + rand() * 4.6;
      const aggro = new THREE.Mesh(new THREE.ConeGeometry(0.6 + rand() * 1.1, len, 7),
        lit('#a89f8b', { rough: 0.88, emissive: '#1a1510', ei: 0.5 }));
      aggro.position.set(x, -c.ry * 0.82 + len / 2, z);
      g.add(aggro);
    }
  }
  // 暗河
  const pool = new THREE.Mesh(new THREE.CircleGeometry(c.rx * 0.52, 26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#0a1a22'), roughness: 0.18, metalness: 0.35, emissive: new THREE.Color('#08161c'), emissiveIntensity: 0.7 }));
  pool.geometry.rotateX(-Math.PI / 2);
  pool.position.y = -c.ry * 0.8;
  g.add(pool);
  // 洞壁题刻：洞天里也刻，随剖视一起亮
  const words = ['大洞真经', '真诰', '登真隐诀', '第八洞天', '第一福地', '华阳隐居', '三茅诰', '步虚'];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI * 0.72 + (i / 9) * Math.PI * 1.44;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5),
      new THREE.MeshBasicMaterial({ map: TX.plaque(words[i % words.length], { dir: 'h', bg: '#171b21', fg: '#f0d9a6' }), transparent: true, toneMapped: false }));
    face.position.set(Math.cos(a) * c.rx * 0.9, rr(-6, 8), Math.sin(a) * c.rz * 0.9);
    face.lookAt(new THREE.Vector3(0, face.position.y, 0));
    g.add(face);
  }
  // 洞口进来的一束天光（写意）
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 5.2, c.ry * 1.7, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#8ea6c8').multiplyScalar(0.5), transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  shaft.position.set(0, c.ry * 0.1, c.rz * 0.55);
  shaft.rotation.x = 0.5;
  g.add(shaft);
  g.position.set(site.x + c.dx, padTop(site.pad) + c.dy, site.z + c.dz);
  return { grp: g, pool, shell };
}

/* ------------------------------------------------------------------ 剖面 */
/**
 * 刀口所在竖直面上的断面：横向层理，洞室经过处留拱形缺口。
 * 每帧按 cutZ 重建一次顶点（两百来个顶点，成本可忽略）。
 */
function sectionGeo(cutZ, site) {
  const c = site.chamber;
  const cx = site.x + c.dx, cy = padTop(site.pad) + c.dy, cz = site.z + c.dz;
  // 刀口切进洞室的纵深范围时，断面要在洞室处留拱形缺口
  const onPlane = Math.abs(cz - cutZ) < c.rz * 1.05;
  const cols = [];
  for (let dx = -site.cutSpan; dx <= site.cutSpan; dx += 8) {
    const x = dx + site.x;
    const top = Math.max(heightAt(x, cutZ), FOOT_Y + 1);
    const bot = FOOT_Y - 26;
    let yBot = bot;
    if (onPlane) {
      const dxn = (x - cx) / c.rx;
      if (Math.abs(dxn) < 0.98) yBot = Math.max(bot, cy + c.ry * Math.sqrt(1 - dxn * dxn * 0.94) * 0.86);
    }
    if (top - yBot < 1.4) continue;
    cols.push({ x, top, yBot });
  }
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < cols.length; i++) {
    const k = i * 2;
    pos.push(cols[i].x, cols[i].top, cutZ, cols[i].x, cols[i].yBot, cutZ);
    uv.push(cols[i].x / 9, -cols[i].top / 9, cols[i].x / 9, -cols[i].yBot / 9);
    if (i === 0) continue;
    idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCave(scene, clippingPlanes) {
  const site = { ...HUAYANG, cutSpan: 150 };
  const y0 = padTop(site.pad);
  const cliff = cliffFace(site);
  cliff.position.set(site.x, y0 - 1.2, site.z + 6);
  scene.add(registerOccluder(cliff, 9, new THREE.Vector3(site.x, 0, site.z + 6)));

  const cav = chamber(site);
  cav.grp.visible = false;
  cav.grp.renderOrder = 3;
  scene.add(cav.grp);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8d8577'), map: T.strata(), roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide, emissive: new THREE.Color('#171310'), emissiveIntensity: 0.55,
  });
  mat.map = mat.map.clone();
  mat.map.repeat.set(0.1, 0.1);
  const section = new THREE.Mesh(sectionGeo(site.cutFrom, site), mat);
  section.visible = false;
  scene.add(section);

  // 洞口的长明灯与洞内冷光
  const mouthLamp = glow('#ffbe72', 1.5);
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mouthLamp);
    lamp.position.set(site.x + s * (site.mouthW / 2 + 1.1) * Math.cos(site.facing), y0 + 1.2, site.z + 6 - s * 1.2);
    scene.add(lamp);
  }
  const caveLight = new THREE.PointLight(0x9fd0ff, 2400, 130, 2);
  caveLight.position.set(site.x + site.chamber.dx, y0 + site.chamber.dy + 6, site.z + site.chamber.dz);
  caveLight.visible = false;
  scene.add(caveLight);

  return {
    cliff, chamber: cav.grp, pool: cav.pool, section, caveLight,
    /** 剖视进度 0→1：刀口从南面推进到洞室前缘，断面随之重建 */
    setCut(p, snap = false) {
      const from = site.cutFrom, to = site.cutTo;
      const z = from + (to - from) * p;
      this.cutZ = z;
      section.geometry.dispose();
      section.geometry = sectionGeo(z, site);
      section.visible = p > 0.01;
      cav.grp.visible = p > 0.06;
      caveLight.visible = p > 0.1;
      const k = Math.max(0, Math.min(1, (p - 0.06) / 0.5));
      caveLight.intensity = 2400 * k;
      // 山体与断面共用同一组 clippingPlanes：刀口以北保留
      clippingPlanes[0].normal.set(0, 0, -1);
      clippingPlanes[0].constant = z;
      cav.grp.traverse((o) => { if (o.material) o.material.clippingPlanes = null; });
      void snap;
    },
    cutZ: site.cutFrom,
    anchor: { x: site.x, y: y0 + 6, z: site.z + 6 },
  };
}
