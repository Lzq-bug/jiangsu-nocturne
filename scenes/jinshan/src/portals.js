import * as THREE from 'three';

import { LAYOUT } from './architecture.js';
import { terrainH } from './environment.js';
import { TOWER, AXIS, POOL } from './layout.js';

/** 门前的一圈光环：点它或走近按 E 就穿进去 */
function ring(color) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.09, 8, 28),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4), toneMapped: false, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.renderOrder = 10;
  return m;
}

function label(text, color = '#cfe6ff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,14,24,0.55)';
  x.fillRect(0, 0, 256, 64);
  x.strokeStyle = 'rgba(160,200,235,0.5)'; x.lineWidth = 2;
  x.strokeRect(3, 3, 250, 58);
  x.fillStyle = color;
  x.font = '600 30px "Songti SC","Microsoft YaHei",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, fog: false }));
  s.material.toneMapped = false;
  s.scale.set(1.7, 0.42, 1);
  s.renderOrder = 21;
  return s;
}

/** 按局部坐标推世界坐标：殿与塔都带一个朝向 */
function at(yaw, lx, ly, lz, origin) {
  return new THREE.Vector3(lx, ly, lz)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .add(origin);
}

export function buildPortals(scene, rig, boat) {
  const list = [];

  /* 慈寿塔：门在塔的北侧，进去是盘梯的起点 */
  const tg = terrainH(TOWER.x, TOWER.z);
  const towerDoor = LAYOUT.tower.door.clone();
  list.push({
    id: 'tower',
    inText: '出塔', outText: '入塔',
    ext: {
      at: towerDoor.clone(),
      pos: [towerDoor.x, tg + 1.7, towerDoor.z - 4.2],
      look: [towerDoor.x, tg + 3.0, towerDoor.z + 1.5],
    },
    int: {
      at: new THREE.Vector3(TOWER.x, tg + 1.7, TOWER.z - 2.6),
      pos: [TOWER.x, tg + 1.7, TOWER.z - 2.6],
      look: [TOWER.x, tg + 3.4, TOWER.z + 4.4],
    },
  });

  /* 大雄宝殿：正面朝西，进门往东看是佛龛那一头 */
  const yaw = -Math.PI / 2;
  const hg = terrainH(AXIS.hall2.x, AXIS.hall2.z);
  const origin = new THREE.Vector3(AXIS.hall2.x, hg, AXIS.hall2.z);
  const base = 1.5;
  const dOut = at(yaw, 0, base + 1.7, AXIS.hall2.d / 2 + 4.4, origin);
  const inFront = at(yaw, 0, base + 1.7, AXIS.hall2.d / 2 - 1.6, origin);
  const toShrine = at(yaw, 0, base + 2.3, -AXIS.hall2.d / 2 + 2.6, origin);
  list.push({
    id: 'hall',
    inText: '出殿', outText: '进殿',
    ext: {
      at: LAYOUT.hall.door.clone(),
      pos: [dOut.x, dOut.y, dOut.z],
      look: [inFront.x, inFront.y + 0.6, inFront.z],
    },
    int: {
      at: inFront.clone(),
      pos: [inFront.x, inFront.y, inFront.z],
      look: [toShrine.x, toShrine.y, toShrine.z],
    },
  });

  /* 画舫：船在轻轻晃，进出点每帧跟着船头算 */
  const boatPortal = {
    id: 'boat',
    inText: '下船', outText: '上船',
    ext: { at: new THREE.Vector3(POOL.x, 0, POOL.z), pos: [0, 1, 0], look: [0, 1, 0] },
    int: { at: new THREE.Vector3(), pos: [0, 1, 0], look: [0, 1, 0] },
    follow: true,
  };
  list.push(boatPortal);

  const grp = new THREE.Group();
  scene.add(grp);
  for (const p of list) {
    p.extMesh = ring('#8fd8ff');
    p.extMesh.add(label(p.outText));
    p.intMesh = ring('#ffd39a');
    p.intMesh.add(label(p.inText, '#ffe6bf'));
    p.extMesh.position.copy(p.ext.at);
    p.intMesh.position.copy(p.int.at);
    grp.add(p.extMesh, p.intMesh);
  }

  let space = 'exterior';

  /** 船在水上轻轻起伏，舱门口的环要一直贴住船 */
  function syncBoat() {
    const c = boat;
    const side = new THREE.Vector3(1.5, 1.4, 0).applyQuaternion(c.quaternion);
    const fwd = new THREE.Vector3(0, 1.2, 0).applyQuaternion(c.quaternion);
    const world = c.position.clone().add(side).add(fwd);
    boatPortal.ext.at.copy(world);
    boatPortal.ext.pos = [world.x + 2.6, world.y + 0.5, world.z + 2.0];
    boatPortal.ext.look = [world.x, world.y, world.z];
    const inner = c.position.clone().add(new THREE.Vector3(0, 1.5, 0).applyQuaternion(c.quaternion));
    boatPortal.int.at.copy(inner);
    boatPortal.int.pos = [inner.x, inner.y + 0.1, inner.z];
    const ahead = inner.clone().add(new THREE.Vector3(0, 0, -2.4).applyQuaternion(c.quaternion));
    boatPortal.int.look = [ahead.x, ahead.y, ahead.z];
    boatPortal.extMesh.position.copy(world);
    boatPortal.intMesh.position.copy(inner);
  }

  return {
    get space() { return space; },
    nearest(camPos) {
      let best = null, bd = 5.2;
      for (const p of list) {
        const m = space === 'exterior' ? p.ext : (space === p.id ? p.int : null);
        if (!m) continue;
        const d = camPos.distanceTo(m.at);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    use(p) {
      if (!p) return;
      if (space === 'exterior') {
        space = p.id;
        rig.goTo(p.int.pos, p.int.look, { animate: true, seconds: 1.3 });
      } else {
        const back = p.ext;
        space = 'exterior';
        rig.goTo(back.pos, back.look, { animate: true, seconds: 1.3 });
      }
      if (this.onSpace) this.onSpace(space);
    },
    pick(ndc, camera) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const targets = space === 'exterior' ? list.map((p) => p.extMesh) : list.filter((p) => p.id === space).map((p) => p.intMesh);
      const hits = ray.intersectObjects(targets, true);
      for (const h of hits) {
        let o = h.object;
        while (o && o.parent && o.parent !== grp) o = o.parent;
        const p = list.find((q) => q.extMesh === o || q.intMesh === o);
        if (p) return p;
      }
      return null;
    },
    update(t, camPos) {
      syncBoat();
      for (const p of list) {
        const show = space === 'exterior' ? p.extMesh : (p.id === space ? p.intMesh : null);
        const hide = space === 'exterior' ? p.intMesh : p.extMesh;
        if (show) {
          show.visible = true;
          show.rotation.z = t * 0.6;
          const s = 1 + 0.06 * Math.sin(t * 2.4);
          show.scale.setScalar(s);
          show.visible = camPos.distanceTo(show.position) <= 90;
        }
        if (hide) hide.visible = false;
      }
    },
    onSpace: null,
  };
}
