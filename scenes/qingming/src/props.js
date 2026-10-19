/**
 * 活动体：灯船船队（穿桥）、河灯、沿街灯火与人流。
 * 灯位都从 architecture 的 anchors 取，这样改房子不用改灯，改灯也不用改房子。
 */
import * as THREE from 'three';
import { M, PAL, box, mesh, rr } from './kit.js';
import { LanternField, Crowd, Fleet, overheadStrings, lotusLanterns } from './lanterns.js';
import { RIVER, BRIDGE, BANK, LANDING, deckY } from './data.js';

const Q = RIVER.quayY;
/** 桥头走廊：这一段河岸不挂晾衣绳，免得压在台阶上 */
const CORRIDOR = 11.5;

/* 把变换烘进几何，便于按材质合并 */
function put(arr, geo, x = 0, y = 0, z = 0) {
  geo.translate(x, y, z);
  arr.push(geo);
  return geo;
}

/** 人流通道：两侧河沿步道、两条主街、御码头 */
const WALK_PATHS = [
  { a: [BANK.west.walk, Q + 0.45, -148], b: [BANK.west.walk, Q + 0.45, 148] },
  { a: [BANK.west.walk - 1.1, Q + 0.45, 132], b: [BANK.west.walk - 1.1, Q + 0.45, -132] },
  { a: [BANK.west.street, Q + 0.45, -118], b: [BANK.west.street, Q + 0.45, 118] },
  { a: [BANK.east.walk, Q + 0.45, 146], b: [BANK.east.walk, Q + 0.45, -146] },
  { a: [BANK.east.walk + 1.0, Q + 0.45, -126], b: [BANK.east.walk + 1.0, Q + 0.45, 126] },
  { a: [BANK.east.street, Q + 0.45, -110], b: [BANK.east.street, Q + 0.45, 110] },
  { a: [LANDING.x + 1.2, Q + 0.45, LANDING.z - 9], b: [LANDING.x + 1.2, Q + 0.45, LANDING.z + 9] },
];

/** 桥面上过桥的人：u 从西桥头走到东桥头，y 跟着桥面弧线 */
function deckWalk(u, off) {
  const x = -BRIDGE.length / 2 + u * BRIDGE.length;
  return {
    x,
    y: deckY(x) + 0.04,
    z: Math.max(-BRIDGE.width / 2 + 0.8, Math.min(BRIDGE.width / 2 - 0.8, off * 0.9)),
    heading: 0,
  };
}

const WARM = PAL.lanternWarm;

function fillLanterns(field, A) {
  A.eaves.forEach((p) => field.add(p, { color: WARM, size: rr(0.5, 0.66) }));
  A.streetLamps.forEach((p) => field.add(p, { color: '#ffca86', size: 0.62 }));
  A.windows.forEach((p) => field.add(p, { color: '#ffd9a2', size: 0.42 }));
  A.alleyLamps.forEach((p) => field.add(p, { color: '#ffb96e', size: 0.72, column: true, columnDepth: 5, columnWidth: 0.7 }));
  A.quayLamps.forEach((p) => field.add(p, { color: WARM, size: 0.8, column: true, columnDepth: 9, columnWidth: 1.0 }));
  A.lampPosts.forEach((p) => field.add(p, { color: '#ffc07a', size: 0.78, column: true, columnDepth: 11, columnWidth: 1.1 }));
  A.bridgeLamps.forEach((p) => field.add(p, { color: '#ffd28f', size: 0.78, column: true, columnDepth: 10, columnWidth: 1.0 }));
  A.archLamps.forEach((p) => field.add(p, { color: '#ffbe72', size: 0.5 }));
  A.ferryLamps.forEach((p) => field.add(p, { color: '#ffb066', size: 0.9, shape: 'hex', column: true, columnDepth: 12, columnWidth: 1.2 }));
  A.moorLamps.forEach((p) => field.add(p, { color: '#ff8f5e', size: 0.7, column: true, columnDepth: 7 }));
  (A.paifangLamps || []).forEach((p) => field.add(p, { color: '#ffe0a8', size: 0.75 }));
  // 探出水面的临水灯：只有这一排的光柱真的落在河上
  A.waterLamps.forEach((p, i) => field.add(p, {
    color: i % 5 === 0 ? PAL.lanternRed : '#ffcb85',
    size: 0.72, column: true, columnDepth: 15, columnWidth: 1.35,
  }));
}

/** 东岸人家晾在河沿的衣裳：两根竹竿一条绳，夜里只剩剪影 */
function clotheslines(scene, A) {
  const grp = new THREE.Group();
  const parts = [], cloth = [];
  for (let i = 0; i < 26; i++) {
    const sgn = i % 3 === 0 ? -1 : 1;
    const bank = sgn < 0 ? BANK.west : BANK.east;
    const z = rr(-146, 146);
    if (Math.abs(z) < CORRIDOR) continue;
    const x = bank.face - sgn * rr(0.8, 1.8);
    const y = Q + rr(2.4, 4.6);
    put(parts, box(0.06, 0.06, rr(3.2, 5.6), x, y, z));
    for (let k = 0; k < 3; k++) {
      put(cloth, box(0.04, rr(0.7, 1.05), rr(0.42, 0.6), x, y - 0.55, z - 1.8 + k * rr(1.1, 1.7)));
    }
  }
  grp.add(mesh(parts, M.dark), mesh(cloth, M.silk));
  scene.add(grp);
  return grp;
}

export function buildProps(scene, columns, A) {
  const field = new LanternField(scene, columns);
  fillLanterns(field, A);
  field.build();

  const strings = overheadStrings(scene, A, columns);
  const fleet = new Fleet(scene, columns, {
    count: 7,
    laneScale: 0.55,
    mooredAt: [[9.4, LANDING.z + 6], [8.2, LANDING.z - 6], [10.2, 96]],
    moorYaw: [-0.06, 0.08, Math.PI - 0.1],
  });
  const riverLamps = lotusLanterns(scene, { count: 88 });
  const crowd = new Crowd(scene, {
    paths: WALK_PATHS,
    bridgeAt: deckWalk,
    bridgeEvery: 21,
    lanternRate: 0.34,
  });
  const lines = clotheslines(scene, A);

  return { field, strings, fleet, crowd, riverLamps, lines };
}
