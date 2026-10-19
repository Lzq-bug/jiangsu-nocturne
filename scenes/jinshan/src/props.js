import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, glow, box, rand, rr, stringPath, figureGeo, loftHull, chineseRoof, lanternGeo, registerOccluder, M } from './kit.js';
import * as T from './textures.js';
import { terrainH } from './environment.js';
import { POOL, AXIS, TOWER, PIER } from './layout.js';
import { MURINGS } from './data.js';

export const WAVE_MAX = 8;
export const WAVE_SPEED = 26;    // 声纹在灯串与荻滩上的推进速度（米/秒）
export const WAVE_SUSTAIN = 5.4;

/** 波环的共用 GLSL：荻滩、灯串吃的是同一套时刻，水面那套在 water.js */
export const waveGLSL = `
  uniform vec4 uWaves[${WAVE_MAX}];
  uniform vec3 uWaveCol[${WAVE_MAX}];
  float waveField(vec2 p, out vec3 tint){
    float sum = 0.0; tint = vec3(0.0);
    for (int i = 0; i < ${WAVE_MAX}; i++) {
      float amp = uWaves[i].w;
      if (amp <= 0.0) continue;
      float age = uTime - uWaves[i].z;
      if (age < 0.0 || age > ${WAVE_SUSTAIN.toFixed(2)}) continue;
      float d = length(p - uWaves[i].xy);
      float front = age * ${WAVE_SPEED.toFixed(1)};
      float band = exp(-pow((d - front)/5.6, 2.0)) * exp(-age/${WAVE_SUSTAIN.toFixed(2)}) * exp(-d/230.0);
      float trail = exp(-pow((d - front + 9.0)/8.0, 2.0)) * exp(-age/${WAVE_SUSTAIN.toFixed(2)}) * exp(-d/230.0) * 0.4;
      sum += (band + trail) * amp;
      tint += uWaveCol[i] * band * amp;
      if (sum > 1.6) break;
    }
    return sum;
  }`;

/** 一圈声纹的记录，几个系统共用同一种存法 */
function waveQueue(uni, gain = 1) {
  const items = [];
  return {
    emit(x, z, t, hue, amp = 1) {
      items.push({ x, z, t0: t, amp, col: new THREE.Color(hue).multiplyScalar(gain) });
      if (items.length > WAVE_MAX) items.shift();
    },
    fill(t) {
      for (let i = 0; i < WAVE_MAX; i++) {
        const w = items[i];
        if (!w || t - w.t0 > WAVE_SUSTAIN * 1.3) { uni.uWaves.value[i].set(0, 0, 0, 0); continue; }
        uni.uWaves.value[i].set(w.x, w.z, w.t0, w.amp);
        uni.uWaveCol.value[i].copy(w.col);
      }
    },
  };
}
const waveUniforms = () => ({
  uTime: { value: 0 },
  uWaves: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
  uWaveCol: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector3()) },
});

/* ==================================================== 荻滩
 * 金山旧在江心，江退以后山脚留下一圈滩涂：荻与芦苇长在北岸、南湖与潭边。
 * 夜里荻花只吃灯火，声纹推过来时才亮出一条边。
 */
function reedBed(scene, columns) {
  const grp = new THREE.Group();
  const beds = [
    { x0: -78, x1: 46, z0: -74, z1: -58, n: 5200, hue: '#d8cbae' },   // 江北滩
    { x0: -62, x1: 78, z0: 56, z1: 76, n: 6400, hue: '#e0d2b4' },     // 金山湖南岸
    { x0: POOL.x - 12, x1: POOL.x + 12, z0: POOL.z - 9, z1: POOL.z + 9, n: 900, hue: '#cfc6ad' },
    { x0: -30, x1: 26, z0: 24, z1: 40, n: 2600, hue: '#d6c9a8' },     // 山脚与湖之间
  ];
  const stems = [];
  for (const B of beds) {
    for (let i = 0; i < B.n; i++) {
      const x = rr(B.x0, B.x1), z = rr(B.z0, B.z1);
      const h = terrainH(x, z);
      if (h > 3.2 || h < -3.5) continue;                 // 只长在水陆之间那一圈
      if (Math.hypot(x - PIER.x, z - PIER.z) < 9) continue;
      const t = rand();
      stems.push({ x, z, y: Math.max(h, 0.1), s: rr(0.9, 2.4), c: new THREE.Color(B.hue).multiplyScalar(0.5 + t * 0.5) });
    }
  }
  const cross = crossPlane();
  const N = stems.length;
  const uni = { uOn: { value: 1 }, uMap: { value: T.reedTuft() }, uWaveGain: { value: 1 }, ...waveUniforms() };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 offset; attribute vec3 tint; attribute vec2 sizePhase;
      uniform float uTime;
      varying vec2 vUv; varying vec3 vCol; varying float vWave; varying vec3 vTint;
      ${waveGLSL}
      void main(){
        vec3 tintW;
        float wv = waveField(offset.xz, tintW);
        vWave = wv; vTint = tintW;
        float h = sizePhase.x;
        vec3 lp = vec3(position.x * h * 1.02, position.y * h * (1.0 + wv * 0.16), position.z * h * 1.02);
        float ca = cos(sizePhase.y * 6.28319), sa = sin(sizePhase.y * 6.28319);
        lp.xz = mat2(ca, -sa, sa, ca) * lp.xz;
        // 荻比花软：风一过就倒，摆幅大
        float sway = sin(uTime * 1.35 + sizePhase.y * 6.283 + offset.x * 0.11 + offset.z * 0.07);
        lp.x += sway * 0.22 * h * position.y;
        lp.z += cos(uTime * 0.95 + sizePhase.y * 4.1) * 0.13 * h * position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(offset + lp, 1.0);
        vUv = uv; vCol = tint;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOn; uniform float uWaveGain;
      varying vec2 vUv; varying vec3 vCol; varying float vWave; varying vec3 vTint;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.34) discard;
        float ao = mix(0.34, 1.0, vUv.y);
        vec3 col = vCol * t.rgb * ((0.2 + 0.5 * uOn) * ao + 0.05);
        col += vTint * uWaveGain * 0.9;
        col += vCol * vWave * 0.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
  const off = new Float32Array(N * 3);
  const tint = new Float32Array(N * 3);
  const sp = new Float32Array(N * 2);
  stems.forEach((s, i) => {
    off[i * 3] = s.x; off[i * 3 + 1] = s.y; off[i * 3 + 2] = s.z;
    tint[i * 3] = s.c.r; tint[i * 3 + 1] = s.c.g; tint[i * 3 + 2] = s.c.b;
    sp[i * 2] = s.s; sp[i * 2 + 1] = rand();
  });
  cross.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  cross.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  cross.setAttribute('sizePhase', new THREE.InstancedBufferAttribute(sp, 2));
  const im = new THREE.InstancedMesh(cross, mat, N);
  im.frustumCulled = false;
  grp.add(im);
  scene.add(grp);

  // 滩上的几点渔灯：江岸与湖南各一簇
  const lampSpots = [
    [-64, -66], [-30, -70], [24, -68], [-52, 74], [30, 78], [58, 84],
  ];
  for (const [lx, lz] of lampSpots) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), glow('#ffc47a', 1.7));
    l.position.set(lx, 1.6, lz);
    grp.add(l);
    columns.add(new THREE.Vector3(lx, 0.4, lz), '#ffc47a', 0.9, 7, 0.9);
  }
  const waves = waveQueue(uni, 0.95);
  return {
    group: grp, uniforms: uni, total: N,
    setDensity(f) { uni.uOn.value = f; },
    wave: waves.emit,
    update(t) { uni.uTime.value = t; waves.fill(t); },
  };
}
function crossPlane() {
  const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]);
  g.deleteAttribute('normal');
  return g;
}

/* ==================================================== 灯串 */
function lanternStrings(scene, ends) {
  const grp = new THREE.Group();
  const curves = ends.map(([a, b]) => new THREE.CatmullRomCurve3(stringPath(a, b, a.distanceTo(b) * 0.1 + 0.35, 20)));
  const wire = new THREE.Mesh(mergeGeometries(curves.map((c) => new THREE.TubeGeometry(c, 22, 0.03, 4, false))),
    lit('#241d16', { rough: 0.9 }));
  grp.add(wire);

  const uni = { uOn: { value: 1 }, uMap: { value: T.softGlow('255,196,122', 0.06) }, ...waveUniforms() };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute vec3 offset; attribute vec3 tint; attribute float phase;
      uniform float uTime; uniform float uOn;
      varying vec2 vUv; varying vec3 vT; varying float vGlow;
      ${waveGLSL}
      void main(){
        vec3 tw;
        float wv = waveField(offset.xz, tw);
        vGlow = uOn * (0.78 + 0.22*sin(uTime*2.6 + phase*9.0)) * (1.0 + min(wv, 1.2)*1.3);
        vec4 mv = viewMatrix * vec4(offset, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = offset + right*(position.x*0.42) + up*(position.y*0.58 - 0.3);
        vUv = uv; vT = tint;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vT; varying float vGlow;
      void main(){
        float m = texture2D(uMap, vec2(vUv.x, vUv.y*0.85+0.1)).a;
        gl_FragColor = vec4(min(vT * (1.9 + vGlow*1.3), vec3(3.2)), m * vGlow * 0.95);
      }`,
  });
  let total = 0;
  const counts = curves.map((c) => { const n = Math.max(3, Math.round(c.getLength() / 1.6)); total += n; return n; });
  const bulbGeo = new THREE.PlaneGeometry(0.4, 0.56);
  const im = new THREE.InstancedMesh(bulbGeo, mat, total);
  const off = new Float32Array(total * 3);
  const tint = new Float32Array(total * 3);
  const ph = new Float32Array(total);
  const warm = new THREE.Color('#ffbe72'), red = new THREE.Color('#ff7a4e'), gold = new THREE.Color('#ffe2a0');
  let i = 0;
  curves.forEach((c, ci) => {
    const pick = ci % 5 === 2 ? red : ci % 4 === 1 ? gold : warm;
    for (let s = 0; s < counts[ci]; s++, i++) {
      const p = c.getPoint((s + 0.5) / counts[ci]);
      off[i * 3] = p.x; off[i * 3 + 1] = p.y; off[i * 3 + 2] = p.z;
      tint[i * 3] = pick.r; tint[i * 3 + 1] = pick.g; tint[i * 3 + 2] = pick.b;
      ph[i] = rand();
    }
  });
  bulbGeo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  bulbGeo.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  bulbGeo.setAttribute('phase', new THREE.InstancedBufferAttribute(ph, 1));
  im.frustumCulled = false;
  im.renderOrder = 9;
  grp.add(im);
  scene.add(grp);

  const waves = waveQueue(uni, 1.25);
  return {
    group: grp, uni, total,
    wave: waves.emit,
    update(t) { uni.uTime.value = t; waves.fill(t); },
  };
}

/* ==================================================== 船队：夜游画舫与江上货船 */
function boatGeometry({ len = 12, beam = 3.6, cabin = true }) {
  const hull = loftHull((f) => {
    const w = beam / 2 * (1 - Math.pow(Math.abs(f - 0.5) * 2, 2.2) * 0.72);
    return [[-w, 0.15], [-w * 0.92, 0.95], [w * 0.92, 0.95], [w, 0.15], [0, -0.75]];
  }, [0, 0.16, 0.4, 0.62, 0.84, 1], false);
  hull.rotateY(Math.PI / 2);
  hull.scale(len / beam, 1, 1);
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(hull, lit('#2f2a26', { map: T.wood('#241d18', '#100c08'), rough: 0.86 })));
  if (cabin) {
    const body = new THREE.Mesh(box(len * 0.5, 1.9, beam * 0.74, 0, 2.0, 0),
      lit('#e6dcc2', { map: T.plaster('#d9cdae'), rough: 0.9 }));
    grp.add(body);
    const roof = new THREE.Mesh(chineseRoof({
      width: len * 0.56, depth: beam * 0.86, height: 1.1, ridgeRatio: 0.3, curve: 0.72,
      eaveLift: 0.7, overhang: 0.35, segU: 22, segV: 10,
    }), M.roofTemple);
    roof.position.y = 3.0;
    roof.rotation.y = Math.PI / 2;
    grp.add(roof);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const lat = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.1, 1.1), M.lattice);
        lat.position.set(-len * 0.2 + i * len * 0.13, 2.1, s * (beam * 0.37 + 0.05));
        lat.rotation.y = s * Math.PI / 2;
        grp.add(lat);
      }
    }
    for (let i = 0; i < 5; i++) {
      const lam = new THREE.Mesh(lanternGeo(0.26, 0.36), glow('#ffb063', 1.8));
      lam.position.set(-len * 0.26 + i * len * 0.13, 3.0, 0);
      grp.add(lam);
    }
    const bow = new THREE.Mesh(lanternGeo(0.3, 0.42), glow('#ffd39a', 2.1));
    bow.position.set(0, 2.6, len * 0.42);
    grp.add(bow);
    const stern = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.4, 6), lit('#3a2c1e', { rough: 0.8 }));
    stern.position.set(0, 3.4, -len * 0.4);
    grp.add(stern);
    const flag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ff6a4a', 1.6));
    flag.position.set(0, 5.1, -len * 0.4);
    grp.add(flag);
  }
  return grp;
}

function fleet(scene, anchors, columns) {
  const grp = new THREE.Group();
  scene.add(grp);

  // 湖上：夜游画舫沿金山湖绕行
  const lakeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(PIER.x + 2, 0.4, PIER.z + 6),
    new THREE.Vector3(PIER.x + 22, 0.4, PIER.z + 18),
    new THREE.Vector3(PIER.x + 30, 0.4, PIER.z + 40),
    new THREE.Vector3(PIER.x, 0.4, PIER.z + 54),
    new THREE.Vector3(PIER.x - 26, 0.4, PIER.z + 40),
    new THREE.Vector3(PIER.x - 22, 0.4, PIER.z + 14),
  ], true, 'catmullrom', 0.4);

  const launches = [];
  for (let i = 0; i < 3; i++) {
    const b = boatGeometry({ len: 12.4, beam: 3.7 });
    b.userData = { u: i * 0.33, sp: 0.011 + i * 0.0015, wob: rand() * 6.28 };
    grp.add(b);
    launches.push({ mesh: b, col: columns.add(new THREE.Vector3(PIER.x, 0.4, PIER.z + 6), '#ffbe72', 1.6, 11, 1.0) });
  }

  // 江上：货船顺流而下，船身不亮，只有一盏桅灯
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-320, 0.5, -150), new THREE.Vector3(-140, 0.5, -132),
    new THREE.Vector3(20, 0.5, -150), new THREE.Vector3(180, 0.5, -176),
    new THREE.Vector3(330, 0.5, -214),
  ], false, 'catmullrom', 0.4);
  const barges = [];
  for (let i = 0; i < 5; i++) {
    const b = boatGeometry({ len: 17, beam: 4.4, cabin: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), glow(i % 3 === 0 ? '#ff5a4a' : '#dfeaff', 1.9));
    lamp.position.set(0, 3.6, 5);
    b.add(lamp);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 6), lit('#2a2118', { rough: 0.85 }));
    mast.position.set(0, 2.1, 4);
    b.add(mast);
    b.userData = { u: -i * 0.19, sp: 0.006 + rand() * 0.004, wob: rand() * 6.28 };
    grp.add(b);
    barges.push({ mesh: b, col: columns.add(new THREE.Vector3(-300, 0.5, -150), '#cfe4ff', 1.2, 9, 0.8) });
  }

  // 泊在码头边的画舫：夜游未开航的那几艘，只留船头一盏灯
  const moored = [];
  for (const [mx, mz] of MURINGS.slice(0, 3)) {
    const b = boatGeometry({ len: 11.6, beam: 3.5 });
    b.position.set(mx, 0.4, mz);
    b.rotation.y = Math.PI * 0.5 + rr(-0.18, 0.18);
    grp.add(b);
    moored.push(b);
    columns.add(new THREE.Vector3(mx, 0.4, mz), '#ffcf8a', 1.5, 10, 1.0);
    registerOccluder(b.children[0], 3.2, b.position.clone());
  }

  anchors.crowdPaths.push(lakeCurve.getSpacedPoints(60));
  return {
    group: grp, launches, barges, moored,
    /** 上船的门户跟着这一艘走 */
    board() { return moored[0]; },
    update(t, dt, scale) {
      for (const L of launches) {
        const b = L.mesh, A = b.userData;
        A.u = (A.u + dt * A.sp * scale + 1) % 1;
        const p = lakeCurve.getPoint(A.u);
        const tan = lakeCurve.getTangent(A.u);
        b.position.set(p.x, 0.4 + Math.sin(t * 0.9 + A.wob) * 0.07, p.z);
        b.rotation.set(Math.sin(t * 0.7 + A.wob) * 0.014, Math.atan2(tan.x, tan.z), 0);
        columns.setPos(L.col, b.position);
      }
      for (const B of barges) {
        const b = B.mesh, A = b.userData;
        A.u += dt * A.sp * scale;
        if (A.u > 1.05) A.u = -0.06;
        const f = Math.min(1, Math.max(0, A.u));
        const p = riverCurve.getPoint(f);
        const tan = riverCurve.getTangent(f);
        b.position.set(p.x, 0.5 + Math.sin(t * 0.8 + A.wob) * 0.09, p.z);
        b.rotation.set(0, Math.atan2(tan.x, tan.z), Math.sin(t * 0.6 + A.wob) * 0.012);
        columns.setPos(B.col, b.position);
      }
      for (const m of moored) {
        m.position.y = 0.4 + Math.sin(t * 0.75 + m.rotation.y) * 0.05;
        m.rotation.z = Math.sin(t * 0.6 + m.rotation.y) * 0.012;
      }
    },
  };
}

/* ==================================================== 夜里的香客与游人 */
function crowd(scene, paths) {
  const MAX = 240;
  const im = new THREE.InstancedMesh(figureGeo(1), lit('#232a34', { rough: 0.9, emissive: '#0a0e14', ei: 0.6 }), MAX);
  const lampMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,206,140', 0.1), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  lampMat.toneMapped = false;
  const lamps = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), lampMat, MAX);
  scene.add(im, lamps);
  const use = paths.filter((p) => p && p.length > 1);
  const walkers = [];
  for (let i = 0; i < MAX; i++) {
    const path = use[i % use.length];
    walkers.push({ path, u: rand(), sp: rr(0.004, 0.012) * (rand() < 0.5 ? -1 : 1), bob: rand() * 6.28, s: rr(0.86, 1.16) });
  }
  const d = new THREE.Object3D();
  const at = (w, u, back) => {
    const P = w.path, n = P.length;
    const f = Math.min(0.999, Math.max(0, u)) * (n - 1);
    const i = Math.floor(f);
    const a = P[Math.max(0, i + (back ? -1 : 0))];
    const b = P[Math.min(n - 1, i + 1)];
    return { p: a.clone().lerp(b, f - i), dir: b.clone().sub(a) };
  };
  return {
    mesh: im,
    update(t, dt, count, eye) {
      const n = Math.min(MAX, count);
      let used = 0;
      for (let i = 0; i < n && used < MAX; i++) {
        const w = walkers[i];
        w.u += dt * w.sp;
        if (w.u > 1) w.u -= 1; else if (w.u < 0) w.u += 1;
        const { p, dir } = at(w, w.u, w.sp < 0);
        if (p.distanceTo(eye) > 140) continue;
        d.position.set(p.x, p.y + Math.abs(Math.sin(t * 3.4 + w.bob)) * 0.05, p.z);
        d.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
        d.scale.setScalar(w.s);
        d.updateMatrix(); im.setMatrixAt(used, d.matrix);
        d.position.y = p.y + 1.18 * w.s;
        d.rotation.set(0, 0, 0); d.scale.setScalar(1);
        d.updateMatrix(); lamps.setMatrixAt(used, d.matrix);
        used++;
      }
      im.count = lamps.count = used;
      im.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ==================================================== 香火
 * 三座香炉在殿前、山门内与塔下。夜里看不见佛前的字，只看得见这一柱柱烟
 * 被江风斜斜地拉过去；声纹扫过来时，烟会被抖得一断。
 */
function incense(scene) {
  const burners = [
    { x: AXIS.hall2.x - AXIS.hall2.d / 2 - 4.5, z: AXIS.hall2.z, s: 1.15 },
    { x: AXIS.hall1.x - AXIS.hall1.d / 2 - 3.6, z: AXIS.hall1.z, s: 0.9 },
    { x: TOWER.x, z: TOWER.z - 10.5, s: 0.8 },
  ];
  const grp = new THREE.Group();
  for (const b of burners) {
    const g = terrainH(b.x, b.z);
    const profile = [
      new THREE.Vector2(0.02, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0.66, 0.16),
      new THREE.Vector2(0.44, 0.3), new THREE.Vector2(0.78, 0.62), new THREE.Vector2(0.82, 0.86),
      new THREE.Vector2(0.7, 0.92),
    ];
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), M.bronze);
    body.scale.setScalar(b.s);
    body.position.set(b.x, g + 0.6 * b.s, b.z);
    body.castShadow = true;
    grp.add(body);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.72 * b.s, 0.07 * b.s, 6, 18), M.bronze);
    lip.rotateX(Math.PI / 2);
    lip.position.set(b.x, g + (0.6 + 0.92) * b.s, b.z);
    grp.add(lip);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.3 * b.s, 8, 6), glow('#ff7a3c', 2.4));
    ember.position.set(b.x, g + 1.5 * b.s, b.z);
    grp.add(ember);
    b.top = new THREE.Vector3(b.x, g + 1.6 * b.s, b.z);
  }
  scene.add(grp);

  const N = 1800;
  const geo = new THREE.PlaneGeometry(0.9, 1.4);
  const uni = { uTime: { value: 0 }, uMap: { value: T.smokePuff() }, uGust: { value: 0 }, ...waveUniforms() };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `
      attribute vec3 home; attribute vec3 seed; attribute float phase;
      uniform float uTime; uniform float uGust;
      varying vec2 vUv; varying float vA;
      ${waveGLSL}
      void main(){
        float life = mod(uTime * 0.06 * seed.y + seed.x, 1.0);
        vec3 tintW;
        float wv = waveField(home.xz, tintW);
        vec3 p = home;
        // 烟往上走，越走越散、越淡
        p.y += life * (9.0 + seed.z * 6.0);
        p.x += life * (3.2 + uGust * 9.0) + sin(uTime * 0.5 + phase * 6.3) * life * 2.4;
        p.z += life * 1.7 + cos(uTime * 0.43 + phase * 5.1) * life * 1.8;
        p.x += wv * sin(phase * 7.0) * 1.8;
        float spread = 0.5 + life * 2.6;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float spin = phase * 6.28 + uTime * 0.25;
        vec3 q = right * (position.x * cos(spin) * spread) + up * (position.y * spread);
        vA = smoothstep(1.0, 0.62, life) * smoothstep(0.0, 0.09, life);
        vUv = uv;
        gl_Position = projectionMatrix * (mv + vec4(q, 0.0));
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying float vA;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.05) discard;
        gl_FragColor = vec4(vec3(0.62, 0.6, 0.58) * t.rgb, t.a * vA * 0.34);
        #include <tonemapping_fragment>
      }`,
  });
  const home = new Float32Array(N * 3);
  const seed = new Float32Array(N * 3);
  const ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const b = burners[i % burners.length];
    home[i * 3] = b.top.x + rr(-0.3, 0.3);
    home[i * 3 + 1] = b.top.y;
    home[i * 3 + 2] = b.top.z + rr(-0.3, 0.3);
    seed[i * 3] = rand() * 10;
    seed[i * 3 + 1] = 0.5 + rand() * 1.3;
    seed[i * 3 + 2] = rand();
    ph[i] = rand();
  }
  geo.setAttribute('home', new THREE.InstancedBufferAttribute(home, 3));
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 3));
  geo.setAttribute('phase', new THREE.InstancedBufferAttribute(ph, 1));
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.frustumCulled = false;
  im.renderOrder = 7;
  scene.add(im);

  let gust = 0;
  const waves = waveQueue(uni, 1);
  return {
    mesh: im, burners,
    blow(x, z, s) { gust = Math.max(gust, s); void x; void z; },
    wave: waves.emit,
    update(t, dt, density, eye) {
      uni.uTime.value = t;
      gust = Math.max(0, gust - dt * 0.4);
      uni.uGust.value = gust;
      waves.fill(t);
      im.count = Math.max(0, Math.min(N, Math.round(N * Math.min(2.2, density))));
      void eye;
    },
  };
}

export function buildProps(scene, columns, anchors) {
  // 水里那些灯柱：堤灯、桥灯、滩上渔灯，位置固定，亮度交给主循环
  for (const p of anchors.waterLamps) columns.add(new THREE.Vector3(p.x, p.y, p.z), '#ffcf92', 1.4, 9, 0.95);
  return {
    reeds: reedBed(scene, columns),
    strings: lanternStrings(scene, anchors.stringEnds),
    fleet: fleet(scene, anchors, columns),
    crowd: crowd(scene, anchors.crowdPaths),
    smoke: incense(scene),
  };
}
