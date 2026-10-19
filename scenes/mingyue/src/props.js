import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, box, mesh, rand, rr, figureGeo } from '../../src/kit.js';
import * as T from '../../src/textures.js';
import { YARD } from './data.js';

const lanternMats = [];
const makePaper = () => {
  const m = new THREE.MeshStandardMaterial({
    color: '#ffd6a8', map: T.lanternPaper('#fff0cc', '#d8483a'), roughness: 0.55,
    emissive: '#ff8a3e', emissiveIntensity: 1.15,
  });
  lanternMats.push(m);
  return m;
};
// 一盏共享的纸罩材质：调灯火时只改这一个
const PAPER = makePaper();

// 石灯里的火：也挂进 lanternMats，跟着灯火滑条一起调
let STONE_LAMP = null;
function stoneLampMat() {
  if (!STONE_LAMP) {
    STONE_LAMP = new THREE.MeshStandardMaterial({
      color: '#4a3a28', roughness: 0.6, emissive: '#ffb877', emissiveIntensity: 1.6, side: THREE.DoubleSide,
    });
    lanternMats.push(STONE_LAMP);
  }
  return STONE_LAMP;
}

/** 一盏红灯笼：纸身 + 上下箍 + cord + 穗 + 晕 */
function lantern(scale = 1, withLight = false) {
  const grp = new THREE.Group();
  const r = 0.3 * scale;
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), PAPER);
  body.scale.set(1, 1.18, 1);
  grp.add(body);
  grp.add(mesh([
    box(r * 1.1, r * 0.24, r * 1.1, 0, r * 1.16, 0),
    box(r * 1.0, r * 0.2, r * 1.0, 0, -r * 1.16, 0),
    box(0.03, r * 1.7, 0.03, 0, r * 2.0, 0),
  ], M.ink));
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, r * 1.1, 6), M.silk);
  tassel.position.y = -r * 1.8;
  grp.add(tassel);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,186,110', 0.1), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.7,
  }));
  halo.material.toneMapped = false;
  halo.scale.setScalar(0.9 * scale);
  grp.add(halo);

  let light = null;
  if (withLight) {
    light = new THREE.PointLight(0xffb069, 13 * scale, 10 * scale, 2);
    grp.add(light);
  }
  grp.userData = { body, halo, light, baseLight: light ? light.intensity : 0, phase: rand() * 6.28, scale };
  return grp;
}

/** 一座落地庭灯：不到一米高的石灯，别站成一排电线杆 */
function floorLamp(withLight = false) {
  const grp = new THREE.Group();
  grp.add(mesh([
    new THREE.CylinderGeometry(0.24, 0.3, 0.16, 10).translate(0, 0.08, 0),
    new THREE.CylinderGeometry(0.09, 0.12, 0.62, 8).translate(0, 0.45, 0),
  ], M.stoneDressed));
  const room = mesh(box(0.36, 0.36, 0.36, 0, 0.95, 0), M.stoneDressed);
  grp.add(room);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), stoneLampMat());
  flame.position.y = 0.95;
  grp.add(flame);
  // 四面开灯窗，石灯才四面都亮
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), stoneLampMat());
    p.position.set(Math.sin(a) * 0.19, 0.95, Math.cos(a) * 0.19);
    p.rotation.y = a;
    grp.add(p);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.24, 4), M.stone);
  cap.position.y = 1.24;
  cap.rotation.y = Math.PI / 4;
  grp.add(cap);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,196,124', 0.08), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.6,
  }));
  halo.material.toneMapped = false;
  halo.scale.set(1.1, 1.1, 1);
  halo.position.y = 0.95;
  grp.add(halo);
  let light = null;
  if (withLight) {
    light = new THREE.PointLight(0xffc07a, 12, 9, 2);
    light.position.y = 0.95;
    grp.add(light);
  }
  grp.userData = { body: flame, halo, light, baseLight: light ? light.intensity : 0, phase: rand() * 6.28, scale: 1, isLamp: true };
  return grp;
}

/* ------------------------------------------------------------------ 游人 */
class Crowd {
  constructor(scene, n = 6) {
    this.items = [];
    const cloth = new THREE.MeshStandardMaterial({
      color: '#262d3d', roughness: 0.95, emissive: '#0a0d16', emissiveIntensity: 0.5,
    });
    const robe = new THREE.MeshStandardMaterial({
      color: '#43303f', roughness: 0.95, emissive: '#0d0a12', emissiveIntensity: 0.5,
    });
    // 沿院心走动的几条线，都绕开池子
    const paths = [
      [[-7.4, 11.0], [-7.0, 6.4], [-3.2, 2.2], [0.8, 0.6]],
      [[9.5, 4.4], [6.2, 8.0], [0.6, 9.8], [-4.6, 10.6]],
      [[10.6, -5.0], [10.6, 0.6], [11.0, 4.8]],
      [[-11.6, 8.2], [-10.6, 4.6], [-9.8, 1.6]],
      [[-2.4, -4.8], [2.4, -5.2], [6.4, -5.4]],
      [[-12.8, -8.4], [-7.4, -8.8], [-1.6, -9.0]],
    ];
    for (let i = 0; i < n; i++) {
      const path = paths[i % paths.length];
      const grp = new THREE.Group();
      const fig = new THREE.Mesh(figureGeo(rr(0.95, 1.12)), i % 3 === 0 ? robe : cloth);
      fig.castShadow = true;
      grp.add(fig);
      const lamp = lantern(0.5);
      lamp.position.set(0.3, 1.05, 0.05);
      grp.add(lamp);
      grp.position.set(path[0][0], 0, path[0][1]);
      scene.add(grp);
      this.items.push({
        grp, fig, lamp, path, seg: i % (path.length - 1), t: rand(),
        speed: rr(0.04, 0.085), dir: rand() > 0.5 ? 1 : -1, phase: rand() * 6.28,
      });
    }
  }
  update(t, dt, n, camPos) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const on = i < n;
      it.grp.visible = on;
      if (!on) continue;
      const p = it.path;
      it.t += dt * it.speed * it.dir;
      while (it.t > 1) { it.t -= 1; it.seg = (it.seg + 1) % p.length; }
      while (it.t < 0) { it.t += 1; it.seg = (it.seg - 1 + p.length) % p.length; }
      const q = p[it.seg], r = p[(it.seg + 1) % p.length];
      const x = q[0] + (r[0] - q[0]) * it.t, z = q[1] + (r[1] - q[1]) * it.t;
      it.grp.position.set(x, Math.abs(Math.sin(t * 3 + it.phase)) * 0.03, z);
      it.grp.rotation.y = Math.atan2((r[0] - q[0]) * it.dir, (r[1] - q[1]) * it.dir);
      it.fig.scale.y = 1 + Math.sin(t * 6 + it.phase) * 0.014;
      const near = camPos ? camPos.distanceTo(it.grp.position) : 99;
      it.grp.visible = near > 3.4;
      it.lamp.visible = near < 24;
    }
  }
}

/* ------------------------------------------------------------------ 组装 */
export function buildProps(scene, anchors, columns) {
  const grp = new THREE.Group();
  grp.name = 'props';
  const lamps = [];
  let litCount = 0;

  // 檐下灯笼：建筑给出的灯位，前七盏给真光
  for (const a of anchors) {
    if (a.kind !== 'lantern') continue;
    const withLight = litCount < 5;
    const l = lantern(1.05, withLight);
    l.position.copy(a.p).setY(a.p.y - 0.12);
    grp.add(l);
    lamps.push(l);
    litCount += withLight ? 1 : 0;
    columns.add(new THREE.Vector3(a.p.x, 0, a.p.z), '#ff9f52', 0.5, 3.2, 0.7);
  }

  // 廊下与岸边的庭灯
  const floorSpots = [
    [-7.4, 10.4], [-7.4, 7.6], [-2.4, -1.6], [4.4, -2.8],
    [10.6, -4.2], [10.6, 2.6], [-12.2, 6.8], [-10.8, 3.8],
    [-4.6, 8.6], [2.8, 7.4], [8.8, 5.0], [-13.4, -9.4],
  ];
  floorSpots.forEach(([x, z], i) => {
    const withLight = i < 4;
    const f = floorLamp(withLight);
    f.position.set(x, 0.02, z);
    grp.add(f);
    lamps.push(f);
    if (withLight) columns.add(new THREE.Vector3(x, 0, z), '#ffbd76', 0.42, 2.6, 0.6);
  });

  // 门罩下两盏：巷门口那处机位的主光
  for (const s of [-1, 1]) {
    const l = lantern(1.2, s < 0);
    l.position.set(YARD.gate.x + s * 1.6, YARD.gate.h + 0.22, YARD.gate.z - 0.6);
    grp.add(l);
    lamps.push(l);
    columns.add(new THREE.Vector3(l.position.x, 0, l.position.z + 0.4), '#ff9a52', 0.6, 3.4, 0.7);
  }

  // 楼上的案几与烛：凭栏机位近旁（平座面标高 = 台明 + 一层 + 腰檐）
  const seatY = YARD.hall.plinth + 3.9 + 0.62 + 0.11;
  const table = new THREE.Group();
  table.add(mesh([
    new THREE.CylinderGeometry(0.52, 0.52, 0.09, 16).translate(0, 0.72, 0),
    new THREE.CylinderGeometry(0.2, 0.34, 0.68, 10).translate(0, 0.36, 0),
  ], M.woodDark));
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.stoneDressed);
  pot.scale.y = 0.8;
  pot.position.set(0.14, 0.86, 0);
  table.add(pot);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6), M.silk);
  candle.position.set(-0.18, 0.88, 0.06);
  table.add(candle);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,206,140', 0.05), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.95,
  }));
  flame.material.toneMapped = false;
  flame.scale.set(0.7, 0.7, 1);
  flame.position.set(-0.18, 1.04, 0.06);
  table.add(flame);
  const cLight = new THREE.PointLight(0xffb060, 14, 9, 2);
  cLight.position.set(-0.18, 1.06, 0.06);
  table.add(cLight);
  table.position.set(4.2, seatY, -6.5);
  grp.add(table);
  const candleUnit = {
    userData: { body: candle, halo: flame, light: cLight, baseLight: 14, phase: 1.2, scale: 0.6, isCandle: true },
  };
  Object.assign(candleUnit, { position: table.position });
  lamps.push(candleUnit);

  // 亭前与岸边的石凳
  const stools = [];
  for (const [x, y, z, r] of [
    [YARD.fanPavilion.x + 1.1, 0.24, YARD.fanPavilion.z + 0.7, 0.42],
    [YARD.banyue.x + 1.0, 0.3, YARD.banyue.z - 0.9, 0.36],
    [-1.4, 0.24, 8.4, 0.4],
    [10.2, 0.24, 3.0, 0.4],
  ]) {
    stools.push(new THREE.CylinderGeometry(r, r * 1.06, 0.46, 12).translate(x, y, z));
  }
  const seat = mesh(mergeGeometries(stools), M.stoneDressed);
  seat.castShadow = true;
  grp.add(seat);

  // 楼窗里的帘：压在格子窗后一层暖绸
  const curtainMat = new THREE.MeshStandardMaterial({
    color: '#c1614a', roughness: 0.72, side: THREE.DoubleSide,
    emissive: '#63211a', emissiveIntensity: 0.75,
  });
  const curtains = [];
  for (let i = 0; i < 7; i++) {
    const cx = -12.8 + i * 3.2 + 1.6;
    curtains.push(box(2.1, 1.45, 0.05, cx, 6.35, -7.85));
    if (i % 2 === 0) curtains.push(box(2.1, 1.25, 0.05, cx, 2.4, -7.9));
  }
  grp.add(mesh(curtains, curtainMat));

  scene.add(grp);
  const crowd = new Crowd(scene, 6);

  return {
    grp, lamps, crowd, table,
    /** 灯火总闸：0..1.6，月色泛起来时按需要压暗 */
    setLantern(k) {
      for (const m of lanternMats) m.emissiveIntensity = 0.12 + 1.45 * k;
      for (const l of lamps) {
        const u = l.userData;
        if (u.halo) u.halo.material.opacity = 0.1 + 0.62 * Math.min(1.2, k);
        if (u.light) u.light.intensity = u.baseLight * k;
      }
      curtainMat.emissiveIntensity = 0.16 + 0.8 * k;
    },
    update(t, dt, n, camPos) {
      for (const l of lamps) {
        const u = l.userData;
        if (!u || u.isCandle) continue;
        if (l.isSprite !== true && l.rotation) l.rotation.z = Math.sin(t * 0.9 + u.phase) * 0.05;
        if (u.light) u.light.intensity = u.baseLight * (0.86 + 0.14 * Math.sin(t * 2.4 + u.phase));
      }
      const c = candleUnit.userData;
      c.halo.material.opacity = 0.7 + 0.25 * Math.sin(t * 5.2);
      crowd.update(t, dt, n, camPos);
    },
  };
}

export { lantern, floorLamp, Crowd };
