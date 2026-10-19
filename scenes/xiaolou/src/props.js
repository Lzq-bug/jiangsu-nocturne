import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, stringPath, figureGeo, rand, rr, PAL } from './kit.js';
import * as T from './textures.js';
import { LANE, lanePoint, laneHW, centerZ, slope } from './plan.js';

/**
 * 巷内陈设：跨巷灯串、檐下灯笼、招幌、夜游的人。
 * 花灯彩灯与灯光秀是 2019 年开街后的节令做法【现代新增】，
 * 这里按夜景需要排布，位置非历史原状。
 */

const MAX_LAMPS = 320;
const MAX_CROWD = 260;

function lanternGeo(scale = 1) {
  const body = new THREE.SphereGeometry(0.24 * scale, 10, 8);
  body.scale(1, 1.22, 1);
  const cap = new THREE.CylinderGeometry(0.1 * scale, 0.13 * scale, 0.08 * scale, 8);
  cap.translate(0, 0.3 * scale, 0);
  const foot = new THREE.CylinderGeometry(0.09 * scale, 0.06 * scale, 0.07 * scale, 8);
  foot.translate(0, -0.31 * scale, 0);
  return mergeGeometries([body, cap, foot]);
}

/** 跨巷灯串：两端挂在两侧檐口，中间垂下去 */
function strings(scene, count) {
  const grp = new THREE.Group();
  scene.add(grp);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a2f3d });
  const spots = [];
  const step = (LANE.xTo - LANE.xFrom) / count;
  for (let i = 0; i < count; i++) {
    const x = LANE.xFrom + step * (i + 0.5) + rr(-1.2, 1.2);
    const hw = laneHW(x);
    const y = rr(3.75, 4.6);
    const a = lanePoint(x, -(hw + 0.2));
    const b = lanePoint(x + rr(-0.6, 0.6), hw + 0.2);
    const from = new THREE.Vector3(a.x, y, a.z);
    const to = new THREE.Vector3(b.x, y - rr(-0.3, 0.5), b.z);
    const path = stringPath(from, to, rr(0.5, 1.1), 16);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 14, 0.02, 4, false), wireMat);
    grp.add(tube);
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / (n + 1);
      const p = path[Math.round(t * (path.length - 1))];
      spots.push({ p: p.clone(), hang: rr(0.26, 0.42), phase: rand() * 6.28, scale: rr(0.8, 1.15) });
    }
    if (i % 8 === 0) {
      const mid = path[Math.floor(path.length / 2)];
      const light = new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 3.2, 13, 2.2);
      light.position.copy(mid).add(new THREE.Vector3(0, -0.5, 0));
      grp.add(light);
    }
  }
  return { grp, spots };
}

/** 檐下灯笼：houses.js 给的锚点，实例化挂上去 */
function eaveLanterns(scene, anchors) {
  const geo = lanternGeo(1);
  const mat = new THREE.MeshBasicMaterial({ map: T.lanternPaper(), color: 0xffffff, toneMapped: false, fog: false });
  mat.color.setRGB(0.86, 0.6, 0.32);
  const list = anchors.filter((a) => a.y > 2.2).slice(0, MAX_LAMPS);
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const base = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const s = a.big ? 0.9 : 0.62;
    dummy.position.set(a.x, a.y - 0.42 * s, a.z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    base.push({ p: new THREE.Vector3(a.x, a.y - 0.42 * s, a.z), s, phase: rand() * 6.28, big: !!a.big });
  }
  scene.add(mesh);
  return { mesh, base, dummy };
}

/** 招幌与布幔：一面面小旗挂在檐下，风里轻轻摆 */
function banners(scene) {
  const grp = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c9b78f'), roughness: 0.95, side: THREE.DoubleSide,
    emissive: new THREE.Color('#241d14'), emissiveIntensity: 0.15,
  });
  const parts = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const x = LANE.xFrom + rr(6, LANE.xTo - LANE.xFrom - 6);
    const side = rand() > 0.5 ? 1 : -1;
    const p = lanePoint(x, side * (laneHW(x) - 0.15));
    const g = new THREE.PlaneGeometry(rr(0.5, 0.8), rr(1.3, 2.0));
    g.translate(p.x, rr(3.2, 4.2), p.z);
    g.rotateY(Math.atan(slope(x)) * -1 + (side > 0 ? Math.PI : 0));
    parts.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), cloth);
  m.castShadow = true;
  grp.add(m);
  scene.add(grp);
  return { grp, mesh: m };
}

/** 夜游人：沿巷走动的剪影，肩上一盏灯 */
function crowd(scene) {
  const geo = figureGeo(1);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#171c28'), roughness: 0.9,
    emissive: new THREE.Color('#0b1018'), emissiveIntensity: 0.18,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_CROWD);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const people = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < MAX_CROWD; i++) {
    people.push({
      x: rr(LANE.xFrom + 4, LANE.xTo - 4),
      off: rr(-1.2, 1.2),
      v: rr(0.5, 1.15) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * 6.28,
      scale: rr(0.9, 1.08),
      lamp: rand() > 0.72,
    });
    dummy.position.set(0, -99, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
  // 手里那盏灯用一批小亮点跟上，点光源只给少数几个人，免得拖慢
  const lampGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const lampMesh = new THREE.InstancedMesh(lampGeo, glow('#ffcb8a', 2.6), MAX_CROWD);
  lampMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lampMesh.frustumCulled = false;
  scene.add(lampMesh);
  return { mesh, lampMesh, people, dummy };
}

/** 巷口的货摊、条凳、水桶一类，写意摆几处 */
function stalls(scene) {
  const grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3524'), map: T.wood('#3d2a1c', '#221408'), roughness: 0.85 });
  const clothMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9a5b45'), roughness: 0.9, side: THREE.DoubleSide,
    emissive: new THREE.Color('#211208'), emissiveIntensity: 0.15,
  });
  const boards = [];
  const tops = [];
  const spots = [-150, -108, -14, 52, 118, 170];
  for (const x of spots) {
    const side = rand() > 0.5 ? 1 : -1;
    const p = lanePoint(x, side * (laneHW(x) - 0.5));
    const yaw = Math.atan(slope(x)) * -1;
    const w = rr(1.5, 2.2);
    boards.push(new THREE.BoxGeometry(w, 0.1, 0.9).translate(p.x, 0.86, p.z).rotateY(yaw));
    for (const s of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.1, 0.86, 0.1);
      leg.translate(p.x + s * (w / 2 - 0.12), 0.43, p.z);
      leg.rotateY(yaw);
      boards.push(leg);
    }
    const canopy = new THREE.PlaneGeometry(w + 0.6, 1.3);
    canopy.rotateX(-Math.PI / 2 + 0.16);
    canopy.translate(p.x, 2.05, p.z);
    canopy.rotateY(yaw);
    tops.push(canopy);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow('#ffc885', 2.4));
    lamp.position.set(p.x, 1.85, p.z);
    grp.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,180,110', 0.12), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, opacity: 0.8,
    }));
    halo.material.toneMapped = false;
    halo.position.set(p.x, 1.8, p.z);
    halo.scale.setScalar(2.6);
    grp.add(halo);
  }
  grp.add(new THREE.Mesh(mergeGeometries(boards), wood));
  grp.add(new THREE.Mesh(mergeGeometries(tops), clothMat));
  scene.add(grp);
  return grp;
}

export function buildProps(scene, anchors) {
  // 灯下光池：真实光源只给这几处关键位置，其余灯笼只画发光体
  for (const x of [-150, -96, -20, 46, 112, 176]) {
    const p = lanePoint(x, 0);
    const pool = new THREE.PointLight(new THREE.Color('#ffab5e'), 17, 27, 2.0);
    pool.position.set(p.x, 3.3, p.z);
    scene.add(pool);
  }
  const str = strings(scene, 22);
  const eave = eaveLanterns(scene, anchors.concat(str.spots.map((s) => ({ x: s.p.x, y: s.p.y + 0.5, z: s.p.z, big: false }))));
  const ban = banners(scene);
  const ppl = crowd(scene);
  const stallGrp = stalls(scene);

  let lanternLevel = 1;
  const visible = (arr) => Math.floor(arr.length * Math.min(1.6, Math.max(0, lanternLevel)));

  return {
    group: str.grp,
    setLanterns(v) {
      lanternLevel = v;
      eave.mesh.count = visible(eave.base);
      str.grp.visible = v > 0.05;
    },
    update(t, dt, crowdLevel, cameraPos) {
      // 灯串与檐下灯笼的轻微摆动
      const d = eave.dummy;
      const n = eave.mesh.count;
      for (let i = 0; i < n; i++) {
        const b = eave.base[i];
        const sway = Math.sin(t * 0.9 + b.phase) * 0.07;
        d.position.set(b.p.x + sway, b.p.y + Math.sin(t * 1.4 + b.phase) * 0.012, b.p.z);
        d.rotation.set(0, 0, sway * 2.1);
        d.scale.setScalar(b.s);
        d.updateMatrix();
        eave.mesh.setMatrixAt(i, d.matrix);
      }
      eave.mesh.instanceMatrix.needsUpdate = true;

      // 招幌随风
      ban.mesh.rotation.z = Math.sin(t * 0.5) * 0.004;

      // 人流：沿巷走，走到头折回来
      const target = Math.min(MAX_CROWD, Math.floor(crowdLevel));
      const pm = ppl.dummy;
      for (let i = 0; i < MAX_CROWD; i++) {
        const p = ppl.people[i];
        if (i >= target) {
          pm.position.set(0, -99, 0);
          pm.scale.setScalar(0.001);
          pm.updateMatrix();
          ppl.mesh.setMatrixAt(i, pm.matrix);
          ppl.lampMesh.setMatrixAt(i, pm.matrix);
          continue;
        }
        p.x += p.v * dt;
        if (p.x > LANE.xTo - 3 || p.x < LANE.xFrom + 3) p.v *= -1;
        const walk = lanePoint(p.x, p.off + 0.35 * Math.sign(p.v));
        const bob = Math.abs(Math.sin(t * 4.2 + p.phase)) * 0.05;
        pm.position.set(walk.x, bob, walk.z);
        pm.rotation.set(0, Math.atan2(-p.v * Math.cos(Math.atan(slope(p.x))), -p.v * Math.sin(Math.atan(slope(p.x)))), 0);
        pm.scale.setScalar(p.scale);
        pm.updateMatrix();
        ppl.mesh.setMatrixAt(i, pm.matrix);
        if (p.lamp) {
          pm.position.set(walk.x + 0.32, 1.15 + bob, walk.z);
          pm.scale.setScalar(1);
          pm.updateMatrix();
          ppl.lampMesh.setMatrixAt(i, pm.matrix);
        } else {
          pm.position.set(0, -99, 0);
          pm.scale.setScalar(0.001);
          pm.updateMatrix();
          ppl.lampMesh.setMatrixAt(i, pm.matrix);
        }
      }
      ppl.mesh.instanceMatrix.needsUpdate = true;
      ppl.lampMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
