import * as THREE from 'three';
import { CANAL } from './data.js';
import { M, mesh, box, loft, rand, rr } from './kit.js';
import * as T from './textures.js';

/**
 * 夜泊 — the boats on the canal: three made fast to the bank steps, one loaded
 * run that works its way down the reach through the night. Every boat lamp also
 * gets a light column, because on the water the lamp is only half of it.
 */

/** boat plan in the XZ plane, unit half-size: pinched ends, beam amidships */
const PLAN = [
  [1, 0], [0.72, 0.52], [-0.5, 0.5], [-1, 0.16],
  [-0.5, -0.5], [0.72, -0.52],
];

export function buildBoats(scene, columns) {
  const g = new THREE.Group();
  g.name = 'boats';

  const haloPos = [];
  const boats = [];

  function boat(x, z, len, beam, { cover = true, cargo = false, heading = 0 } = {}) {
    const s = new THREE.Group();
    const wood = [], lampGlow = [];
    const B = (w, h, d, bx, yBottom, bz) => wood.push(box(w, h, d, bx, yBottom, bz));

    s.add(mesh(loft([
      { y: 0.12, cx: 0, cz: 0, sx: (len / 2) * 0.62, sz: (beam / 2) * 0.4 },
      { y: 0.62, cx: 0, cz: 0, sx: (len / 2) * 0.93, sz: beam / 2 },
      { y: 1.02, cx: 0, cz: 0, sx: len / 2, sz: (beam / 2) * 0.94 },
    ], PLAN, { uvScale: 1.4 }), M.woodDark));

    // 舷墙 与 舱板
    B(len * 0.98, 0.16, 0.12, 0, 1.0, beam / 2 * 0.9);
    B(len * 0.98, 0.16, 0.12, 0, 1.0, -beam / 2 * 0.9);
    B(len * 0.5, 0.1, beam * 0.86, -len * 0.16, 1.0, 0);

    if (cover) {
      // 船篷 — a half cylinder lying along the hull
      const r = beam * 0.44;
      const canopy = new THREE.CylinderGeometry(r, r, len * 0.42, 10, 1, false, 0, Math.PI);
      canopy.rotateZ(Math.PI / 2);
      canopy.translate(-len * 0.12, 1.04, 0);
      wood.push(canopy);
      for (const sx of [-1, 1]) {
        const ring = new THREE.TorusGeometry(r, 0.05, 6, 12, Math.PI);
        ring.rotateY(Math.PI / 2);
        ring.translate(-len * 0.12 + sx * len * 0.21, 1.04, 0);
        wood.push(ring);
      }
    }
    if (cargo) {
      for (let i = 0; i < 7; i++) {
        B(rr(0.5, 0.8), rr(0.3, 0.46), rr(0.4, 0.66), rr(-len * 0.06, len * 0.3), 1.06, rr(-beam * 0.26, beam * 0.26));
      }
    }
    // 篙 与 舵桨
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6);
    pole.rotateZ(0.34);
    pole.translate(len * 0.42, 1.9, beam * 0.2);
    wood.push(pole);
    B(0.1, 0.5, 1.5, -len * 0.52, 0.5, 0);

    // 船灯 在船头
    const lampY = cover ? 1.95 : 1.55;
    const head = new THREE.SphereGeometry(0.22, 10, 8);
    head.scale(1, 1.25, 1);
    head.translate(len * 0.3, lampY, 0);
    lampGlow.push(head);
    wood.push(box(0.06, lampY - 1.05, 0.06, len * 0.3, 1.05, 0));

    if (wood.length) s.add(mesh(wood, M.wood));
    if (lampGlow.length) s.add(mesh(lampGlow, M.lantern));

    s.position.set(x, 0.08, z);
    s.rotation.y = heading;
    g.add(s);

    const lampX = x + len * 0.3;
    const col = columns.add(new THREE.Vector3(lampX, 0, z), '#ffb066', 0.8, 6, 0.8);
    haloPos.push([lampX, lampY + 0.08, z]);
    const b = { group: s, x, z, len, col, phase: rand() * 6.28, lampLocal: [len * 0.3, lampY, 0] };
    boats.push(b);
    return b;
  }

  const moored = [
    boat(-38, 14.2, 7.4, 2.3, { heading: 0.05 }),
    boat(6, 14.6, 6.6, 2.1, { heading: -0.04, cover: false }),
    boat(52, 14.0, 8.2, 2.5, { heading: 0.08, cargo: true }),
  ];
  const runner = boat(-260, 28, 11, 3.2, { heading: 0, cover: true, cargo: true });
  runner.group.name = 'boat-runner';

  const ropes = [];
  // the moored boats' ropes were pushed into their own lists; rebuild them here
  // so one dark mesh carries all of them
  for (const b of moored) {
    const bx = b.x + b.len * 0.3, bz = b.z;
    const tx = Math.round(bx / 13) * 13 + 1.4, tz = CANAL.nearZ - 2.6, ty = CANAL.quayTopY + 0.6;
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      ropes.push(box(0.05, 0.05, 0.05, bx + (tx - bx) * t, 1.95 + (ty - 1.95) * t - 0.55 * Math.sin(t * Math.PI), bz + (tz - bz) * t));
    }
  }
  if (ropes.length) {
    const rm = mesh(ropes, M.ink);
    rm.name = 'ropes';
    g.add(rm);
  }

  const halo = new THREE.Points(haloGeo(haloPos), haloMat());
  halo.name = 'media-halo';
  g.add(halo);

  // one real lamp light on the nearest hull so its side actually catches warm
  const light = new THREE.PointLight(0xffb26b, 70, 18, 2);
  light.position.set(-38 + 2.2, 1.9, 14.2);
  g.add(light);

  scene.add(g);

  return {
    group: g,
    boats: moored.concat(runner),
    update(t, boatLevel, ripple, cols) {
      const bob = 0.04 + 0.05 * ripple;
      for (const b of moored) {
        b.group.position.y = 0.08 + Math.sin(t * 0.9 + b.phase) * bob;
        b.group.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.015;
      }
      // the loaded run works down the reach and comes back
      const period = 240;
      const p = ((t % period) + period) % period;
      const rx = -260 + (p / period) * 620;
      const rz = 28 + Math.sin(t * 0.25) * 1.4;
      runner.group.position.set(rx, 0.08 + Math.sin(t * 0.8 + 2.1) * bob, rz);
      runner.group.rotation.z = Math.sin(t * 0.8 + 1.2) * 0.02 * (0.5 + ripple);
      cols.setPos(runner.col, new THREE.Vector3(rx + runner.lampLocal[0], 0, rz));
      for (const b of moored.concat(runner)) cols.setColor(b.col, new THREE.Color('#ffb066'), 0.8 * boatLevel);
      halo.material.uniforms.uTime.value = t;
      halo.material.uniforms.uLevel.value = boatLevel;
      light.intensity = 70 * boatLevel;
    },
  };
}

function haloGeo(positions) {
  const pos = [], size = [], phase = [];
  positions.forEach(([x, y, z], i) => {
    pos.push(x, y, z);
    size.push(5.4);
    phase.push(i * 1.9);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  return g;
}

function haloMat() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uTex: { value: T.softGlow('255,176,104', 0.1) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime;
      varying float vA;
      void main(){ vA = 0.72 + 0.28*sin(uTime*1.9 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * 240.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uLevel; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.72,0.4) * uLevel, t.a * vA * 0.6 * uLevel); }`,
  });
  m.toneMapped = false;
  return m;
}
