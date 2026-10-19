import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, groundAt, PATH, SEA, RESERVOIR, LIANDAO, clamp01, lerp } from './data.js';
import { M, lit, glow, mesh, box, cyl, rand, rr, pathFrames, registerOccluder } from './kit.js';
import * as T from './textures.js';

/**
 * 一径山灯、宫观与塔上的火、海上几点渔火。
 * 亮与照分开做：亮是发光面与加色光晕（走 bloom），照只有十来盏真灯，
 * 不然 SwiftShader 下一张静帧都跑不完。
 */

const HALO = (hue, hard = 0.06) => T.softGlow(hue, hard);

function haloSprite(color, size, { map = HALO('255,206,150', 0.06), opacity = 0.9, att = true } = {}) {
  const m = new THREE.SpriteMaterial({
    map, color: new THREE.Color(color), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity, sizeAttenuation: att,
  });
  m.toneMapped = false;
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

export function buildProps(scene, opts) {
  const { anchors, carvings, towerTiers, shoreLamps, townLamps, causewayLamps, bridge } = opts;
  const grp = new THREE.Group();
  grp.name = 'props';
  scene.add(grp);

  const lanterns = [];        // { obj, sprite, base, phase }
  const pathLamps = [];       // { obj, sprite, frac, gain }
  const waterLamps = [];      // [x, y, z, color, width, depth]
  const realLights = [];
  const posts = [];
  const shells = [];

  const addLantern = (x, y, z, { size = 0.9, kind = 'lantern', gain = 1, phase = rand() * 6.28 } = {}) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.44, size * 0.4, size * 0.98, 10, 1, false), M.lantern);
    body.position.set(x, y, z);
    body.name = 'lantern-body';
    grp.add(body);
    const core = glow('#ffcf9a', 1.2);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(size * 0.2, 8, 6), core);
    flame.position.set(x, y, z);
    grp.add(flame);
    const sp = haloSprite('#ffbe7e', size * 7.2, { opacity: 0.8 });
    sp.position.set(x, y, z);
    sp.name = 'halos';
    grp.add(sp);
    const item = { body, flame, sprite: sp, base: gain, phase, kind };
    lanterns.push(item);
    return item;
  };

  const addStoneLamp = (x, y, z, h = 2.4) => {
    posts.push(cyl(0.2, 0.16, h, 8, x, y, z));
    posts.push(box(0.7, 0.24, 0.7, x, y + h, z));
    shells.push(box(0.52, 0.6, 0.52, x, y + h + 0.24, z));
    const it = addLantern(x, y + h + 0.6, z, { size: 0.42 });
    return it;
  };

  /* ------------------------------------------------------- 登山一径的灯 */
  const frames = pathFrames(PATH.map(([x, z]) => [x, groundAt(x, z), z]), { steps: 6 });
  const total = frames.length;
  const step = 26;
  for (let d = 12; d < total - 8; d += step) {
    const i = Math.min(frames.pts.length - 1, Math.round((d / total) * (frames.pts.length - 1)));
    const p = frames.pts[i];
    const y = groundAt(p.x, p.z);
    const side = frames.right[i];
    const off = (Math.floor(d / step) % 2 ? 1 : -1) * 2.6;
    const x = p.x + side.x * off, z = p.z + side.z * off;
    posts.push(cyl(0.19, 0.15, 2.1, 7, x, y, z));
    posts.push(box(0.6, 0.2, 0.6, x, y + 2.1, z));
    shells.push(box(0.46, 0.52, 0.46, x, y + 2.32, z));
    const sp = haloSprite('#ffc084', 3.1, { opacity: 0.78 });
    sp.position.set(x, y + 2.6, z);
    sp.name = 'halos';
    grp.add(sp);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ffd0a2', 1.25));
    core.position.set(x, y + 2.6, z);
    grp.add(core);
    const item = { sprite: sp, core, frac: d / total, base: 1, phase: rand() * 6.28 };
    pathLamps.push(item);
    if (y < 40) waterLamps.push([x, Math.max(y - 1, 1.2), z, '#ffc084', 1.1, 6]);
  }

  /* --------------------------------------------------------- 建筑上的灯 */
  for (const [x, y, z, kind] of anchors) {
    if (kind === 'lantern') {
      addLantern(x, y, z, { size: 0.72, kind });
      waterLamps.push([x, 2.2, z, '#ffbe7e', 1.4, 11]);
    } else if (kind === 'lamp') {
      addStoneLamp(x, y - 1.6, z, 2.4);
    } else if (kind === 'interior') {
      const sp = haloSprite('#ffb068', 7.6, { opacity: 0.72 });
      sp.position.set(x, y, z);
      sp.name = 'halos';
      grp.add(sp);
      lanterns.push({ sprite: sp, base: 0.9, phase: rand() * 6.28, kind });
    } else if (kind === 'arch') {
      addLantern(x, y, z, { size: 0.6, kind });
      waterLamps.push([x, groundAt(x, z) + 0.4, z, '#ffb068', 1.6, 12]);
    } else if (kind === 'caveLamp') {
      const sp = haloSprite('#ff9f5c', 6.2, { opacity: 0.66 });
      sp.position.set(x, y, z);
      sp.name = 'halos';
      grp.add(sp);
      lanterns.push({ sprite: sp, base: 0.8, phase: rand() * 6.28, kind });
    } else if (kind === 'stoneLamp') {
      const sp = haloSprite('#ffd6a6', 5.4, { opacity: 0.55 });
      sp.position.set(x, y, z);
      sp.name = 'halos';
      grp.add(sp);
      lanterns.push({ sprite: sp, base: 0.7, phase: rand() * 6.28, kind });
    } else if (kind === 'crack') {
      // 一线天：缝里一条竖光，不做灯形
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 12), glow('#ffd9b0', 1.15));
      bar.position.set(x, y + 5, z);
      bar.rotation.y = Math.PI / 2;
      bar.name = 'spill';
      grp.add(bar);
      const sp = haloSprite('#ffc48c', 9, { opacity: 0.6 });
      sp.position.set(x, y + 5.5, z);
      sp.name = 'halos';
      grp.add(sp);
      lanterns.push({ sprite: sp, bar, base: 1, phase: rand() * 6.28, kind });
    } else if (kind === 'carveLamp') {
      const sp = haloSprite('#cfe0ea', 3.4, { map: HALO('206,226,240', 0.05), opacity: 0.42 });
      sp.position.set(x, y, z);
      sp.name = 'halos';
      grp.add(sp);
      lanterns.push({ sprite: sp, base: 0.5, phase: rand() * 6.28, kind: 'carve' });
    }
  }

  /* ------------------------------------------------------------- 塔灯 */
  const towerHalo = [];
  for (const tier of towerTiers) {
    const sp = haloSprite('#ffcb92', 5.2 + tier.index * 0.16, { opacity: 0.5 });
    sp.position.set(SITE.pagoda.x, tier.y + 1.3, SITE.pagoda.z);
    sp.name = 'halos';
    grp.add(sp);
    towerHalo.push({ sprite: sp, tier });
    waterLamps.push([SITE.pagoda.x, RESERVOIR.y, SITE.pagoda.z + tier.index * 0.4 - 2,
      '#ffcb92', 1.2 + tier.index * 0.1, 9 + tier.index]);
  }
  // 塔门（第一层朝南）那一盏要能照到地面
  {
    const l = new THREE.PointLight(0xffc188, 320, 60, 2);
    l.position.set(SITE.pagoda.x, groundAt(SITE.pagoda.x, SITE.pagoda.z + 5) + 3.4, SITE.pagoda.z + 5.4);
    grp.add(l);
    realLights.push({ light: l, base: 320, kind: 'tower' });
  }

  /* ------------------------------------------------------- 海上与滩上的火 */
  const fish = [];
  for (let i = 0; i < 26; i++) {
    const east = rand() > 0.42;
    const x = east ? rr(1500, 5200) : rr(-5400, -1600);
    const z = rr(-3600, 3600);
    if (Math.abs(x) < 1500) continue;
    const sp = haloSprite(east ? '#bfe4f2' : '#ffd2a0', rr(0.008, 0.017),
      { map: HALO(east ? '196,230,246' : '255,206,150', 0.05), opacity: rr(0.4, 0.8), att: false });
    sp.position.set(x, 1.6, z);
    sp.name = 'glints';
    grp.add(sp);
    fish.push({ sprite: sp, x, z, vy: rr(0.04, 0.12) * (east ? 1 : -1), phase: rand() * 6.28 });
  }
  // 大堤一线灯：拦住海的那条土埂
  for (const [x, y, z] of causewayLamps) {
    const sp = haloSprite('#cfe6f0', 0.011, { map: HALO('200,228,240', 0.05), opacity: 0.5, att: false });
    sp.position.set(x, y, z);
    sp.name = 'glints';
    grp.add(sp);
    waterLamps.push([x, 0.4, z, '#a8d2e4', 1.1, 8]);
  }
  // 旧海岸线上的一串：街市的暖
  for (const [x, y, z] of shoreLamps) {
    const sp = haloSprite('#ffb877', 0.013, { opacity: 0.62, att: false });
    sp.position.set(x, y, z);
    sp.name = 'glints';
    grp.add(sp);
    if (Math.abs(y - 0) < 8) waterLamps.push([x, 1.2, z, '#ffb877', 1.4, 10]);
  }
  for (const [x, y, z] of townLamps) {
    const sp = haloSprite('#ffc084', 0.008, { opacity: 0.5, att: false });
    sp.position.set(x, y, z);
    sp.name = 'glints';
    grp.add(sp);
  }

  /* ------------------------------------------------------------ 实体件 */
  if (posts.length) grp.add(mesh(posts, M.stone));
  if (shells.length) grp.add(mesh(shells, M.lantern));

  /* -------------------------------------------------------- 真灯（少量） */
  const lamps = [
    ['temple', SITE.temple.x - 4, 302, SITE.temple.z, 0xffb26a, 430, 90],
    ['templeLoft', SITE.temple.x + 30, 306, SITE.temple.z, 0xffcf94, 260, 70],
    ['gate', SITE.gate.x, 8, SITE.gate.z, 0xffb265, 300, 60],
    ['bridge', SITE.bridge.x, bridge ? bridge.bed + 3.2 : 6, SITE.bridge.z, 0xff9f5e, 240, 46],
    ['cave', SITE.cave.x - 16, 202, SITE.cave.z, 0xffd2a4, 1700, 120],
    ['cliff', SITE.cave.x - 44, 232, SITE.cave.z + 10, 0x9fc0dc, 2200, 190],
    ['southgate', SITE.southgate.x, 512, SITE.southgate.z, 0xffb26a, 260, 52],
    ['boulder', SITE.boulders.x, 320, SITE.boulders.z, 0xffd0a2, 240, 44],
    ['peak', SITE.peak.x, 628, SITE.peak.z, 0xffe0b8, 200, 40],
  ];
  for (const [kind, x, y, z, color, intensity, dist] of lamps) {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    // 给定的高度是设计过的眼高，坡面只用来兜住别把灯埋进山
    l.position.set(x, Math.max(y, groundAt(x, z) + 2.2), z);
    grp.add(l);
    realLights.push({ light: l, base: intensity, kind });
  }

  /* ------------------------------------------------- 摩崖题刻的打亮开关 */
  const carvingSheets = carvings.map((c) => ({ ...c, mat: c.mesh.material }));

  return {
    group: grp, lanterns, pathLamps, waterLamps, realLights, fish, towerHalo, carvingSheets,
    setLantern(v) {
      for (const l of lanterns) l.gain = v;
      for (const p of pathLamps) p.gain = v;
    },
    setClimb(t) {
      const upto = clamp01(t);
      for (const p of pathLamps) p.on = p.frac <= upto + 0.001;
    },
    setTower(t) {
      const upto = clamp01(t) * towerTiers.length;
      for (const h of towerHalo) {
        const k = clamp01(upto - h.tier.index);
        h.tier.mesh.visible = k > 0.02;
        h.tier.mat.color.setRGB(1 * k, 0.82 * k, 0.63 * k);
        h.tier.mesh.material = h.tier.mat;
        h.sprite.visible = k > 0.02;
        h.sprite.material.opacity = 0.5 * k;
      }
    },
    setCarvings(on) {
      for (const c of carvingSheets) {
        c.mat.emissiveIntensity = on ? 0.62 : 0.05;
      }
    },
    update(t, gain) {
      for (const l of lanterns) {
        const flick = 0.86 + 0.14 * Math.sin(t * 1.5 + l.phase) + 0.05 * Math.sin(t * 4.3 + l.phase * 1.7);
        const k = (l.gain ?? 1) * gain * flick;
        if (l.sprite) l.sprite.material.opacity = (l.base || 1) * 0.8 * k;
        if (l.flame) l.flame.material = glow('#ffcf9a', 1.2 * Math.max(0.05, k));
        if (l.bar) l.bar.material = glow('#ffd9b0', 1.15 * Math.max(0.05, k));
      }
      for (const p of pathLamps) {
        const on = p.on ? 1 : 0;
        const flick = 0.88 + 0.12 * Math.sin(t * 1.9 + p.phase);
        const k = on * (p.gain ?? 1) * gain * flick;
        p.sprite.visible = k > 0.02;
        p.sprite.material.opacity = 0.78 * k;
        p.core.visible = k > 0.02;
      }
      for (const f of fish) {
        const drift = Math.sin(t * 0.08 + f.phase);
        f.sprite.position.z = f.z + drift * 40;
        f.sprite.material.opacity = (0.3 + 0.28 * Math.sin(t * 0.7 + f.phase)) * (0.6 + 0.4 * gain);
      }
      for (const r of realLights) {
        const isLantern = r.kind !== 'tower';
        r.light.intensity = r.base * gain * (isLantern ? 0.9 + 0.1 * Math.sin(t * 1.7) : 1);
      }
    },
  };
}
