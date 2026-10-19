/**
 * 玉兰灯：公路桥 150 对，每座约 8 米高，每柱 5 朵花（档案馆与美篇同数）。
 * 灯柱间距无记载，按 150 对均铺在 4589 米公路桥上取约 30.6 米（推算）。
 *
 * 发光一律走 MeshBasicMaterial + instanceColor，不给每盏灯配真实光源——
 * 300 盏灯的点光会把着色器与帧预算一起拖死。
 */
import * as THREE from 'three';
import { APPROACH, GIRDER, LAMP, RIVER, roadY } from './data.js';
import { M, mesh, box, cyl } from './kit.js';
import * as T from './textures.js';

const { x: LX, h: LH, flowers, pairs } = LAMP;
const RAIL = 0.14;              // 人行道阶顶（见 bridge.js 的 upperDeck）

/** 每对灯的 z（自南而北排，齐明也按这个次序走） */
export const LAMP_Z = (() => {
  const out = [];
  for (let i = 0; i < pairs; i++) out.push(APPROACH.southEnd - (i + 0.5) * LAMP.step);
  return out;
})();

/** 第 i 盏在"齐明"进度 g 下的亮度：波前自南而北，逐盏爬升 */
export function lampOn(i, g) {
  const front = g * (pairs + 10);
  return Math.min(1, Math.max(0, (front - i) / 5));
}

export function buildLamps(scene, columns) {
  const root = new THREE.Group();
  root.name = 'lamps';

  const n = pairs * 2;
  const poleGeo = new THREE.CylinderGeometry(0.17, 0.3, LH, 8, 1, false);
  poleGeo.translate(0, LH / 2, 0);
  const poleMat = M.concrete;
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
  poles.name = 'lamp-poles';

  // 灯架：顶端一道横挑 + 一段束口
  const yokeGeo = new THREE.BoxGeometry(2.2, 0.2, 0.2);
  const yokes = new THREE.InstancedMesh(yokeGeo, poleMat, n);
  yokes.name = 'lamp-yokes';

  // 5 朵玉兰花为一组，每朵一个球
  const globeGeo = new THREE.SphereGeometry(0.32, 10, 8);
  const globeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const globes = new THREE.InstancedMesh(globeGeo, globeMat, n * flowers);
  globes.name = 'lamp-globes';

  const d = new THREE.Object3D();
  const colIndex = [];
  const colOf = new Map();
  let gi = 0;
  LAMP_Z.forEach((z, i) => {
    const y0 = roadY(z) + RAIL;
    for (const side of [-1, 1]) {
      const p = i * 2 + (side > 0 ? 1 : 0);
      const x = side * LX;
      d.position.set(x, y0, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      poles.setMatrixAt(p, d.matrix);
      d.position.set(x, y0 + LH - 0.1, z);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      yokes.setMatrixAt(p, d.matrix);
      // 花：一盏在顶，四朵分列两侧
      for (let k = 0; k < flowers; k++) {
        const t = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * (0.55 + (k > 2 ? 0.75 : 0));
        d.position.set(x + t * 0.88, y0 + LH + (k === 0 ? 0.42 : 0.02), z + (k > 2 ? side * 0.26 : 0));
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(k === 0 ? 1.15 : 1.0);
        d.updateMatrix();
        globes.setMatrixAt(gi, d.matrix);
        gi++;
      }
      // 只有正桥那段在水上，才在江里拖一道光柱
      if (Math.abs(z) < RIVER.waterHalf - 20) {
        const c = columns.add(new THREE.Vector3(x, 0, z), '#ffd9a8', 2.1, 19, 1.35);
        colIndex.push(c);
        colOf.set(p, c);
      }
    }
  });
  poles.instanceMatrix.needsUpdate = true;
  yokes.instanceMatrix.needsUpdate = true;
  globes.instanceMatrix.needsUpdate = true;
  globes.count = gi;

  /* 灯下那一片光：加性贴地平片。桥面靠它读出"灯照得着的地方"，
     而不是给每盏灯挂一盏真实光源——300 盏点光会把整场拖死。 */
  const poolGeo = new THREE.PlaneGeometry(9.5, 9.5).rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,212,158', 0.05), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false, opacity: 0.85,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
  pools.name = 'lamp-pools';
  pools.renderOrder = 6;
  let pi = 0;
  LAMP_Z.forEach((z, i) => {
    const y0 = roadY(z) + 0.2;
    for (const side of [-1, 1]) {
      d.position.set(side * (LX - 1.3), y0, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      pools.setMatrixAt(pi++, d.matrix);
    }
  });
  pools.count = pi;
  pools.instanceMatrix.needsUpdate = true;

  root.add(poles, yokes, globes, pools);
  scene.add(root);

  const colList = [...colOf.entries()];
  const tmp = new THREE.Color();

  return {
    group: root,
    globes,
    poles,
    pools,
    count: gi,
    /** g=0 时只留一点点底光，静帧与"未点灯"的差别才看得出来 */
    setGlow(g, lampGain = 1) {
      for (let i = 0; i < pairs; i++) {
        const k = 0.04 + 0.96 * lampOn(i, g);
        tmp.setRGB(k * 0.92 * lampGain, k * 0.77 * lampGain, k * 0.53 * lampGain);
        for (const p of [i * 2, i * 2 + 1]) {
          for (let f = 0; f < flowers; f++) globes.setColorAt(p * flowers + f, tmp);
        }
      }
      if (globes.instanceColor) globes.instanceColor.needsUpdate = true;
      for (let i = 0; i < pairs; i++) {
        const k = lampOn(i, g);
        tmp.setRGB(k * 0.34 * lampGain, k * 0.26 * lampGain, k * 0.17 * lampGain);
        pools.setColorAt(i * 2, tmp);
        pools.setColorAt(i * 2 + 1, tmp);
      }
      if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      for (const [p, c] of colList) {
        const i = p >> 1;
        columns.setScale(c, Math.min(1.4, lampOn(i, g) * lampGain));
      }
    },
  };
}

/** 两岸堤顶的行灯（写意）：给"齐明"当尾声，也把岸线读出来 */
export function buildShoreLamps(scene, columns) {
  const grp = new THREE.Group();
  grp.name = 'shore-lamps';
  const posts = [];
  const heads = [];
  for (const sgn of [1, -1]) {
    const z = sgn * (RIVER.beachTo + 26);
    const base = Math.max(6.2, 9.0);
    for (let x = -1600; x <= 1600; x += 120) {
      posts.push(box(0.3, 6.0, 0.3, x, base, z));
      heads.push(cyl(0.7, 0.5, 0.7, 8, x, base + 6.0, z));
      if (Math.abs(z) < 900) columns.add(new THREE.Vector3(x, 0, z), '#ffbe86', 1.2, 8, 0.5);
    }
  }
  grp.add(mesh(posts, M.concreteDark));
  grp.add(mesh(heads, M.lampGlobe));
  scene.add(grp);
  return grp;
}
