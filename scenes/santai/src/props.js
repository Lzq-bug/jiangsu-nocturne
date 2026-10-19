import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, glow, rand, rr, stringPath, figureGeo } from './kit.js';
import * as T from './textures.js';
import { terrainH } from './environment.js';
import { FIELD, ZONES, SWAN, RAIL } from './layout.js';

export const WAVE_MAX = 8;
export const WAVE_SPEED = 34;   // 花信波前：一响约 6 秒推过整片衲田
export const WAVE_SUSTAIN = 6.0;

/** 波环的共用 GLSL：花田、灯串、水面吃的是同一套时刻 */
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
      float trail = exp(-pow((d - front + 8.0)/6.5, 2.0)) * exp(-age/${WAVE_SUSTAIN.toFixed(2)}) * exp(-d/150.0) * 0.22;
      sum += (band + trail) * amp;
      tint += uWaveCol[i] * band * amp;
      if (sum > 1.6) break;
    }
    return sum;
  }`;

/** 一圈花波的记录，三个系统共用同一种存法 */
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

/* ==================================================== 衲田花海
 * 612 块田、2220 余亩，自南向北排成黄、红、紫三条色带。
 * 实景是坡地拼布，所以田块顺着等高线歪着铺，块与块之间只留一道窄埂。
 */
function flowerField(scene) {
  const grp = new THREE.Group();
  const plots = [];
  const cols = 15, rows = 41;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = FIELD.x0 + 3.2 + i * ((FIELD.x1 - FIELD.x0 - 6.4) / (cols - 1)) + rr(-1.5, 1.5);
      const z = FIELD.z0 + 3 + j * ((FIELD.z1 - FIELD.z0 - 6) / (rows - 1)) + rr(-1.4, 1.4);
      if (Math.hypot(x - SWAN.x, z - SWAN.z) < Math.max(SWAN.rx, SWAN.rz) + 2) continue;
      if (x > FIELD.x1 - 3) continue;
      const zone = ZONES.find((zz) => z >= zz.z0 && z < zz.z1) || ZONES[1];
      plots.push({ x, z, w: rr(4.4, 7.6), d: rr(3.6, 6.2), yaw: rr(-0.32, 0.32), hue: zone.hues[Math.floor(rand() * zone.hues.length)] });
    }
  }

  const d = new THREE.Object3D();
  const soilGeo = new THREE.PlaneGeometry(1, 1); soilGeo.rotateX(-Math.PI / 2);
  const soil = new THREE.InstancedMesh(soilGeo, lit('#ffffff', { rough: 1, emissive: '#0b0c08', ei: 0.5 }), plots.length);
  const bankGeo = new THREE.BoxGeometry(1, 0.34, 1);
  const bank = new THREE.InstancedMesh(bankGeo, lit('#4a4636', { rough: 0.98 }), plots.length);
  plots.forEach((p, i) => {
    const y = terrainH(p.x, p.z);
    d.position.set(p.x, y + 0.06, p.z);
    d.rotation.set(0, p.yaw, 0);
    d.scale.set(p.w, 1, p.d);
    d.updateMatrix(); soil.setMatrixAt(i, d.matrix);
    soil.setColorAt(i, new THREE.Color(p.hue).multiplyScalar(0.62));
    d.position.y = y - 0.04; d.scale.set(p.w + 0.55, 1, p.d + 0.55);
    d.updateMatrix(); bank.setMatrixAt(i, d.matrix);
  });
  grp.add(soil, bank);

  // 交叉两片当一丛花，一次实例化画完整片田
  const cross = crossPlane();
  const N = Math.min(150000, plots.length * 244);
  const uni = { uOn: { value: 1 }, uMap: { value: T.flowerTuft() }, uWaveGain: { value: 1 }, ...waveUniforms() };
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
        vec3 lp = vec3(position.x * h * 1.05, position.y * h * (1.0 + wv*0.28), position.z * h * 1.05);
        // 每丛自转一个角度，交叉片才不会整片田对着同一个方向
        float ca = cos(sizePhase.y * 6.28319), sa = sin(sizePhase.y * 6.28319);
        lp.xz = mat2(ca, -sa, sa, ca) * lp.xz;
        float sway = sin(uTime*1.1 + sizePhase.y*6.283 + offset.x*0.18 + offset.z*0.12);
        lp.x += sway * 0.12 * h * position.y;
        lp.z += cos(uTime*0.8 + sizePhase.y*4.1) * 0.07 * h * position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(offset + lp, 1.0);
        vUv = uv; vCol = tint;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOn; uniform float uWaveGain;
      varying vec2 vUv; varying vec3 vCol; varying float vWave; varying vec3 vTint;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.42) discard;
        // 夜里花只吃灯火与月色，波前扫过来才亮这一口
        // 下部压暗：一丛花不会自己发光，只有灯带与月色扫到才亮
        float ao = mix(0.42, 1.0, vUv.y);
        vec3 col = vCol * t.rgb * ((0.26 + 0.44 * uOn) * ao + 0.06);
        col += min(vTint, vec3(0.3)) * uWaveGain * 0.7;
        col += vCol * min(vWave, 0.9) * 0.85;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
  const im = new THREE.InstancedMesh(cross, mat, N);
  const off = new Float32Array(N * 3);
  const tint = new Float32Array(N * 3);
  const sp = new Float32Array(N * 2);
  const c = new THREE.Color();
  let k = 0;
  const per = Math.floor(N / plots.length);
  for (const p of plots) {
    c.set(p.hue);
    const ca = Math.cos(p.yaw), sa = Math.sin(p.yaw);
    for (let i = 0; i < per && k < N; i++, k++) {
      const lx = (rand() * 2 - 1) * p.w * 0.46, lz = (rand() * 2 - 1) * p.d * 0.46;
      const x = p.x + lx * ca - lz * sa, z = p.z + lx * sa + lz * ca;
      off[k * 3] = x; off[k * 3 + 1] = terrainH(x, z) + 0.02; off[k * 3 + 2] = z;
      const j = 0.72 + rand() * 0.55;
      tint[k * 3] = c.r * j; tint[k * 3 + 1] = c.g * j; tint[k * 3 + 2] = c.b * j;
      sp[k * 2] = rr(0.26, 0.52); sp[k * 2 + 1] = rand();
    }
  }
  cross.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  cross.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  cross.setAttribute('sizePhase', new THREE.InstancedBufferAttribute(sp, 2));
  im.frustumCulled = false;
  grp.add(im);
  scene.add(grp);

  const waves = waveQueue(uni, 0.8);
  return {
    group: grp, uniforms: uni, total: plots.length, litCount: N,
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
  const curves = ends.map(([a, b]) => new THREE.CatmullRomCurve3(stringPath(a, b, a.distanceTo(b) * 0.12 + 0.4, 20)));
  const wire = new THREE.Mesh(mergeGeometries(curves.map((c) => new THREE.TubeGeometry(c, 22, 0.035, 4, false))),
    lit('#2a2118', { rough: 0.9 }));
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
        vGlow = uOn * (0.78 + 0.22*sin(uTime*2.6 + phase*9.0)) * (1.0 + min(wv, 0.5)*0.55);
        vec4 mv = viewMatrix * vec4(offset, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = offset + right*(position.x*0.44) + up*(position.y*0.62 - 0.3);
        vUv = uv; vT = tint;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vT; varying float vGlow;
      void main(){
        float m = texture2D(uMap, vec2(vUv.x, vUv.y*0.85+0.1)).a;
        gl_FragColor = vec4(min(vT * (1.9 + vGlow*0.7), vec3(2.2)), m * min(vGlow, 1.15) * 0.95);
      }`,
  });
  let total = 0;
  const counts = curves.map((c) => { const n = Math.max(3, Math.round(c.getLength() / 1.5)); total += n; return n; });
  const bulbGeo = new THREE.PlaneGeometry(0.42, 0.6);
  const im = new THREE.InstancedMesh(bulbGeo, mat, total);
  const off = new Float32Array(total * 3);
  const tint = new Float32Array(total * 3);
  const ph = new Float32Array(total);
  const warm = new THREE.Color('#ffc47a'), red = new THREE.Color('#ff7a4e'), jade = new THREE.Color('#9ff0d8');
  let i = 0;
  curves.forEach((c, ci) => {
    const pick = ci % 7 === 3 ? jade : ci % 5 === 2 ? red : warm;
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

  const waves = waveQueue(uni, 0.6);
  return {
    group: grp, uni, total,
    wave: waves.emit,
    update(t) { uni.uTime.value = t; waves.fill(t); },
  };
}

/* ==================================================== 小火车与天鹅 */
function fleet(scene, anchors, railCurve, columns) {
  const grp = new THREE.Group();
  const shell = lit('#3f4a55', { rough: 0.6, metal: 0.3, emissive: '#0a1016', ei: 0.5 });
  const glass = glow('#ffd6a2', 1.25);
  const bodyGeo = new THREE.BoxGeometry(2.3, 1.5, 4.4); bodyGeo.translate(0, 1.35, 0);
  const roofGeo = new THREE.BoxGeometry(2.5, 0.18, 4.6); roofGeo.translate(0, 2.16, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 10); wheelGeo.rotateZ(Math.PI / 2);
  const winGeo = new THREE.PlaneGeometry(1.5, 0.7);
  const cars = [];
  for (let i = 0; i < RAIL.cars; i++) {
    const c = new THREE.Group();
    c.add(new THREE.Mesh(bodyGeo, shell), new THREE.Mesh(roofGeo, lit('#2a3138', { rough: 0.8 })));
    for (const s of [-1, 1]) for (const w of [0, 1]) {
      const m = new THREE.Mesh(winGeo, glass);
      m.position.set(s * 1.17, 1.45, (w - 0.5) * 2.4);
      m.rotation.y = s * Math.PI / 2;
      c.add(m);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(wheelGeo, lit('#1c2128', { rough: 0.9 }));
      wh.position.set(sx * 1.05, 0.34, sz * 1.3);
      c.add(wh);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow('#fff0c8', 1.4));
    lamp.position.set(0, 2.42, i === 0 ? 2.2 : -2.2);
    c.add(lamp);
    grp.add(c);
    cars.push(c);
  }

  const swanBody = new THREE.SphereGeometry(0.42, 9, 7); swanBody.scale(1.5, 0.75, 1);
  const neckGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.9, 7); neckGeo.translate(0, 0.45, 0);
  const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const beakGeo = new THREE.ConeGeometry(0.06, 0.24, 6);
  const black = lit('#191b21', { rough: 0.85, emissive: '#0a0c10', ei: 0.5 });
  const white = lit('#dfe4ec', { rough: 0.8, emissive: '#2b3038', ei: 0.5 });
  const beak = lit('#c9452f', { rough: 0.7, emissive: '#2a0a06', ei: 0.5 });
  const swans = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Group();
    const m = i % 3 === 0 ? black : white;
    const nk = new THREE.Mesh(neckGeo, m); nk.position.set(0.5, 0.35, 0); nk.rotation.z = -0.55;
    const hd = new THREE.Mesh(headGeo, m); hd.position.set(0.82, 1.05, 0);
    const bk = new THREE.Mesh(beakGeo, beak); bk.position.set(1.0, 1.02, 0); bk.rotation.z = -Math.PI / 2;
    s.add(new THREE.Mesh(swanBody, m), nk, hd, bk);
    s.userData = { a: rand() * 6.28, r: rr(4, SWAN.rx * 0.7), sp: rr(0.04, 0.12) * (rand() < 0.5 ? -1 : 1), wob: rand() * 6.28 };
    grp.add(s);
    swans.push(s);
  }
  const swanCols = swans.map(() => columns.add(new THREE.Vector3(SWAN.x, SWAN.y, SWAN.z), '#ffd7a0', 0.5, 2.0, 0.35));
  scene.add(grp);

  let u = 0;
  return {
    group: grp, cars, swans,
    moored() { return cars[0]; },
    update(t, dt, scale) {
      u = (u + dt * 0.012 * scale) % 1;
      for (let i = 0; i < cars.length; i++) {
        const s = (u - i * 0.016 + 1) % 1;
        const p = railCurve.getPoint(s);
        const tan = railCurve.getTangent(s);
        cars[i].position.set(p.x, p.y + 0.1, p.z);
        cars[i].rotation.set(0, Math.atan2(tan.x, tan.z), Math.sin(t * 3 + i) * 0.008);
      }
      for (let i = 0; i < swans.length; i++) {
        const sw = swans[i], A = sw.userData;
        A.a += dt * A.sp;
        const x = SWAN.x + Math.cos(A.a) * A.r * 1.1;
        const z = SWAN.z + Math.sin(A.a) * A.r * 0.8;
        sw.position.set(x, SWAN.y + Math.sin(t * 0.9 + A.wob) * 0.05, z);
        sw.rotation.set(0, -A.a + Math.PI / 2 + Math.sin(t * 0.4 + A.wob) * 0.25, 0);
        columns.setPos(swanCols[i], sw.position);
      }
      void anchors;
    },
  };
}

/* ==================================================== 夜游人群 */
function crowd(scene, paths) {
  const MAX = 240;
  const im = new THREE.InstancedMesh(figureGeo(1), lit('#232a34', { rough: 0.9, emissive: '#0a0e14', ei: 0.6 }), MAX);
  const lampMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,206,140', 0.1), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  lampMat.toneMapped = false;
  const lamps = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.32), lampMat, MAX);
  scene.add(im, lamps);
  const walkers = [];
  for (let i = 0; i < MAX; i++) {
    const path = paths[i % paths.length];
    walkers.push({ path, u: rand(), sp: rr(0.004, 0.012) * (rand() < 0.5 ? -1 : 1), bob: rand() * 6.28, s: rr(0.86, 1.16), heading: 0 });
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
        if (p.distanceTo(eye) > 150) continue;
        d.position.set(p.x, p.y + Math.abs(Math.sin(t * 3.4 + w.bob)) * 0.05, p.z);
        w.heading = Math.atan2(dir.x, dir.z);
        d.rotation.set(0, w.heading, 0);
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

/* ==================================================== 落瓣 */
function petals(scene) {
  const N = 2600;
  const geo = new THREE.PlaneGeometry(0.1, 0.13);
  const uni = { uTime: { value: 0 }, uMap: { value: T.petal() }, uGust: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `
      attribute vec3 home; attribute vec3 seed; attribute vec3 tint; attribute float fall;
      uniform float uTime; uniform float uGust;
      varying vec2 vUv; varying vec3 vT; varying float vA;
      void main(){
        // home = 出生点(x, 地面高程, z)，seed = (相位, 下落速度, 风向)，fall = 离地高度
        float life = mod(uTime*0.055*seed.y + seed.x, 1.0);
        vec3 p = home;
        p.y = home.y + fall*(1.0 - life) + sin(life*20.0 + seed.x)*0.35;
        p.x += sin(uTime*0.5 + seed.x*9.0)*(1.4+life*3.0) + life*(5.0+uGust*13.0)*seed.z;
        p.z += cos(uTime*0.42 + seed.x*5.3)*1.8 + life*(3.0+uGust*9.0)*-seed.z;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float spin = uTime*1.6 + seed.x*10.0;
        vec3 q = right*(position.x*cos(spin)) + up*(position.y*sin(spin*0.7));
        vUv = uv; vT = tint;
        vA = smoothstep(1.0,0.85,life)*smoothstep(0.0,0.06,life);
        gl_Position = projectionMatrix * (mv + vec4(q, 0.0));
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vT; varying float vA;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.3) discard;
        gl_FragColor = vec4(vT * t.rgb * 0.55, t.a * vA * 0.5);
        #include <tonemapping_fragment>
      }`,
  });
  const home = new Float32Array(N * 3);
  const seed = new Float32Array(N * 3);
  const tint = new Float32Array(N * 3);
  const fall = new Float32Array(N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const inGrove = rand() < 0.45;
    const x = inGrove ? rr(-6, 48) : rr(-46, 40);
    const z = inGrove ? rr(-96, -52) : rr(-112, 116);
    home[i * 3] = x; home[i * 3 + 1] = terrainH(x, z); home[i * 3 + 2] = z;
    seed[i * 3] = rand() * 10;
    seed[i * 3 + 1] = 0.5 + rand() * 1.4;
    seed[i * 3 + 2] = rand() * 2 - 1;
    fall[i] = rr(4, 22);
    const pick = rand();
    c.set(pick < 0.4 ? '#f6dddf' : pick < 0.72 ? '#fff0f4' : '#f3c6cf');
    tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
  }
  geo.setAttribute('home', new THREE.InstancedBufferAttribute(home, 3));
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 3));
  geo.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.setAttribute('fall', new THREE.InstancedBufferAttribute(fall, 1));
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.frustumCulled = false;
  im.renderOrder = 7;
  scene.add(im);
  let gust = 0;
  return {
    mesh: im,
    blow(x, z, s) { gust = Math.max(gust, s); void x; void z; },
    update(t, dt, density, eye) {
      uni.uTime.value = t;
      gust = Math.max(0, gust - dt * 0.4);
      uni.uGust.value = gust;
      im.count = Math.max(0, Math.min(N, Math.round(N * Math.min(2.5, density))));
      void eye;
    },
  };
}

export function buildProps(scene, columns, anchors, parts) {
  // 岸灯在水上拖出的那道光柱：位置固定，亮度交给主循环
  for (const p of anchors.shoreLamps) columns.add(new THREE.Vector3(p.x + 7, 0, p.z), '#ffcf92', 1.5, 9.5, 1.0);
  return {
    field: flowerField(scene),
    strings: lanternStrings(scene, anchors.stringEnds),
    fleet: fleet(scene, anchors, parts.rail.curve, columns),
    crowd: crowd(scene, anchors.crowdPaths),
    leaves: petals(scene),
  };
}
