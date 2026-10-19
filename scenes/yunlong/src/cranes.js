import * as THREE from 'three';
import { glow, lit, rand, clamp01 } from './kit.js';
import * as T from './textures.js';
import { SITES, LAKE } from './data.js';

/**
 * 放鹤。
 * 《放鹤亭记》："云龙山人有二鹤，旦则望西山之缺而放焉，暮则傃东山而归。"
 * 于是这一景的招牌动作就是这两只鹤：从亭前起，朝西边的缺口出去，掠过湖面，
 * 再绕回山这一侧落下。夜里放鹤不是古事，是把记中那句白天做的事挪到月下——
 * 帮助面板里已注明这是写意。
 */

const FLIGHT = [
  [0.00, 'take'],     // 亭前起
  [0.12, 'gap'],      // 出缺口
  [0.34, 'lake'],     // 掠湖
  [0.55, 'turn'],     // 湖心转背
  [0.76, 'side'],     // 沿山北回
  [0.92, 'come'],     // 招鹤亭那边落
];

export function buildCranes(scene) {
  const group = new THREE.Group();
  group.name = 'cranes';

  const path = flightPath();
  const birds = [];
  for (let i = 0; i < 2; i++) {
    const b = crane();
    b.grp.position.copy(path.getPoint(0));
    group.add(b.grp);
    birds.push(b);
  }

  // 月下看鹤，只能看见翅尖与颈上那一线亮
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTex: { value: T.softGlow('230,240,255', 0.04) }, uBright: { value: 0 } },
    vertexShader: `uniform float uBright; varying float vB;
      void main(){ vB = uBright; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(420.0 / max(10.0, -mv.z), 5.0, 42.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vB;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.86,0.9,1.0), t.a*0.5*vB); }`,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.name = 'crane-halos';
  halos.frustumCulled = false;
  halos.renderOrder = 7;
  group.add(halos);

  scene.add(group);

  const state = { on: false, u: 0, speed: 0.055, phase: [0, Math.PI * 0.7] };

  function place(u, b, i, t) {
    const p = path.getPoint(clamp01(u));
    const ahead = path.getPoint(clamp01(u + 0.012));
    b.grp.position.copy(p);
    const dir = ahead.clone().sub(p);
    b.grp.rotation.y = Math.atan2(dir.x, dir.z);
    const bank = Math.sin(u * Math.PI * 3 + i) * 0.16;
    b.grp.rotation.z = bank;
    const flap = Math.sin(t * 5.2 + state.phase[i]);
    b.wingL.rotation.z = 0.18 + flap * 0.62;
    b.wingR.rotation.z = -0.18 - flap * 0.62;
    b.neck.rotation.x = -0.25 + Math.sin(t * 2.4 + i) * 0.08;
    const hp = haloGeo.attributes.position;
    hp.setXYZ(i, p.x, p.y, p.z);
    hp.needsUpdate = true;
  }

  return {
    group,
    path,
    get on() { return state.on; },
    /** 放鹤：snap 用于静帧——直接落到半程，不靠时间推进 */
    release(snap = false) {
      state.on = true;
      state.u = snap ? 0.3 : 0;
      if (snap) {
        place(state.u, birds[0], 0, 0);
        place(state.u - 0.055, birds[1], 1, 0);
        haloMat.uniforms.uBright.value = 1;
      }
    },
    recall() { state.on = false; },
    setProgress(v) {
      state.u = clamp01(v);
      place(state.u, birds[0], 0, 0);
      place(state.u - 0.055, birds[1], 1, 0);
      haloMat.uniforms.uBright.value = 1;
    },
    update(t, dt) {
      if (state.on) {
        state.u += dt * state.speed;
        if (state.u >= 1.06) { state.u = 1.06; state.on = false; }
        place(state.u, birds[0], 0, t);
        place(state.u - 0.055, birds[1], 1, t);
        haloMat.uniforms.uBright.value = clamp01(1.2 - Math.abs(state.u - 0.5) * 1.6);
      } else {
        // 收拢在亭前与泉边：不飞的时候也要在场
        for (let i = 0; i < birds.length; i++) {
          const b = birds[i];
          b.grp.position.copy(i === 0 ? perches[0] : perches[1]);
          b.grp.rotation.set(0, i === 0 ? 1.1 : -2.4, 0);
          const sway = Math.sin(t * 0.8 + i * 2.1) * 0.05;
          b.wingL.rotation.z = 0.06 + sway;
          b.wingR.rotation.z = -0.06 - sway;
          b.neck.rotation.x = -0.1 + Math.sin(t * 0.55 + i) * 0.06;
        }
        const hp = haloGeo.attributes.position;
        hp.setXYZ(0, perches[0].x, perches[0].y + 1.1, perches[0].z);
        hp.setXYZ(1, perches[1].x, perches[1].y + 1.1, perches[1].z);
        hp.needsUpdate = true;
        haloMat.uniforms.uBright.value = 0.25;
      }
    },
  };
}

/** 收羽时两只鹤各立一处：一只在亭前月台外的石上，一只在泉边 */
const P = SITES.pavilion;
const C2 = SITES.callpav;
const perches = [
  new THREE.Vector3(P.x - 7.5, P.y + 0.4, P.z + 6.5),
  new THREE.Vector3(C2.x + 3.4, C2.y + 0.3, C2.z - 3.2),
];

/**
 * 航线：亭前起 → 向西出缺口 → 掠过湖心（高度压到水面之上十几米）
 * → 湖心转背向北 → 沿山北回 → 招鹤亭那边落。
 * 缺口在西，故整条线以 -X 为主方向。
 */
function flightPath() {
  const start = new THREE.Vector3(P.x - 6, P.y + 6, P.z + 1);
  const gap = new THREE.Vector3(P.x - 60, P.y + 14, P.z - 8);
  const out = new THREE.Vector3(-620, 34, -140);
  const lake = new THREE.Vector3(-900, 20, -230);
  const turn = new THREE.Vector3(-880, 26, 60);
  const north = new THREE.Vector3(-520, 44, 210);
  const side = new THREE.Vector3(-190, 40, 230);
  const come = new THREE.Vector3(-90, 26, 120);
  const end = new THREE.Vector3(C2.x + 4, C2.y + 5, C2.z + 2);
  return new THREE.CatmullRomCurve3(
    [start, gap, out, lake, turn, north, side, come, end], false, 'catmullrom', 0.16,
  );
}

/** 一只鹤：白石的身体、长颈、两条拖在后面的腿、两片会扇的翅 */
function crane() {
  const grp = new THREE.Group();
  const white = lit('#cdd6d6', {
    map: T.canopy(), rough: 0.82, side: THREE.DoubleSide,
    emissive: '#2a333c', ei: 0.55,
  });
  const dark = lit('#20262c', { rough: 0.8, emissive: '#0c1014', ei: 0.5 });

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 9).scale(1.5, 0.78, 0.72), white,
  );
  grp.add(body);

  const neck = new THREE.Group();
  const neckMesh = new THREE.Mesh(
    merge([
      new THREE.CylinderGeometry(0.1, 0.13, 1.25, 7).rotateX(1.15).translate(0, 0.42, 0.6),
      new THREE.SphereGeometry(0.15, 9, 7).translate(0, 0.72, 1.16),
      new THREE.ConeGeometry(0.06, 0.52, 6).rotateX(-Math.PI / 2).translate(0, 0.72, 1.5),
      new THREE.SphereGeometry(0.055, 6, 5).translate(0.1, 0.78, 1.2),
      new THREE.SphereGeometry(0.055, 6, 5).translate(-0.1, 0.78, 1.2),
    ]), white,
  );
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 6).rotateX(-Math.PI / 2), dark);
  beak.position.set(0, 0.72, 1.72);
  neck.add(neckMesh, beak);
  neck.position.set(0, 0.24, 0.42);
  grp.add(neck);

  const legs = new THREE.Mesh(merge([
    new THREE.CylinderGeometry(0.035, 0.028, 1.15, 5).rotateX(1.42).translate(0.12, -0.28, -0.42),
    new THREE.CylinderGeometry(0.035, 0.028, 1.15, 5).rotateX(1.42).translate(-0.12, -0.28, -0.46),
  ]), dark);
  grp.add(legs);

  // 尾：一撮下垂的黑羽
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 6).rotateX(1.6), dark);
  tail.position.set(0, 0.02, -0.72);
  grp.add(tail);

  const wing = (side) => {
    const g = new THREE.PlaneGeometry(2.0, 0.72, 4, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, -0.1 * Math.pow(Math.abs(x), 1.6));       // 后掠
      p.setY(i, p.getY(i) * (1 - Math.abs(x) / 2.6));     // 外窄内宽
    }
    g.computeVertexNormals();
    g.translate(side * 1.0, 0, -0.05);
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(g, white);
    m.castShadow = false;
    const tips = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5).translate(side * 1.62, -0.06, -0.1), dark,
    );
    pivot.add(m, tips);
    pivot.rotation.z = side > 0 ? -0.18 : 0.18;
    grp.add(pivot);
    return pivot;
  };
  const wingL = wing(-1);
  const wingR = wing(1);

  grp.scale.set(1.05, 1.05, 1.05);
  return { grp, neck, wingL, wingR };
}

function merge(list) {
  const merged = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  let o = 0;
  for (const g of list) {
    const a = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o);
    o += a.count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setIndex(idx);
  return merged;
}
