import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, registerOccluder } from './kit.js';
import { STATIONS } from './data.js';
import * as T from './textures.js';

export const MOON_DIR = new THREE.Vector3(-0.42, 0.55, -0.72).normalize();

/** deep-indigo zenith to warm city haze at the horizon */
function skyDome() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0055,0.0085,0.022);
        vec3 mid    = vec3(0.013,0.019,0.043);
        vec3 horizon= vec3(0.030,0.026,0.036);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        // city light haze pooled toward the river axis, only above the horizon line
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        float warm = smoothstep(-0.25, 0.9, d.x*0.7 - d.z*0.25);
        col += vec3(0.034,0.016,0.006) * haze * (0.35 + 0.9*warm);
        // moon halo
        float md = max(0.0, dot(d, normalize(vec3(-0.42,0.55,-0.72))));
        col += vec3(0.055,0.068,0.10) * pow(md, 26.0) * 0.9 * sky;
        // drifting cloud noise
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.010,0.013,0.024), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
        // under the horizon there is nothing but the dark of the valley
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

export function stars() {
  const N = 1400, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.06 + Math.pow(rand(), 0.7) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 520, y * 520, Math.sin(a) * r * 520], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.4;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: T.softGlow('210,225,255', 0.05) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.6+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.85,0.9,1.0), t.a*vA*0.9); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), glow('#fff4d6', 2.4));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(150, 150, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(430);
  grp.position.y = Math.max(120, grp.position.y);
  return grp;
}

/** distant rooftop silhouettes + pinprick windows, ringing the valley */
function oldTown() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const nRoof = 460, nBody = 460;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x080b14, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, nRoof);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, nBody);
  const bax = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < nRoof; i++) {
    const a = rand() * Math.PI * 2;
    const band = 130 + Math.pow(rand(), 0.55) * 150;
    const x = Math.cos(a) * band, z = Math.sin(a) * band * 0.85;
    const h = 5 + rand() * 13, w = 7 + rand() * 9;
    bax.position.set(x, h * 0.5, z);
    bax.rotation.set(0, rand() * Math.PI, 0);
    bax.scale.set(w, h, w * 0.72);
    bax.updateMatrix();
    bodies.setMatrixAt(i, bax.matrix);
    bax.position.set(x, h + 1.4, z);
    bax.scale.set(w * 0.78, 3.4 + rand() * 2, w * 0.6);
    bax.updateMatrix();
    roofs.setMatrixAt(i, bax.matrix);
    if (rand() > 0.55) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.6, z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,200,140', 0.2), size: 3.2, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/** low mountain ridge behind the town, purely a silhouette band */
function ridges() {
  const pts = [];
  const idx = [];
  const seg = 120;
  const col = [];
  const cLow = new THREE.Color('#05070f'), cHigh = new THREE.Color('#101828');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const bump = Math.abs(Math.sin(a * 2.1 + 1.2)) * 26 + Math.abs(Math.sin(a * 5.3)) * 11 + Math.sin(a * 9.1) * 4;
    const R = 470;
    const h = 24 + bump;
    pts.push(x * R, -6, z * R * 0.9, x * R, h, z * R * 0.9);
    col.push(...cLow.toArray(), ...cHigh.toArray());
    if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  m.toneMapped = false;
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

/** weeping willow: bent trunk + drooping tube strands (one merged geo, reused) */
export function willowGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.5, 4.6, 7);
  trunk.translate(0, 2.3, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.16, 2.2, 5);
    br.translate(0, 4.9 + i * 0.15, 0);
    br.rotateZ((i - 1) * 0.7);
    br.rotateY(i * 2.1);
    parts.push(br);
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = 1.4 + rand() * 2.4;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.32, 4.6 + rand() * 1.1, Math.sin(a) * r * 0.32),
      new THREE.Vector3(Math.cos(a) * r * 0.8, 4.2 + rand() * 0.8, Math.sin(a) * r * 0.8),
      new THREE.Vector3(Math.cos(a) * r, 2.4 + rand() * 1.2, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * r * 1.02, 0.5 + rand() * 0.9, Math.sin(a) * r * 1.02),
    ]);
    parts.push(new THREE.TubeGeometry(c, 7, 0.055 + rand() * 0.05, 4, false));
  }
  return mergeGeometries(parts);
}

function willows() {
  const geo = willowGeo();
  const grp = new THREE.Group();
  const spots = [];
  for (let z = -96; z <= 96; z += 15) {
    if (rand() > 0.35) spots.push([-27.5 - rr(0, 5), z + rr(-5, 5)]);
    if (rand() > 0.55) spots.push([27.5 + rr(0, 5), z + rr(-5, 5)]);
  }
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 9);
  for (const [x, z] of spots.filter(clear)) {
    const t = new THREE.Mesh(geo, M.leaf);
    const s = rr(0.75, 1.35);
    t.scale.set(s, s * rr(0.9, 1.15), s);
    t.position.set(x, 2.4, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, 4.2));
  }
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), oldTown(), ridges(), willows());

  const hemi = new THREE.HemisphereLight(0x4a5f8f, 0x0d1018, 0.52);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.05);
  moonLight.position.copy(MOON_DIR).multiplyScalar(180);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 20; sc.far = 380;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  scene.add(hemi, moonLight);

  // warm fill from the lamps on both banks — enough to model the roofs and pillars
  const fillSpots = [
    [[-24, 7.5, -30], 0xffa657, 260, 96],
    [[-24, 7.5, 30], 0xffa657, 260, 96],
    [[2, 7, 2], 0xff9a5e, 200, 80],
    [[30, 8, 2], 0xffc07a, 120, 88],
    [[52, 10, 0], 0xffb066, 130, 96],
    [[-18, 6, -78], 0xffbb77, 180, 78],
    [[-45, 9.5, 46], 0xffc98a, 120, 110],
  ];
  const fills = fillSpots.map(([p, color, i, dist]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x0a1024, 0.0042);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}

export { willows };
