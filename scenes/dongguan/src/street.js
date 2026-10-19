import * as THREE from 'three';
import { STREET, PLAZA, GATE_PAIFANG, WHARF_PAIFANG } from './data.js';
import { M, box, mesh, rand, rr, wallQuad, sideQuad, slopeZQuad, floorQuad } from './kit.js';

const SHOP_TILE = [24, 14];
const ROOF_TILE = [10, 3.2];
const PLASTER_TILE = [8, 4];
const PAVE_TILE = [24, 12];
const BLOCK_TILE = [8, 8];

/** 牌楼以东才是连续铺面；西口那一段留给街口与牌楼本身 */
const BUILD_X0 = 20;

/** k 层房的檐口高：层高按 STREET.floorH 走，面门纹理的层带才对得上 */
const eave = (k) => STREET.deck + STREET.floorH * k;

/* ---------------------------------------------------------------- 街坊布局 */

let cached = null;

/**
 * 一次生成、全程复用：几何与道具读同一份分段，随机数才不会二次错位。
 * 巷口与两处留白（行宫、园墙）在这里挖掉，剩下的地段宽窄错落。
 */
export function layout() {
  if (cached) return cached;
  const segs = [];
  for (const side of [-1, 1]) {
    let x = BUILD_X0;
    while (x < STREET.x1 - 5) {
      const alley = STREET.alleys.find((a) => Math.abs(a.x - (x + 4)) < a.w / 2 + 1.2);
      if (alley) { x = alley.x + alley.w / 2 + 0.4; continue; }
      const gap = STREET.gaps.find((g) => g.side === side && x + 3 > g.x0 && x < g.x1);
      if (gap) { x = gap.x1 + 0.4; continue; }
      const w = rr(7.4, 13.6);
      const x1 = Math.min(x + w, STREET.x1);
      const floors = rand() < 0.14 ? 3 : (rand() < 0.8 ? 2 : 1);
      segs.push({
        side, x0: x, x1, floors, eave: eave(floors),
        deep: rr(7.6, 10.4),
        lampGap: rr(4.8, 6.8),
        banner: rand() < 0.6,
        steps: rand() < 0.72,
      });
      x = x1 + 0.3;
    }
  }
  cached = { segs };
  return cached;
}

/* -------------------------------------------------------------------- 街面 */

function buildGround(parts) {
  const { x0, x1, half, deck, frontZ, deep } = STREET;
  parts.pave.push(floorQuad({ x0: x0 - 34, x1: PLAZA.x0 + 2, z0: -half, z1: half, y: deck, tile: PAVE_TILE }));
  for (const side of [-1, 1]) {
    // 檐前走道石略高于街心，水往中间走
    parts.walk.push(floorQuad({ x0, x1, z0: side * (half - 1.9), z1: side * (half + 1.6), y: deck + 0.09, tile: BLOCK_TILE }));
    parts.curb.push(box(1.6, 0.16, x1 - x0, (x0 + x1) / 2 - 0.8, deck + 0.09, side * (half + 0.8)));
    // 后巷只留一条窄影，鸟瞰时不把画面摊成空场
    parts.pave.push(floorQuad({
      x0: x0 - 10, x1: PLAZA.x0, z0: side * (frontZ + deep + 1.5), z1: side * (frontZ + deep + 12),
      y: 0.04, tile: PAVE_TILE,
    }));
    parts.plaster.push(box(PLAZA.x0 - x0 + 10, 3.6, 0.5, (x0 + PLAZA.x0) / 2, 0.04, side * (frontZ + deep + 12)));
  }
  for (const side of [-1, 1]) parts.dark.push(box(x1 - x0, 0.07, 0.36, (x0 + x1) / 2, deck + 0.02, side * 3.2));
}

/* ------------------------------------------------------------------ 两侧铺面 */

function buildSegment(s, parts) {
  const { deck, frontZ } = STREET;
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const zFront = s.side * frontZ;
  const zBody = s.side * (frontZ + s.deep / 2);
  const facing = -s.side;
  const origin = [s.x0, deck];

  parts.shop.push(wallQuad({
    x0: s.x0, x1: s.x1, y0: deck, y1: eave(1), z: zFront, facing, tile: SHOP_TILE, origin,
  }));
  if (s.floors > 1) {
    parts.shop.push(wallQuad({
      x0: s.x0, x1: s.x1, y0: eave(1), y1: s.eave, z: zFront, facing, tile: SHOP_TILE, origin,
    }));
  }

  // 背墙必须在面门纹理之后（更靠街心一侧会把窗门全挡住）
  parts.plaster.push(box(w, s.eave - deck, 0.3, cx, deck, s.side * (frontZ + 0.16)));
  parts.plaster.push(box(w, s.eave + 0.6 - deck, s.deep, cx, deck, zBody));
  for (const px of [s.x0, s.x1]) {
    parts.plaster.push(box(0.36, 1.2, s.deep, px, s.eave, zBody));
  }

  // 檐口出挑：一层雨搭、顶层压檐
  parts.wood.push(box(w + 0.3, 0.26, 0.66, cx, eave(1) - 0.26, s.side * (frontZ - 0.34)));
  parts.wood.push(box(w + 0.34, 0.24, 0.52, cx, s.eave, s.side * (frontZ - 0.28)));
  if (s.floors > 2) parts.wood.push(box(w + 0.2, 0.18, 0.4, cx, eave(2) - 0.18, s.side * (frontZ - 0.2)));

  if (s.steps) {
    const n = Math.max(1, Math.round(w / 4.4));
    for (let i = 0; i < n; i++) {
      const px = s.x0 + (i + 0.5) * (w / n);
      parts.curb.push(box(2.1, 0.13, 0.85, px, deck + 0.09, s.side * (frontZ - 1.05)));
      parts.wood.push(box(1.8, 0.15, 0.2, px, deck + 0.22, s.side * (frontZ - 0.24)));
    }
  }

  // 坡屋顶：低端在檐口、高端在脊。两段都按 z 递减给点，法线自动朝上
  const zEaveFront = s.side * frontZ;
  const zRidge = s.side * (frontZ + s.deep / 2);
  const zEaveBack = s.side * (frontZ + s.deep);
  const yEave = s.eave + 0.22;
  const yRidge = s.eave + 1.15;
  const [za, zb] = s.side > 0 ? [zEaveBack, zEaveFront] : [zEaveFront, zEaveBack];
  parts.roof.push(slopeZQuad({ x0: s.x0 - 0.5, x1: s.x1 + 0.5, z0: za, y0: yEave, z1: zRidge, y1: yRidge, tile: ROOF_TILE }));
  parts.roof.push(slopeZQuad({ x0: s.x0 - 0.5, x1: s.x1 + 0.5, z0: zRidge, y0: yRidge, z1: zb, y1: yEave, tile: ROOF_TILE }));
  parts.roof.push(box(w + 1.2, 0.28, 0.44, cx, yRidge - 0.12, zRidge));
}

/* -------------------------------------------------------------------- 巷口 */

function buildAlleys(parts, anchors) {
  const { frontZ, deck } = STREET;
  for (const a of STREET.alleys) {
    for (const side of [-1, 1]) {
      const zMouth = side * (frontZ - 0.4);
      const zEnd = side * (frontZ + a.lane);
      const wallH = deck + rr(3.6, 5.4);
      for (const sign of [-1, 1]) {
        const wx = a.x + sign * a.w / 2;
        parts.plaster.push(sideQuad({ x: wx, z0: zMouth, z1: zEnd, y0: deck, y1: wallH, facing: -sign, tile: PLASTER_TILE }));
        parts.plaster.push(sideQuad({ x: wx, z0: zMouth, z1: zEnd, y0: deck, y1: wallH, facing: sign, tile: PLASTER_TILE }));
      }
      parts.pave.push(floorQuad({ x0: a.x - a.w / 2, x1: a.x + a.w / 2, z0: zMouth, z1: zEnd, y: deck - 0.04, tile: BLOCK_TILE }));
      parts.plaster.push(box(a.w + 0.8, 4.4, 0.4, a.x, deck, side * (frontZ + a.lane)));

      // 圈门：两柱一楣，压在巷口
      const zy = side * (frontZ + 0.7);
      parts.wood.push(box(0.34, 3.1, 0.34, a.x - a.w / 2 + 0.2, deck, zy));
      parts.wood.push(box(0.34, 3.1, 0.34, a.x + a.w / 2 - 0.2, deck, zy));
      parts.wood.push(box(a.w + 0.6, 0.36, 0.52, a.x, deck + 3.1, zy));
      parts.roof.push(box(a.w + 1.1, 0.22, 0.72, a.x, deck + 3.46, zy));
      anchors.quanmen.push({ x: a.x, y: deck + 3.28, z: zy, side, name: a.name });
    }
  }
}

/* ------------------------------------------------------ 街南园墙 / 街北行宫 */

function buildGardenWall(parts, anchors) {
  const { frontZ, deck } = STREET;
  const g = STREET.gaps.find((x) => x.side === 1);
  const x0 = g.x0, x1 = g.x1, z = frontZ;
  parts.plaster.push(wallQuad({ x0, x1, y0: deck, y1: deck + 4.5, z, facing: -1, tile: PLASTER_TILE, origin: [x0, deck] }));
  parts.plaster.push(box(x1 - x0, 0.3, 0.7, (x0 + x1) / 2, deck + 4.5, z - 0.15));   // 墙顶覆瓦脊
  parts.roof.push(box(x1 - x0 + 0.8, 0.2, 0.9, (x0 + x1) / 2, deck + 4.8, z - 0.2));
  // 园门：一间小小的门房，比墙略高
  const gx = (x0 + x1) / 2;
  parts.plaster.push(box(4.2, 5.4, 3.2, gx, deck, z + 1.6));
  parts.roof.push(box(5.2, 0.26, 4.2, gx, deck + 5.4, z + 1.6));
  parts.wood.push(box(2.2, 3.0, 0.24, gx, deck, z + 0.1));
  anchors.bamboo = { x0: x0 + 6, x1: x1 - 6, z0: z + 4, z1: z + 15 };
  anchors.gardenGate = { x: gx, y: deck + 3.4, z: z - 0.2 };
}

function buildTemple(parts, anchors) {
  const { frontZ, deck } = STREET;
  const g = STREET.gaps.find((x) => x.side === -1);
  const x0 = g.x0, x1 = g.x1, cx = (x0 + x1) / 2;
  const z = -frontZ;
  const H = 6.6;
  parts.plaster.push(wallQuad({ x0, x1, y0: deck, y1: deck + H, z, facing: 1, tile: PLASTER_TILE, origin: [x0, deck] }));
  parts.plaster.push(box(x1 - x0, H, 8.6, cx, deck, z - 4.3));
  // 台门与两侧八字墙
  parts.wood.push(box(3.0, 3.4, 0.3, cx, deck, z - 0.2));
  parts.wood.push(box(0.4, H - 0.4, 0.4, cx - 1.7, deck, z - 0.3));
  parts.wood.push(box(0.4, H - 0.4, 0.4, cx + 1.7, deck, z - 0.3));
  parts.wood.push(box(x1 - x0 + 0.8, 0.3, 0.75, cx, deck + H - 0.3, z - 0.2));
  // 屋面压过邻屋
  const yEave = deck + H + 0.2;
  const yRidge = deck + H + 1.5;
  parts.roof.push(slopeZQuad({ x0: x0 - 1.2, x1: x1 + 1.2, z0: z - 8.8, y0: yEave, z1: z - 4.3, y1: yRidge, tile: ROOF_TILE }));
  parts.roof.push(slopeZQuad({ x0: x0 - 1.2, x1: x1 + 1.2, z0: z - 4.3, y0: yRidge, z1: z, y1: yEave, tile: ROOF_TILE }));
  parts.roof.push(box(x1 - x0 + 2.6, 0.32, 0.5, cx, yRidge - 0.14, z - 4.3));
  anchors.temple = { x: cx, y: deck + H + 1.5, z: z - 0.4, front: { x: cx, y: deck + 4.2, z: z - 0.4 } };
}

/* -------------------------------------------------------------------- 牌楼 */

function buildPaifang(x, parts, anchors) {
  const { half, deck } = STREET;
  const zMain = half - 0.5;
  const zSide = half + 2.7;
  const H = 6.9;
  for (const z of [-zMain, zMain]) {
    parts.wood.push(box(0.54, H, 0.54, x, deck, z));
    parts.curb.push(box(1.15, 0.4, 1.15, x, deck, z));
    parts.wood.push(box(0.9, 0.44, 0.7, x, deck + H, z));
  }
  for (const z of [-zSide, zSide]) {
    parts.wood.push(box(0.42, 4.5, 0.42, x, deck, z));
    parts.curb.push(box(0.95, 0.34, 0.95, x, deck, z));
  }
  // 跨街的三道横梁与中部匾额
  parts.wood.push(box(0.55, 0.5, zMain * 2 + 1.4, x, deck + H - 0.5, 0));
  parts.wood.push(box(0.44, 0.34, zMain * 2 + 1.0, x, deck + 5.0, 0));
  parts.wood.push(box(0.44, 0.3, zSide * 2 + 0.6, x, deck + 4.5, 0));
  for (const z of [-zSide, zSide]) parts.roof.push(box(1.0, 0.24, 4.4, x, deck + 4.68, z));
  parts.roof.push(box(1.3, 0.3, zMain * 2 + 3.2, x, deck + H + 0.1, 0));
  parts.roof.push(box(0.7, 0.26, zMain * 2 + 2.0, x, deck + H + 0.4, 0));
  anchors.paifang.push({ x, y: deck + 5.35, half: zMain });
}

/** 西口的街口墙：让相机在牌楼以西看得见一个"口子"而不是穿堂 */
function buildMouth(parts) {
  const { frontZ, deck, half } = STREET;
  for (const side of [-1, 1]) {
    parts.plaster.push(box(14, 5.0, 0.5, 13, deck, side * frontZ));
    parts.roof.push(box(15, 0.24, 0.8, 13, deck + 5.0, side * (frontZ - 0.15)));
    parts.plaster.push(box(0.5, 5.0, frontZ - half, 20, deck, side * (half + (frontZ - half) / 2)));
  }
}

/* -------------------------------------------------------------------- 组装 */

export function buildStreet(scene) {
  const parts = { pave: [], walk: [], curb: [], dark: [], plaster: [], wood: [], roof: [], shop: [] };
  const anchors = { quanmen: [], paifang: [], bamboo: null, temple: null, gardenGate: null };

  buildGround(parts);
  for (const s of layout().segs) buildSegment(s, parts);
  buildAlleys(parts, anchors);
  buildGardenWall(parts, anchors);
  buildTemple(parts, anchors);
  buildMouth(parts);
  buildPaifang(GATE_PAIFANG, parts, anchors);
  buildPaifang(WHARF_PAIFANG, parts, anchors);

  const group = new THREE.Group();
  group.name = 'street';
  scene.add(group);

  const add = (list, mat, name) => {
    if (!list.length) return null;
    const m = mesh(list, mat);
    m.name = name;
    group.add(m);
    return m;
  };
  add(parts.pave, M.paving, 'street-paving');
  add(parts.walk, M.paving, 'street-walk');
  add(parts.curb, M.curb, 'street-curb');
  add(parts.dark, M.woodDark, 'street-gutter');
  const shopMesh = add(parts.shop, M.shop, 'street-shop');
  add(parts.plaster, M.plaster, 'street-plaster');
  add(parts.wood, M.wood, 'street-wood');
  add(parts.roof, M.roof, 'street-roof');

  const ridges = layout().segs.map((s) => ({
    x0: s.x0, x1: s.x1, y: s.eave + 1.15, z: s.side * (STREET.frontZ + s.deep / 2),
  }));
  return { group, shopMesh, anchors, ridges, segs: layout().segs };
}
