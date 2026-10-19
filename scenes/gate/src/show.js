import * as THREE from 'three';
import { glow, rand, rr } from './kit.js';
import * as T from './textures.js';
import { GATE } from './data.js';

const FOUNTAIN_Z = 330;

/** hue wheel shared by the facade shader, the beams and the fountain */
const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);

export function showState(t) {
  const prog = (t * 0.017) % 1;
  const beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.52);
  const pulse = Math.pow(beat, 2.4);
  return {
    prog,
    pulse,
    a: hsl(prog, 0.85, 0.55),
    b: hsl(prog + 0.11, 0.9, 0.48),
    c: hsl(prog + 0.5, 0.7, 0.6),
  };
}

/* ------------------------------------------------------------------ media facade */

const GLSL_HSL = `
  vec3 hsl2rgb(float h, float s, float l){
    vec3 rgb = clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return l + s * (rgb - 0.5) * (1.0 - abs(2.0*l - 1.0));
  }`;

function mediaMaterial({ facing }) {
  const uni = {
    uTime: { value: 0 }, uProg: { value: 0 }, uPulse: { value: 0 },
    uShow: { value: 1 }, uBack: { value: facing < 0 ? 0.45 : 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uProg; uniform float uPulse;
      uniform float uShow; uniform float uBack;
      varying vec3 vW;
      ${GLSL_HSL}
      void main(){
        float x = vW.x, y = vW.y;
        // the LED pixel grid the facade is built from
        vec2 g = fract(vec2(x / 1.7, y / 2.2)) - 0.5;
        float cell = smoothstep(0.5, 0.16, max(abs(g.x), abs(g.y) * 1.25));
        // three programmes: rising sweep, crossing diagonals, breathing field
        float sweep = smoothstep(0.15, 0.95, sin(y * 0.021 - uTime * 0.85) * 0.5 + 0.5);
        float diag = sin((x + y) * 0.017 - uTime * 1.25) * 0.5 + 0.5;
        float ring = 1.0 - smoothstep(0.0, 150.0, abs(length(vec2(x * 0.55, y - 168.0)) - (60.0 + 90.0 * uPulse)));
        float mode = uProg;
        float pat = mix(sweep, diag, smoothstep(0.16, 0.5, mode)) * (0.55 + 0.45 * ring);
        float band = smoothstep(0.35, 0.98, sin(x * 0.03 + uTime * 0.5) * 0.5 + 0.5);
        pat = max(pat, band * 0.35 * uPulse);
        vec3 col = mix(hsl2rgb(uProg, 0.85, 0.5), hsl2rgb(uProg + 0.11, 0.9, 0.42), clamp(pat, 0.0, 1.0));
        col = mix(col, hsl2rgb(uProg + 0.5, 0.75, 0.6), ring * 0.5);
        float a = cell * (0.30 + 1.05 * pat) * uShow * uBack * (0.5 + 0.8 * uPulse);
        // keep the podium level readable instead of blown out
        a *= smoothstep(-4.0, 26.0, y);
        gl_FragColor = vec4(col * (1.15 + 0.8 * uPulse), a);
      }`,
  });
  mat.toneMapped = false;
  return { mat, uni };
}

function buildMedia(scene, { shape, frontZ }) {
  const g = new THREE.ShapeGeometry(shape, 1);
  const grp = new THREE.Group();
  grp.name = 'media-facade';
  const front = mediaMaterial({ facing: 1 });
  const back = mediaMaterial({ facing: -1 });
  const mf = new THREE.Mesh(g.clone(), front.mat);
  mf.position.z = frontZ + 0.9;
  mf.name = 'media-front';
  const mb = new THREE.Mesh(g.clone(), back.mat);
  mb.position.z = -frontZ - 0.9;
  mb.rotation.y = Math.PI;
  mb.name = 'media-back';
  grp.add(mf, mb);
  scene.add(grp);
  return { group: grp, unis: [front.uni, back.uni] };
}

/* ------------------------------------------------------------------ search beams */

function beamMaterial() {
  const uni = { uColor: { value: new THREE.Color('#7fdcff') }, uOpacity: { value: 0.34 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        // uv.y runs 1 at the lamp (apex) down to 0 at the far end of the cone
        float along = pow(clamp(vUv.y, 0.0, 1.0), 1.5);
        // a ray through the middle of the cone travels further through the haze
        float through = abs(dot(normalize(vN), normalize(vV)));
        float a = along * (0.20 + 0.95 * through * through);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
  });
  mat.toneMapped = false;
  return { mat, uni };
}

function beams(scene) {
  const grp = new THREE.Group();
  grp.name = 'beam-rig';
  const items = [];
  const spots = [
    [-330, 22, 30, 0.26], [330, 22, 30, -0.26],
    [-GATE.outerHalf + 26, 272, 0, 0.16], [GATE.outerHalf - 26, 272, 0, -0.16],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [x, y, z, tilt] = spots[i];
    const h = 380 + (i % 2) * 70;
    const geo = new THREE.ConeGeometry(11, h, 12, 1, true);
    // apex stays pinned at the lamp, the cone opens upward into the sky
    geo.rotateX(Math.PI);
    geo.translate(0, h / 2, 0);
    const { mat, uni } = beamMaterial();
    const m = new THREE.Mesh(geo, mat);
    m.name = `beam-${i}`;
    m.renderOrder = 6;
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = tilt;
    pivot.add(m);
    grp.add(pivot);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), glow('#dff3ff', 2.4));
    pivot.add(lamp);
    items.push({ pivot, uni, tilt, phase: i * 0.9, speed: 0.16 + (i % 4) * 0.05 });
  }
  scene.add(grp);
  return { group: grp, items };
}

/* ------------------------------------------------------------------ music fountain */

function fountain(scene, columns) {
  // one nozzle = a small column of particles sharing a parabola, so the jets read
  // as threads of water rather than a cloud of spray
  const NOZ = 30, PPT = 14;
  const N = NOZ * PPT;
  const pos = new Float32Array(N * 3);
  const meta = new Float32Array(N * 4);   // phase, speed, height, mask
  const col = new Float32Array(N * 3);
  for (let n = 0; n < NOZ; n++) {
    const x = -300 + (600 * n) / (NOZ - 1);
    const z = FOUNTAIN_Z + (n % 2 ? 9 : -9);
    const h0 = 18 + Math.pow(rand(), 1.5) * 56;
    const base = rand();
    const speed = 0.3 + rand() * 0.16;
    const on = rand() > 0.12 ? 1 : 0;
    const t = n / (NOZ - 1);
    for (let j = 0; j < PPT; j++) {
      const k = n * PPT + j;
      pos.set([x + rr(-0.7, 0.7), 0.6, z + rr(-0.7, 0.7)], k * 3);
      meta[k * 4] = (base + j / PPT) % 1;
      meta[k * 4 + 1] = speed;
      meta[k * 4 + 2] = h0;
      meta[k * 4 + 3] = on;
      col.set([1 - t * 0.25, 0.85 + t * 0.1, 0.9], k * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));
  g.setAttribute('aTint', new THREE.BufferAttribute(col, 3));
  const uni = {
    uTime: { value: 0 }, uScale: { value: 1 }, uPulse: { value: 1 },
    uA: { value: new THREE.Color('#7fdcff') }, uB: { value: new THREE.Color('#ff6a4a') },
    uProg: { value: 0 }, uTex: { value: T.softGlow('225,245,255', 0.1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute vec4 aMeta; attribute vec3 aTint;
      uniform float uTime, uScale, uPulse; uniform float uProg;
      varying vec3 vTint; varying float vLife;
      vec3 hsl2rgb(float h, float s, float l){
        vec3 rgb = clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return l + s * (rgb - 0.5) * (1.0 - abs(2.0*l - 1.0));
      }
      void main(){
        float t = fract(aMeta.x + uTime * aMeta.y * (0.65 + 0.7 * uScale));
        float h = 4.0 * t * (1.0 - t) * aMeta.z * uScale * (0.45 + 0.75 * uPulse) * aMeta.w;
        vec3 p = position + vec3(0.0, h, 0.0);
        vLife = t;
        float hue = uProg + aTint.x * 0.12;
        vTint = mix(vec3(0.92, 0.96, 1.0), hsl2rgb(hue, 0.72, 0.6), 0.25 + 0.6 * t);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.2 + 5.0 * (1.0 - t)) * clamp(150.0 / -mv.z, 0.2, 1.7) * (0.3 + 1.0 * aMeta.w);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uA; uniform vec3 uB;
      varying vec3 vTint; varying float vLife;
      void main(){
        vec4 s = texture2D(uTex, gl_PointCoord);
        float fade = smoothstep(1.0, 0.55, vLife) * 0.9 + 0.1;
        gl_FragColor = vec4(vTint, s.a * fade * 0.85);
      }`,
  });
  mat.toneMapped = false;
  const pts = new THREE.Points(g, mat);
  pts.name = 'fountain-jets';
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);

  // the pontoon the nozzles sit on
  const pontoon = new THREE.Mesh(
    new THREE.BoxGeometry(620, 1.2, 34),
    new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.85, metalness: 0.2 }),
  );
  pontoon.position.set(0, 0.3, FOUNTAIN_Z);
  pontoon.name = 'fountain-pontoon';
  scene.add(pontoon);

  // water columns on the lake under the line — these carry the show colour
  const cols = [];
  for (let i = 0; i < 22; i++) {
    const x = -300 + (600 * i) / 21;
    cols.push(columns.add(new THREE.Vector3(x, 0, FOUNTAIN_Z), '#8fe6ff', 12, 52, 0.9));
  }
  return { points: pts, uni: mat.uniforms, cols, pontoon };
}

/* ------------------------------------------------------------------ assembly */

export function buildShow(scene, gate, columns) {
  const media = buildMedia(scene, { shape: gate.shape, frontZ: gate.frontZ });
  const rig = beams(scene);
  const fnt = fountain(scene, columns);

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const scratch = new THREE.Color();

  return {
    group: media.group,
    update(t, level, fountainLevel = level) {
      const s = showState(t);
      for (const u of media.unis) {
        u.uTime.value = t;
        u.uProg.value = s.prog;
        u.uPulse.value = s.pulse * level;
        u.uShow.value = level;
      }
      fnt.uni.uTime.value = t;
      fnt.uni.uScale.value = fountainLevel;
      fnt.uni.uPulse.value = s.pulse;
      fnt.uni.uPulse.value = s.pulse;
      fnt.uni.uProg.value = s.prog;
      for (const it of rig.items) {
        it.pivot.rotation.y = Math.sin(t * it.speed + it.phase) * 0.9;
        it.pivot.rotation.z = it.tilt * (0.8 + 0.35 * Math.sin(t * 0.3 + it.phase));
        it.uni.uOpacity.value = 0.02 + 0.10 * level * (0.5 + 0.5 * s.pulse);
        it.uni.uColor.value.copy(s.c);
      }
      // repaint the fountain light columns with the current chapter
      tmpA.copy(s.a); tmpB.copy(s.b);
      const gain = 0.35 + 0.95 * fountainLevel * (0.5 + 0.5 * s.pulse);
      for (let i = 0; i < fnt.cols.length; i++) {
        scratch.copy(tmpA).lerp(tmpB, i / (fnt.cols.length - 1));
        columns.setColor(fnt.cols[i], scratch, gain);
      }
      return s;
    },
    fountainCols: fnt.cols,
  };
}
