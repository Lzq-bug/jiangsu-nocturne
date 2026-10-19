/**
 * 海春轩塔本体：七层八角砖塔，密檐叠涩，无台基无副阶。
 * 另外管两件事——48 座圭形龛的逐层点灯，和"无基塔解剖"的半剖。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, PAL, mesh, box, octBody, steppedEave, octFaceAngles, octCourse, guiGeo } from './kit.js';
import { PAGODA, SITE, TIER_LIGHT } from './data.js';
import * as T from './textures.js';

const IN = Math.cos(Math.PI / 8);   // 八角的面心距 / 外接圆半径

/** 一层的檐高：菱角牙子 + 五层挑砖 + 檐面压边砖 */
const eaveH = (t) => (t.tooth ? 0.24 : 0) + t.eave.courses * t.eave.rise + 0.08;

/* ------------------------------------------------------------------ 塔身 */

function shellGeometries() {
  const bodies = [];
  const eaves = [];
  let y = 0;
  PAGODA.tiers.forEach((t, i) => {
    bodies.push(octBody({ rBottom: t.rBottom, rTop: t.rTop, height: t.body, rot: SITE.pagoda.rot, y }));
    // 层间一道素砖腰线，是宋塔壁面上最常见的水平分割
    bodies.push(octCourse({ r: t.rBottom + 0.03, bevel: -0.04, height: 0.1, rot: SITE.pagoda.rot, y: y + t.body - 0.12 }));
    y += t.body;
    if (!t.eave) return;
    eaves.push(steppedEave({
      rWall: t.rTop,
      courses: t.eave.courses,
      rise: t.eave.rise,
      projection: t.eave.projection,
      twist: PAGODA.twist * (i + 1),
      rot: SITE.pagoda.rot,
      tooth: t.tooth,
    }));
    y += eaveH(t);
  });
  return { bodies: mergeGeometries(bodies), eaves: mergeGeometries(eaves), top: y };
}

/** 底层辟门：面向西北的那一面开券门通塔心，其余七面素砖（龛排在二至七层，合 48 座） */
function groundDoor(rot) {
  const t = PAGODA.tiers[0];
  const a = rot + Math.PI / 8;          // 面心方向，本塔取朝西北的那一面
  const inR = t.rBottom * IN;
  const door = guiGeo({ width: 1.05, height: 1.62, depth: 0.34, tip: 0.24 });
  door.translate(0, 0, -0.17);
  const frame = guiGeo({ width: 1.32, height: 1.86, depth: 0.1, tip: 0.24 });
  frame.translate(0, 0, 0.02);
  const g = mergeGeometries([door, frame]);
  g.rotateY(a);
  g.translate(Math.sin(a) * (inR - 0.02), 0.02, Math.cos(a) * (inR - 0.02));
  return g;
}

/* ------------------------------------------------------------------ 48 龛 */

function nicheBuddhaGeo(s = 1) {
  const parts = [];
  const throne = new THREE.CylinderGeometry(0.1 * s, 0.12 * s, 0.05 * s, 9);
  throne.translate(0, 0.03 * s, 0);
  parts.push(throne);
  const body = new THREE.CylinderGeometry(0.055 * s, 0.085 * s, 0.19 * s, 9);
  body.translate(0, 0.16 * s, 0);
  parts.push(body);
  const head = new THREE.SphereGeometry(0.05 * s, 8, 6);
  head.translate(0, 0.3 * s, 0);
  parts.push(head);
  return mergeGeometries(parts);
}

/** 龛位表：{ tier, face, angle, y, matrix } —— 点灯与剖切都按这份表来 */
function nicheLayout(rot) {
  const out = [];
  let y = 0;
  PAGODA.tiers.forEach((t, ti) => {
    const bodyY = y;
    y += t.body;
    if (t.niche) {
      const cy = bodyY + t.body * 0.46;
      // 壁面在这一高度上的半径（塔身有收分）
      const f = (cy - bodyY) / t.body;
      const d = (t.rBottom + (t.rTop - t.rBottom) * f) * IN;
      octFaceAngles(rot).forEach((a, k) => {
        const m = new THREE.Matrix4();
        m.makeRotationY(a);
        m.setPosition(Math.sin(a) * (d + 0.03), cy, Math.cos(a) * (d + 0.03));
        out.push({ tier: ti, face: k, angle: a, y: cy, matrix: m });
      });
    }
    if (t.eave) y += eaveH(t);
  });
  return out;
}

/* ------------------------------------------------------------------ 塔刹 */

/** 铁覆盆 + 相轮 + 铜葫芦：2004 年加固时换过残破的铁覆盆，铜葫芦仍在 */
function finial(top) {
  const grp = new THREE.Group();
  const f = PAGODA.finial;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(f.bowl * 1.05, f.bowl * 1.2, 0.1, 14), M.iron);
  disc.position.y = top + 0.05;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(f.bowl, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.iron);
  bowl.rotation.x = Math.PI;
  bowl.position.y = top + f.bowl * 0.4;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, f.shaft, 9), M.iron);
  shaft.position.y = top + f.bowl * 0.6 + f.shaft / 2;
  grp.add(disc, bowl, shaft);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.19 - i * 0.035, 0.03, 6, 16), M.iron);
    r.rotation.x = Math.PI / 2;
    r.position.y = top + f.bowl * 0.72 + i * 0.18;
    grp.add(r);
  }
  const gy = top + f.bowl * 0.6 + f.shaft + f.gourd * 0.34;
  const lower = new THREE.Mesh(new THREE.SphereGeometry(f.gourd * 0.42, 14, 11), M.copper);
  lower.scale.set(1, 0.95, 1);
  lower.position.y = gy;
  const upper = new THREE.Mesh(new THREE.SphereGeometry(f.gourd * 0.3, 13, 10), M.copper);
  upper.position.y = gy + f.gourd * 0.4;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 8), M.copper);
  tip.position.y = gy + f.gourd * 0.74;
  grp.add(lower, upper, tip);
  // 葫芦是夜里全塔最高的一点光
  const shine = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,196,120', 0.16), transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  shine.material.toneMapped = false;
  shine.scale.setScalar(2.4);
  shine.position.y = gy + f.gourd * 0.3;
  grp.add(shine);
  return { group: grp, shine, top: gy + f.gourd * 0.74 + 0.13 };
}

/* ------------------------------------------------------------------ 解剖 */

function noteSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,14,24,0.68)';
  x.beginPath(); x.roundRect(10, 18, 492, 62, 14); x.fill();
  x.strokeStyle = 'rgba(214,186,132,0.72)'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#f4e2c4';
  x.font = '600 38px "KaiTi","STKaiti","Songti SC",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, sizeAttenuation: false });
  m.toneMapped = false;
  const s = new THREE.Sprite(m);
  s.scale.set(0.2, 0.038, 1);
  s.renderOrder = 22;
  return s;
}

/** 内层砌体、层间叠砖楼板痕、第七层十字铁梁，以及塔脚下没有台基的泥地层 */
function innerStructure() {
  const grp = new THREE.Group();
  const cores = [];
  let y = 0;
  for (const t of PAGODA.tiers) {
    cores.push(octBody({ rBottom: t.rBottom - 0.62, rTop: t.rTop - 0.62, height: t.body, rot: SITE.pagoda.rot, y }));
    cores.push(octCourse({ r: t.rBottom - 0.5, bevel: -0.05, height: 0.09, rot: SITE.pagoda.rot, y: y + t.body * 0.42 }));
    y += t.body;
    if (t.eave) y += eaveH(t);
  }
  grp.add(mesh(mergeGeometries(cores), M.brickInner));

  const t7 = PAGODA.tiers[6];
  const beamY = y - t7.body * 0.5;
  const r = t7.rBottom - 0.5;
  grp.add(mesh([box(r * 1.7, 0.14, 0.14, 0, beamY, 0), box(0.14, 0.14, r * 1.7, 0, beamY, 0)], M.iron));
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, t7.body * 0.86, 10), M.iron);
  post.position.y = beamY + t7.body * 0.4;
  grp.add(post);

  // 无台基：砖直接砌在潮滩淤泥土上，下面是一层三合土找平
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 5.4, 3.4, 8), M.silt);
  ground.rotation.y = SITE.pagoda.rot + Math.PI / 8;
  ground.position.y = -1.7;
  const lime = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.22, 8), M.stoneDark);
  lime.rotation.y = SITE.pagoda.rot + Math.PI / 8;
  lime.position.y = -0.16;
  grp.add(ground, lime);
  return { group: grp, masonryTop: y, beamY, groundY: -1.5 };
}

/* ------------------------------------------------------------------ 组装 */

export function buildPagoda(scene, columns) {
  const shell = shellGeometries();
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const clippedMats = [];
  const clip = (mat) => {
    const m = mat.clone();
    m.clippingPlanes = [];
    clippedMats.push(m);
    return m;
  };

  const group = new THREE.Group();
  group.position.set(SITE.pagoda.x, SITE.yardY, SITE.pagoda.z);

  const body = mesh(shell.bodies, clip(M.brick));
  body.castShadow = true;
  body.receiveShadow = true;
  const eave = mesh(shell.eaves, clip(M.brickEave));
  eave.castShadow = true;
  eave.receiveShadow = true;
  const door = mesh(groundDoor(SITE.pagoda.rot), clip(M.niche));
  const doorFace = SITE.pagoda.rot + Math.PI / 8;
  const dIn = PAGODA.tiers[0].rBottom * IN;
  const pit = mesh(box(1.0, 1.5, 0.2, 0, 0.85, -0.6), M.dark);
  pit.position.set(Math.sin(doorFace) * (dIn - 0.35), 0.85, Math.cos(doorFace) * (dIn - 0.35));
  pit.rotation.y = doorFace;
  group.add(body, eave, door, pit);

  const fin = finial(shell.top);
  group.add(fin.group);

  /* ------------------------------------------------------------ 48 龛 */
  const spots = nicheLayout(SITE.pagoda.rot);
  const panels = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.98), clip(M.niche), spots.length);
  const buddha = new THREE.InstancedMesh(nicheBuddhaGeo(1), clip(M.gilt), spots.length);
  const lampMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,206,140', 0.2), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  });
  lampMat.clippingPlanes = [];
  clippedMats.push(lampMat);
  const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.2, 10), lampMat, spots.length);
  lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3).fill(0), 3);
  spots.forEach((sp, i) => {
    panels.setMatrixAt(i, sp.matrix);
    buddha.setMatrixAt(i, sp.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.34, 0.09)));
    lamps.setMatrixAt(i, sp.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.06, 0.13)));
  });
  [panels, buddha, lamps].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    group.add(m);
  });
  lamps.renderOrder = 5;

  /* ------------------------------------------------------------ 解剖 */
  const inner = innerStructure();
  inner.group.visible = false;
  group.add(inner.group);
  const notes = [
    { text: '淤泥土层 · 无台基无副阶', at: [0, inner.groundY, dIn * 1.1] },
    { text: '内外双层砌体', at: [dIn * 1.15, shell.top * 0.42, 0] },
    { text: '第七层十字铁梁', at: [dIn * 1.1, inner.beamY, 0] },
    { text: '叠砖楼板痕 · 原可攀登', at: [-dIn * 1.05, shell.top * 0.66, 0] },
  ].map((n) => {
    const s = noteSprite(n.text);
    s.position.set(...n.at);
    s.visible = false;
    group.add(s);
    return s;
  });

  /* ------------------------------------------------------------ 龛灯 */
  const byTier = PAGODA.tiers.map((_, ti) => spots.filter((s) => s.tier === ti));
  const lit = new Float32Array(spots.length);
  const want = new Float32Array(spots.length);
  let litTiers = 0;
  const col = new THREE.Color();
  const waterShallow = columns.add(new THREE.Vector3(SITE.pagoda.x + 3.4, 0, SITE.pagoda.z), PAL.lanternWarm, 3.4, 15, 0);
  const waterDeep = columns.add(new THREE.Vector3(SITE.pagoda.x, 0, SITE.pagoda.z - 2.4), PAL.lampGlow, 2.2, 24, 0);
  const shineBase = fin.shine.material.opacity;

  const apply = () => {
    for (let i = 0; i < spots.length; i++) want[i] = spots[i].tier <= litTiers ? 1 : 0;
  };

  const api = {
    group,
    spots,
    clippedMats,
    masonryTop: shell.top,
    finialTop: fin.top,
    totalHeight: fin.top,
    tierCount: 0,
    get tierCountValue() { return litTiers; },
    get litCount() { return litTiers * TIER_LIGHT.perTier; },
    get glowLevel() { return Math.min(1, litTiers / PAGODA.nicheTiers); },
    /** 点亮下一层（底层无龛，从第二层起） */
    lightTier() {
      if (litTiers < PAGODA.nicheTiers) litTiers++;
      apply();
      return litTiers;
    },
    lightAll() {
      litTiers = PAGODA.nicheTiers;
      apply();
      return litTiers;
    },
    clear() {
      litTiers = 0;
      apply();
      return 0;
    },
    setAnatomy(on) {
      api.anatomy = on;
      inner.group.visible = on;
      notes.forEach((n) => { n.visible = on; });
      for (const m of clippedMats) m.clippingPlanes = on ? [plane] : [];
    },
    anatomy: false,
    /** 剖刀朝向角（度）：切掉朝向这一侧的半个塔身 */
    setCut(deg) {
      const a = THREE.MathUtils.degToRad(deg);
      plane.normal.set(Math.sin(a), 0, Math.cos(a));
      plane.constant = 0;
    },
    update(t, dt) {
      let any = false;
      for (let i = 0; i < spots.length; i++) {
        if (Math.abs(want[i] - lit[i]) < 0.002) continue;
        any = true;
        const dir = Math.sign(want[i] - lit[i]);
        // 同层里按面序错开，像有人举着火把绕塔走了一圈
        const stagger = 1 - (spots[i].face / 8) * 0.5;
        lit[i] = THREE.MathUtils.clamp(lit[i] + dir * dt * 2.2 * stagger, 0, 1);
      }
      if (any || litTiers > 0) {
        for (let i = 0; i < spots.length; i++) {
          const flick = 0.86 + 0.14 * Math.sin(t * 2.6 + i * 1.7) + 0.05 * Math.sin(t * 7.3 + i);
          col.set(TIER_LIGHT.warm).multiplyScalar(lit[i] * 2.1 * flick);
          lamps.setColorAt(i, col);
        }
        lamps.instanceColor.needsUpdate = true;
      }
      const g = api.glowLevel;
      columns.setOn(waterShallow, g > 0.02);
      columns.setOn(waterDeep, g > 0.02);
      fin.shine.material.opacity = shineBase * (0.45 + 0.95 * g);
      fin.shine.scale.setScalar(2.0 + 3.6 * g);
    },
  };
  scene.add(group);
  return api;
}
