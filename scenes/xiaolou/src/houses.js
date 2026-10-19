import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chineseRoof, ridgeOrnament, box, glow, rr, rand, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { PLOTS, SITE, LANE, lanePoint, laneHW, yawAt } from './plan.js';

/**
 * 巷两侧连排宅第：硬山顶、马头墙、青砖黛瓦，门朝巷、进深往里走。
 * 形制按小娄巷建筑群的通行描述（硬山、马头墙、砖木、天井、备弄），
 * 开间与层高取江南民居常例，非测绘；匾上堂号用可考的建筑名录。
 */

const join = (parts, mat, cast = true) => {
  const m = new THREE.Mesh(mergeGeometries(parts.filter(Boolean)), mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};

/** 山墙轮廓：马头墙分阶落下，观音兜圆弧收顶。两者都在 (进深, 高) 平面里给点 */
function gableProfile({ depth, eave, peak, style }) {
  const hd = depth / 2;
  const pts = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const u = -hd + (2 * hd * i) / N;
    const t = Math.abs(u) / hd;
    let y;
    if (style === 'step') {
      const unit = (peak - eave) / 4;
      y = Math.min(peak + 0.6, eave + Math.ceil((1 - t) * 4) * unit + 0.34);
      // 阶与阶之间落下来一点，山墙的梯级才看得出来
      y -= 0.22 * (t > 0.55 ? 1 : 0);
    } else {
      y = eave + (peak - eave) * Math.pow(1 - t, 0.7) + 0.5 * Math.cos(t * Math.PI * 0.85) + 0.4 * t ** 3;
    }
    pts.push([u, Math.max(y, eave * 0.6)]);
  }
  return pts;
}

function gableGeo({ width, depth, eave, peak, style, thickness = 0.34 }) {
  const pts = gableProfile({ depth, eave, peak, style });
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], 0);
  for (const [u, y] of pts) shape.lineTo(u, y);
  shape.lineTo(pts[pts.length - 1][0], 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // 型状画在 (u=x, y) 上、沿 +z 挤出；转 90° 让厚度落在面阔方向
  g.rotateY(Math.PI / 2);
  const out = [];
  for (const s of [-1, 1]) {
    const c = g.clone();
    c.translate(s * (width / 2 - thickness / 2), 0, 0);
    out.push(c);
  }
  // 每阶上一线压顶瓦
  const caps = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < pts.length - 1; i += 5) {
      const [u, y] = pts[i];
      const [u2] = pts[i + 1];
      caps.push(box(Math.abs(u2 - u) * 5 + 0.14, 0.16, 0.4, s * (width / 2 - 0.06), y + 0.06, -u));
    }
  }
  return { wall: out, caps };
}

/** 砖雕门罩：叠涩出檐 + 石额 + 门灯 */
function gateFront({ w = 2.5, h = 3.0, text, mat, tileMat, lamps }) {
  const g = new THREE.Group();
  g.add(join([
    box(w + 1.0, 0.5, 0.5, 0, h + 0.55, 0.06),
    box(w + 0.6, 0.34, 0.66, 0, h + 0.92, 0.1),
    box(w + 0.24, 0.3, 0.44, 0, h + 1.18, 0.06),
  ], mat));
  const eaveRoof = join([
    box(w + 1.4, 0.22, 1.05, 0, h + 1.4, 0.0),
    box(w + 0.95, 0.2, 0.8, 0, h + 1.6, 0.0),
  ], tileMat);
  eaveRoof.rotation.x = -0.13;
  g.add(eaveRoof);
  if (text) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.84, 0.52),
      new THREE.MeshBasicMaterial({
        map: T.plaque(text, { dir: 'h', bg: '#1d2536', fg: '#e9dcbe', border: '#98a2b2' }),
        toneMapped: false,
      }));
    plate.position.set(0, h + 0.68, 0.42);
    g.add(plate);
    // 石额要被读出来，得有一盏灯专门打它
    const wash = new THREE.SpotLight(new THREE.Color('#ffd9a4'), 9, 7, 0.62, 0.5, 1.6);
    wash.position.set(0, h - 0.3, 1.1);
    wash.target.position.set(0, h + 0.68, 0.3);
    g.add(wash, wash.target);
  }
  if (lamps) {
    // 门灯只画发光体，不另加真实光源：一盏一盏点下去，全巷的窗就点不起了
    for (const s of [-1, 1]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow('#ffc885', 2.6));
      bulb.position.set(s * (w / 2 + 0.45), h - 0.2, 0.3);
      g.add(bulb);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,190,120', 0.1), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false, opacity: 0.75,
      }));
      halo.material.toneMapped = false;
      halo.position.copy(bulb.position);
      halo.scale.setScalar(1.5);
      g.add(halo);
    }
  }
  return g;
}

/** 木栅门两扇：门簪、铺首 */
function doorGeo({ w = 1.7, h = 2.5 }) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(w / 2 - 0.05, h, 0.14, s * w / 4, h / 2, 0));
    for (let i = 0; i < 4; i++) parts.push(box(w / 2 - 0.16, 0.07, 0.05, s * w / 4, h * (0.16 + i * 0.23), 0.08));
  }
  parts.push(box(w + 0.18, 0.2, 0.26, 0, h + 0.1, 0));
  parts.push(box(0.26, 0.16, 0.3, -0.3, h - 0.1, 0.12));
  parts.push(box(0.26, 0.16, 0.3, 0.3, h - 0.1, 0.12));
  return mergeGeometries(parts);
}

export function buildHouses(scene) {
  const group = new THREE.Group();
  group.name = 'houses';
  scene.add(group);

  const anchors = [];
  const modernStrip = new THREE.Group();
  modernStrip.name = 'eave-strips';
  group.add(modernStrip);

  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b0a691'), map: T.plaster('#a49880'), roughness: 0.95,
    emissive: new THREE.Color('#141b28'), emissiveIntensity: 0.2,
  });
  const brickMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7a7466'), map: T.stone('#615b4f'), roughness: 0.94,
    emissive: new THREE.Color('#0f131b'), emissiveIntensity: 0.09,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#767d8b'), map: T.stone('#646b79'), roughness: 0.88,
  });
  const tileMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9ba4bb'), map: T.roofTiles('#28304a', '#3a445c', '#5d6b88'),
    roughness: 0.78, side: THREE.DoubleSide,
    emissive: new THREE.Color('#0f1626'), emissiveIntensity: 0.17,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5a3626'), map: T.wood('#4a2b1e', '#2a1710'), roughness: 0.75,
  });
  const latMat = new THREE.MeshBasicMaterial({
    map: T.lattice(), color: 0xa08564, toneMapped: false, side: THREE.DoubleSide,
  });

  for (const plot of PLOTS) {
    const cx = (plot.x0 + plot.x1) / 2;
    const width = plot.x1 - plot.x0;
    const depth = plot.depth;
    const p = lanePoint(cx, plot.side * (laneHW(cx) + 0.28));
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = yawAt(cx, plot.side);
    group.add(g);

    const grand = plot.kind === 'great' || plot.kind === 'hall' || plot.kind === 'tower' || plot.kind === 'garden-house';
    const f1 = LANE.eaveLow + rr(-0.1, 0.2);
    const floorH = 2.85;
    const eave = f1 + (plot.floors - 1) * floorH;
    const rh = 1.7 + (grand ? 0.55 : 0) + rr(-0.1, 0.15);
    const peak = eave + rh;

    // 屋身与勒脚
    g.add(join([box(width, eave, depth, 0, eave / 2, -depth / 2)], plot.kind === 'shrine' || plot.kind === 'hall' ? brickMat : wallMat));
    g.add(join([box(width + 0.3, 0.44, depth + 0.4, 0, 0.22, -depth / 2)], stoneMat, false));

    // 硬山屋顶 + 正脊
    const roof = chineseRoof({
      width: width - 0.3, depth: depth + 0.2, height: rh,
      ridgeRatio: 0.5, curve: 0.52, eaveLift: 0.26, overhang: 0.3, hip: false, segU: 16, segV: 12,
    });
    roof.translate(0, eave, -depth / 2);
    g.add(join([roof], tileMat));
    const orn = ridgeOrnament({ width: width - 1.4, depth: depth, height: rh * 0.62, ridgeRatio: 0.5, overhang: 0.1 });
    orn.translate(0, eave + rh - 0.1, -depth / 2);
    g.add(join([orn], stoneMat, false));

    // 山墙：大户与祠堂用观音兜，连排铺户用马头墙
    const style = grand || plot.kind === 'corner' ? 'curve' : 'step';
    const gab = gableGeo({ width, depth, eave, peak, style });
    g.add(join(gab.wall, plot.kind === 'row' ? brickMat : wallMat));
    g.add(join(gab.caps, stoneMat, false));

    // 二层前廊与美人靠
    if (plot.floors > 1) {
      const y = f1 + 0.15;
      g.add(join([
        box(width * 0.86, 0.16, 1.0, 0, y, -0.5),
        box(width * 0.9, 0.12, 1.1, 0, y + floorH - 0.1, -0.5),
      ], woodMat));
      const rail = [];
      for (let i = 0; i <= 6; i++) {
        const x = -width * 0.42 + (width * 0.84 * i) / 6;
        rail.push(box(0.1, 0.95, 0.1, x, y + 0.55, -0.05));
      }
      rail.push(box(width * 0.86, 0.1, 0.16, 0, y + 1.05, -0.05));
      g.add(join(rail, woodMat, false));
    }

    // 临巷一面开窗：漏出暖光
    const nWin = Math.max(2, Math.round(width / 3.0));
    const winGeo = [], latMeshes = [];
    for (let i = 0; i < nWin; i++) {
      const x = -width / 2 + width * (i + 0.5) / nWin;
      for (let f = 0; f < plot.floors; f++) {
        const w = rr(0.86, 1.2), h = f === 0 ? 1.12 : 0.98;
        const y = 1.0 + f * floorH + (f > 0 ? 0.3 : 0);
        if (y + h > eave + 0.5) continue;
        winGeo.push(box(w + 0.22, h + 0.22, 0.14, x, y + h / 2, 0.02));
        latMeshes.push({ x, y: y + h / 2, w, h, lit: rand() > 0.42 });
      }
    }
    if (winGeo.length) g.add(join(winGeo, woodMat, false));
    for (const L of latMeshes) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), L.lit ? latMat : new THREE.MeshBasicMaterial({ color: 0x1a1f2c }));
      m.position.set(L.x, L.y, 0.1);
      g.add(m);
    }

    // 门：有堂号的开大门，其余按间数开一两扇小门
    const gates = [];
    const site = SITE[plot.id];
    if (site && site.side === plot.side) gates.push({ x: site.x - cx, text: site.name, big: true });
    const extra = plot.kind === 'row' || plot.kind === 'shop' ? 2 : 1;
    for (let i = 0; i < extra; i++) {
      const gx = -width / 2 + width * (0.28 + 0.44 * i) + rr(-0.5, 0.5);
      if (!gates.some((q) => Math.abs(q.x - gx) < 2.4)) gates.push({ x: gx, text: rand() > 0.7 ? '平安' : '', big: false });
    }
    for (const gate of gates) {
      const h = gate.big ? 3.25 : 2.75;
      const w = gate.big ? 2.7 : 2.1;
      const face = gateFront({ w, h, text: gate.text, mat: brickMat, tileMat, lamps: gate.big || rand() > 0.5 });
      face.position.set(gate.x, 0, 0.12);
      g.add(face);
      const door = new THREE.Mesh(doorGeo({ w: gate.big ? 1.9 : 1.5, h: h - 0.45 }), woodMat);
      door.position.set(gate.x, 0, -0.02);
      door.castShadow = true;
      g.add(door);
      g.add(join([
        box((gate.big ? 2.0 : 1.6) + 0.3, 0.12, 0.5, gate.x, 0.15, 0.24),
        box(gate.big ? 3.6 : 2.8, 0.3, 0.5, gate.x, 0.15, -1.4),
      ], stoneMat, false));
      anchors.push({
        x: p.x, y: h + 0.2, z: p.z, gate: true, big: gate.big, named: gate.text,
        side: plot.side, yaw: yawAt(site ? site.x : cx, plot.side),
      });
    }

    // 檐下挂灯的锚点：沿面阔每 2.4 米一个
    const n = Math.max(2, Math.round(width / 2.4));
    for (let i = 0; i < n; i++) {
      const lx = -width / 2 + width * (i + 0.5) / n;
      const yaw = yawAt(cx, plot.side);
      anchors.push({
        x: p.x + lx * Math.cos(yaw),
        y: eave - 0.42,
        z: p.z - lx * Math.sin(yaw),
        side: plot.side, plot: cx, upper: false, big: grand,
      });
    }

    // 今景：开街后的檐口与山墙灯带，2700–3000K 的一条线
    if (rand() > 0.35) {
      const strip = new THREE.Mesh(box(width * 0.92, 0.07, 0.07), glow('#ffd39a', 1.15));
      strip.position.set(p.x, eave - 0.12, p.z);
      strip.rotation.y = yawAt(cx, plot.side);
      modernStrip.add(strip);
    }

    registerOccluder(g, 1.1, new THREE.Vector3(p.x, 1.4, p.z));
  }

  return { group, anchors, modernStrip };
}
