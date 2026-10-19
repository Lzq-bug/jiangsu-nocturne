import * as THREE from 'three';
import { LAYOUT } from './architecture.js';
import { terrainH } from './environment.js';
import { LIGHTHOUSE, BERTHS, QUAY } from './layout.js';

/**
 * 穿门：两座进得去的门——港池口门的灯塔门，和跟着泊位起落的船门。
 * 门前一圈加性光环，点它或走近按 E 都能穿过去；进了室内，门换成"出来"那一圈。
 *
 * 灯室地坪 = focal - 2.05、船体局部原点→甲板面 = DECK，两处与 interiors.js 同一算法：
 * 船的内部挂成船的子节点，门要落回同一个位置。
 */
const OPTIC_Y = LIGHTHOUSE.focal;
const FLOOR_Y = OPTIC_Y - 2.05;
const DECK = 0.68;
const EYE = 1.35;
/** 按 E 进出的距离阈值，与光环的可见距离 */
const NEAR = 5.2;
const FAR = 90;
const UP = new THREE.Vector3(0, 1, 0);

/** 门前的一圈光环：additive，吃 bloom */
function ring(color, r = 1.15) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.09, 8, 28),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4), toneMapped: false, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.renderOrder = 10;
  return m;
}

function label(text, color = '#cfe6ff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(6,16,26,0.55)';
  x.fillRect(0, 0, 256, 64);
  x.strokeStyle = 'rgba(150,200,235,0.5)'; x.lineWidth = 2;
  x.strokeRect(3, 3, 250, 58);
  x.fillStyle = color;
  x.font = '600 30px "Songti SC","Microsoft YaHei",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, fog: false }));
  s.material.toneMapped = false;
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 21;
  return s;
}

/**
 * 一侧门 = 朝向 + 环 + 牌子。灯室与船的门口都竖着立，牌子浮在环上方。
 */
function door(color, text, plateColor, { yaw = 0, r = 1.15 } = {}) {
  const g = new THREE.Group();
  const m = ring(color, r);
  const s = label(text, plateColor);
  s.position.set(0, 1.5, 0);
  g.add(m, s);
  g.rotation.y = yaw;
  g.userData = { ring: m, plate: s };
  return g;
}

export function buildPortals(scene, rig, lead) {
  const boat = lead && lead.isObject3D ? lead : (lead && lead.obj && lead.obj.isObject3D ? lead.obj : null);
  const list = [];

  /* ------------------------------------------------------------ 灯塔门 */
  const base = LAYOUT.tower && LAYOUT.tower.pos ? LAYOUT.tower.pos : new THREE.Vector3(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
  const ground = terrainH(base.x, base.z);
  const doorAt = LAYOUT.tower && LAYOUT.tower.door
    ? LAYOUT.tower.door.clone()
    : new THREE.Vector3(base.x, ground + 1.35, base.z + 2.4);
  // 门的朝向：拿不到就朝海（+Z），口门的红绿灯桩就在那一侧
  const out = doorAt.clone().sub(base);
  out.y = 0;
  if (out.lengthSq() < 0.4) out.set(0, 0, 1);
  out.normalize();
  const outYaw = Math.atan2(out.x, out.z);
  const standAt = new THREE.Vector3(doorAt.x + out.x * 5.2, 0, doorAt.z + out.z * 5.2);
  // 门槛约在门中心之下 1.45（D 组那道门框高 3.2）；堤顶与墩台顶取高的那个，再抬一眼人高
  const standY = Math.max(doorAt.y - 1.45, terrainH(standAt.x, standAt.z)) + 1.7;

  list.push({
    id: 'tower',
    ext: {
      at: doorAt.clone(),
      pos: [standAt.x, standY, standAt.z],
      look: [base.x, OPTIC_Y, base.z],       // 站在堤上门前，抬头就是灯
      yaw: outYaw,
    },
    int: {
      // 内侧那一圈朝着门，立在凳子与舱口之间，比透镜低——转着的镜片扫不到相机
      at: new THREE.Vector3(base.x + Math.sin(outYaw) * 1.45, FLOOR_Y + 1.0, base.z + Math.cos(outYaw) * 1.45),
      pos: [base.x + 0.55, FLOOR_Y + 1.18, base.z - 1.3],    // 坐在值夜的那条凳子上
      look: [base.x - 0.15, OPTIC_Y + 0.45, base.z + 2.6],   // 抬头穿过透镜看口门
      yaw: outYaw + Math.PI,
    },
  });

  /* ---------------------------------------------------------------- 船门 */
  const berthDoor = LAYOUT.berth && LAYOUT.berth.door
    ? LAYOUT.berth.door.clone()
    : new THREE.Vector3(BERTHS.x + 26, QUAY.top + 1.0, BERTHS.z + 12);
  const boatPortal = {
    id: 'boat',
    ext: { at: berthDoor.clone(), pos: [berthDoor.x, berthDoor.y + 1.7, berthDoor.z], look: [berthDoor.x + 1.5, berthDoor.y + 1.0, berthDoor.z + 2] },
    int: { at: berthDoor.clone(), pos: [berthDoor.x, berthDoor.y + 1.5, berthDoor.z], look: [berthDoor.x, berthDoor.y + 1.3, berthDoor.z + 3] },
    follow: true,
  };
  list.push(boatPortal);

  /* -------------------------------------------------------------- 光环 */
  const grp = new THREE.Group();
  scene.add(grp);
  for (const p of list) {
    const tight = !!p.follow;          // 船里的地方窄，环收小一点
    p.extMesh = door('#8fd8ff', p.id === 'tower' ? '入灯室' : '上船', '#cfe6ff', { yaw: p.ext.yaw || 0, r: tight ? 0.85 : 1.15 });
    p.intMesh = door('#ffd39a', p.id === 'tower' ? '出灯室' : '回码头', '#ffe6bf', { yaw: p.int.yaw || 0, r: tight ? 0.7 : 0.92 });
    p.extMesh.position.copy(p.ext.at);
    p.intMesh.position.copy(p.int.at);
    grp.add(p.extMesh, p.intMesh);
  }

  let space = 'exterior';
  let lastT = 0;
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _bow = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _tmp = new THREE.Vector3();

  /**
   * 船的进出点每帧跟着船重算：泊位上的船随潮位起落，解缆之后还会走。
   * 局部偏移是定死的（驾驶室后门那一侧、甲板面之上），套的是船当帧的世界姿态，
   * 所以艏向、横摇、随潮位的起伏一并跟得上；没有船就落回泊位门 + 潮位。
   */
  function syncBoat(level) {
    if (!boat || !boat.isObject3D) {
      const at = _tmp.copy(berthDoor);
      at.y = berthDoor.y + (level || 0);
      boatPortal.ext.at.copy(at);
      boatPortal.int.at.copy(at);
      boatPortal.ext.pos = [at.x, at.y + 1.7, at.z];
      boatPortal.ext.look = [at.x + 1.5, at.y + 1.0, at.z + 2];
      boatPortal.int.pos = [at.x, at.y + 1.5, at.z];
      boatPortal.int.look = [at.x, at.y + 1.3, at.z + 3];
      boatPortal.extMesh.position.copy(at);
      boatPortal.intMesh.position.copy(at);
      return;
    }
    boat.updateWorldMatrix(true, false);
    boat.getWorldPosition(_p);
    boat.getWorldQuaternion(_q);
    _bow.set(0, 0, 1).applyQuaternion(_q);          // 与 interiors 一致：船的局部 +Z 是艏
    _right.crossVectors(UP, _bow);
    // 靠码头那一侧：朝着泊位门的那一边
    _tmp.copy(berthDoor).sub(_p).setY(0);
    const s = _tmp.dot(_right) >= 0 ? 1 : -1;

    const at = _p.clone()
      .addScaledVector(_right, s * 0.95)
      .addScaledVector(_bow, -0.45)
      .addScaledVector(UP, DECK + 0.95);
    boatPortal.ext.at.copy(at);
    boatPortal.extMesh.position.copy(at);
    // 环面朝码头那一侧，随船的艏向一起转
    boatPortal.extMesh.rotation.set(0, Math.atan2(_right.x * s, _right.z * s), 0);

    const stand = at.clone().addScaledVector(_right, s * 1.9);
    boatPortal.ext.pos = [stand.x, at.y + 0.65, stand.z];
    boatPortal.ext.look = [at.x + _bow.x * 2.5, at.y + 0.1, at.z + _bow.z * 2.5];

    // 门内：站在舵轮后面，眼睛朝艏看出去
    const eye = _p.clone()
      .addScaledVector(_bow, -0.2)
      .addScaledVector(UP, DECK + EYE);
    boatPortal.int.at.copy(eye);
    boatPortal.int.pos = [eye.x, eye.y, eye.z];
    const fwd = eye.clone().addScaledVector(_bow, 6).addScaledVector(UP, -0.35);
    boatPortal.int.look = [fwd.x, fwd.y, fwd.z];
    boatPortal.intMesh.position.copy(eye);
    boatPortal.intMesh.rotation.set(0, Math.atan2(-_bow.x, -_bow.z), 0);   // 身后那一圈朝艏
  }

  return {
    get space() { return space; },

    /** 走近了按 E：只认当前空间里那一侧的门 */
    nearest(camPos) {
      let best = null, bd = NEAR;
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
        rig.goTo(p.ext.pos, p.ext.look, { animate: true, seconds: 1.3 });
        space = 'exterior';
      }
      if (this.onSpace) this.onSpace(space);
    },

    pick(ndc, camera) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const targets = space === 'exterior'
        ? list.map((p) => p.extMesh)
        : list.filter((p) => p.id === space).map((p) => p.intMesh);
      const hits = ray.intersectObjects(targets, true);
      for (const h of hits) {
        let o = h.object;
        while (o && o.parent && o.parent !== grp) o = o.parent;
        const p = list.find((q) => q.extMesh === o || q.intMesh === o);
        if (p) return p;
      }
      return null;
    },

    update(t, camPos, level) {
      syncBoat(level);
      // 人在船里就跟着船走：船一解缆，泊位上那扇门一路追着驾驶室
      const dt = Math.min(0.05, Math.max(0.001, t - lastT));
      lastT = t;
      if (space === 'boat' && boat && boat.isObject3D && rig && !rig.travel && rig.pos) {
        const k = Math.min(1, dt * 4.5);
        rig.pos.x += (boatPortal.int.pos[0] - rig.pos.x) * k;
        rig.pos.y += (boatPortal.int.pos[1] - rig.pos.y) * k;
        rig.pos.z += (boatPortal.int.pos[2] - rig.pos.z) * k;
      }
      for (const p of list) {
        const show = space === 'exterior' ? p.extMesh : (p.id === space ? p.intMesh : null);
        const hide = space === 'exterior' ? p.intMesh : p.extMesh;
        if (hide) hide.visible = false;     // 内外两圈互斥，不然站在灯室里会看见自己的门
        if (!show) continue;
        const far = camPos.distanceTo(show.position) > FAR;
        show.visible = !far;
        if (far) continue;
        const m = show.userData.ring;
        m.rotation.z = t * 0.6;
        m.scale.setScalar(1 + 0.06 * Math.sin(t * 2.4));
      }
    },

    onSpace: null,
  };
}
