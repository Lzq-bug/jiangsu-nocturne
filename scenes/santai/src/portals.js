import * as THREE from 'three';

import { LAYOUT } from './architecture.js';
import { terrainH } from './environment.js';
import { TOWER } from './layout.js';

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

export function buildPortals(scene, rig, car) {
  const gy = terrainH(TOWER.x, TOWER.z);
  const list = [];

  list.push({
    id: 'tower',
    inText: '出塔', outText: '入塔',
    ext: {
      at: LAYOUT.tower.door.clone(),
      pos: [TOWER.x, gy + 2.1, TOWER.z + 13],
      look: [TOWER.x, gy + 2.6, TOWER.z - 2],
    },
    int: {
      at: new THREE.Vector3(TOWER.x, gy + 1.8, TOWER.z + 2.4),
      pos: [TOWER.x, gy + 2.0, TOWER.z + 2.6],
      look: [TOWER.x, gy + 2.7, TOWER.z - 3.8],
    },
  });

  const carPortal = {
    id: 'car',
    inText: '下车', outText: '上车',
    ext: { at: new THREE.Vector3(), pos: [0, 0, 0], look: [0, 0, 0] },
    int: { at: new THREE.Vector3(), pos: [0, 0, 0], look: [0, 0, 0] },
    follow: true,
  };
  list.push(carPortal);

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

  /** 车厢在动，进出点每帧跟着车头算一次 */
  function syncCar() {
    const c = car;
    const side = new THREE.Vector3(1.6, 1.5, 0).applyQuaternion(c.quaternion);
    const fwd = new THREE.Vector3(0, 1.4, 0).applyQuaternion(c.quaternion);
    const world = c.position.clone().add(side).add(fwd);
    carPortal.ext.at.copy(world);
    carPortal.ext.pos = [world.x + 3.2, world.y + 0.6, world.z + 2.2];
    carPortal.ext.look = [world.x, world.y, world.z];
    const inner = c.position.clone().add(new THREE.Vector3(0, 1.5, 0).applyQuaternion(c.quaternion));
    carPortal.int.at.copy(inner);
    carPortal.int.pos = [inner.x, inner.y + 0.15, inner.z];
    const front = inner.clone().add(new THREE.Vector3(0, 0, -2.2).applyQuaternion(c.quaternion));
    carPortal.int.look = [front.x, front.y, front.z];
    carPortal.extMesh.position.copy(world);
    carPortal.intMesh.position.copy(inner);
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
        const pose = p.int;
        rig.goTo(pose.pos, pose.look, { animate: true, seconds: 1.3 });
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
      syncCar();
      for (const p of list) {
        const show = space === 'exterior' ? p.extMesh : (p.id === space ? p.intMesh : null);
        const hide = space === 'exterior' ? p.intMesh : p.extMesh;
        if (show) {
          show.visible = true;
          show.rotation.z = t * 0.6;
          const s = 1 + 0.06 * Math.sin(t * 2.4);
          show.scale.setScalar(s);
          const far = camPos.distanceTo(show.position) > 90;
          show.visible = !far;
        }
        if (hide) hide.visible = false;
      }
    },
    onSpace: null,
  };
}
