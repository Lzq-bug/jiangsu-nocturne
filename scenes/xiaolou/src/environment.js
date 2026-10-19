import * as THREE from 'three';
import * as T from './textures.js';
import { glow, rand, rr, PAL } from './kit.js';
import { MOON_DIR, LANE, centerZ } from './plan.js';

const MD = new THREE.Vector3(...MOON_DIR);

/** 天穹：天顶墨蓝、檐口一带返出城里的水汽与灯色 */
function skyDome() {
  const uni = {
    uTime: { value: 0 },
    uMoon: { value: 1 },
    uTop: { value: new THREE.Color('#04070f') },
    uMid: { value: new THREE.Color('#0b1424') },
    uHorizon: { value: new THREE.Color('#1d2b3f') },
    uCity: { value: new THREE.Color('#3a2a20') },
    uMoonDir: { value: MD.clone() },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHorizon, uCity, uMoonDir;
      uniform float uMoon, uTime;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        c = mix(c, uTop, smoothstep(0.16, 0.72, h));
        // 城市返照只压在 horizon 一条带上
        c = mix(c, uCity, smoothstep(0.07, -0.02, h) * 0.55);
        // 月华：贴着月的一圈冷白
        float d = acos(clamp(dot(normalize(vDir), normalize(uMoonDir)), -1.0, 1.0));
        c += vec3(0.16, 0.19, 0.26) * exp(-d * 3.4) * uMoon;
        c += vec3(0.05, 0.06, 0.09) * exp(-d * 1.1) * uMoon;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(760, 40, 24), mat);
  mesh.renderOrder = -10;
  return { mesh, uni };
}

function stars() {
  const N = 900;
  const pos = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // 上半球偏密，贴近地平线的一圈让给屋脊
    const u = rand(), v = 0.06 + 0.94 * rand() ** 0.75;
    const theta = u * Math.PI * 2, phi = Math.acos(v);
    const r = 700;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    ph[i] = rand() * 6.28;
    sz[i] = rr(1.1, 3.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const uni = {
    uTime: { value: 0 }, uBright: { value: 1 },
    uTex: { value: T.softGlow('210,225,255', 0.05) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase; attribute float aSize;
      uniform float uTime;
      varying float vTw;
      void main() {
        vTw = 0.55 + 0.45 * sin(uTime * 0.7 + aPhase * 6.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (1.0 + 0.4 * vTw);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform float uBright; varying float vTw;
      void main() {
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(t.rgb, t.a * vTw * uBright);
      }`,
  });
  const mesh = new THREE.Points(g, mat);
  mesh.renderOrder = -8;
  return { mesh, uni };
}

function moon() {
  const grp = new THREE.Group();
  const at = MD.clone().multiplyScalar(620);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(15, 48), glow('#f6f2e4', 2.1));
  disc.position.copy(at);
  disc.lookAt(0, 0, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('214,226,255', 0.16), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity: 0.85,
  }));
  halo.material.toneMapped = false;
  halo.position.copy(at);
  halo.scale.set(240, 240, 1);
  // 月边的一缕云，遮住一点更像真夜
  const wisp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.cloudPuff(), transparent: true, depthWrite: false, fog: false, opacity: 0.5, color: 0x8fa2c8,
  }));
  wisp.position.copy(at).add(new THREE.Vector3(34, -6, 0));
  wisp.scale.set(210, 96, 1);
  grp.add(halo, disc, wisp);
  return { grp, disc, halo, wisp };
}

function clouds() {
  const grp = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.cloudPuff(), transparent: true, depthWrite: false, fog: false,
      opacity: rr(0.16, 0.34), color: new THREE.Color('#7e90ba'),
    }));
    const a = rr(0, Math.PI * 2), r = rr(280, 560);
    s.position.set(Math.cos(a) * r, rr(120, 250), Math.sin(a) * r);
    s.scale.set(rr(180, 340), rr(70, 130), 1);
    s.userData.drift = rr(1.4, 4.2) * (rand() > 0.5 ? 1 : -1);
    grp.add(s);
  }
  return grp;
}

/** 远景屋脊：一片压着的黑檐，把巷子的天空框住 */
function farRidges() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a1020'), fog: false });
  const litMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#141d33'), fog: false });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rr(-0.04, 0.04);
    const r = rr(215, 345);
    const w = rr(16, 34), h = rr(6, 15);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, rr(10, 22)), i % 3 ? mat : litMat);
    b.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    b.rotation.y = -a + rr(-0.3, 0.3);
    grp.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, 1.1, rr(9, 20)), mat);
    roof.position.set(b.position.x, h - 0.4, b.position.z);
    roof.rotation.y = b.rotation.y;
    grp.add(roof);
  }
  return grp;
}

/** 借景：城南运河边的妙光塔（八面七级楼阁式砖塔）。站在巷中能否望见塔影因巷弯而异，此处为构图借来 */
function farPagoda() {
  const grp = new THREE.Group();
  const stone = new THREE.MeshBasicMaterial({ color: new THREE.Color('#101a2c'), fog: false });
  const tier = 7;
  for (let i = 0; i < tier; i++) {
    const s = 1 - i * 0.075;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(6.4 * s, 6.9 * s, 7.6, 8), stone);
    body.position.y = 8 + i * 8;
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(8.6 * s, 9.4 * s, 1.5, 8), stone);
    eave.position.y = 12.2 + i * 8;
    grp.add(body, eave);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8, 8), stone);
  cap.position.y = 8 + tier * 8 + 2;
  grp.add(cap);
  // 每层檐下一圈灯，夜里像一串浮在空中的黄点
  for (let i = 0; i < tier; i++) {
    const s = 1 - i * 0.075;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.8 * s, 0.34, 6, 24), glow('#ffca7e', 1.5));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 11.4 + i * 8;
    grp.add(ring);
  }
  grp.position.set(-300, 0, 262);
  grp.scale.setScalar(1.55);
  return grp;
}

/** 今景天际线：几栋高层的窗光，关掉「今景灯火」就一并收去 */
function farCity() {
  const grp = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: new THREE.Color('#080d18'), roughness: 0.9 });
  const win = glow('#ffd9a0', 1.1);
  for (let i = 0; i < 14; i++) {
    const a = rr(0, Math.PI * 2), r = rr(360, 560);
    const w = rr(16, 30), h = rr(48, 118);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * rr(0.6, 1)), shell);
    b.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    grp.add(b);
    for (let k = 0; k < Math.floor(h / 9); k++) {
      if (rand() > 0.62) continue;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.9, 0.4), win);
      strip.position.set(b.position.x, 6 + k * 9, b.position.z + w * 0.51);
      strip.rotation.y = -a;
      grp.add(strip);
    }
  }
  return grp;
}

export function buildEnvironment(scene) {
  scene.fog = new THREE.FogExp2(new THREE.Color('#070c17'), 0.0062);

  const sky = skyDome();
  const star = stars();
  const moonObj = moon();
  const cloudGrp = clouds();
  scene.add(sky.mesh, star.mesh, moonObj.grp, cloudGrp, farRidges());

  const modern = farCity();
  const pagoda = farPagoda();
  scene.add(modern, pagoda);

  // 脚下：巷外的地面压成一片暗，远处的屋影才有着落
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(560, 48),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#0c111d'), roughness: 0.98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  scene.add(ground);

  /* 月光：全场景唯一的主光源，冷、低、有影 */
  const key = new THREE.DirectionalLight(new THREE.Color('#c3d2f2'), 1.7);
  key.position.copy(MD.clone().multiplyScalar(150));
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -170; sc.right = 170; sc.top = 120; sc.bottom = -120;
  sc.near = 20; sc.far = 420;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.06;
  scene.add(key);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#41598a'), new THREE.Color('#14110c'), 0.8);
  const bounce = new THREE.DirectionalLight(new THREE.Color('#6d82ab'), 0.5);
  bounce.position.set(-20, 70, 30);
  scene.add(hemi, bounce);

  // 巷口的暖光补一点，免得整条巷只剩月色的蓝
  const fill = new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 26, 42, 2);
  fill.position.set(LANE.xFrom + 14, 3.6, centerZ(LANE.xFrom + 14));
  scene.add(fill);

  let moonLevel = 1;
  return {
    uni: sky.uni,
    setMoon(v) {
      moonLevel = v;
      key.intensity = 0.2 + 1.7 * v;
      hemi.intensity = 0.16 + 0.8 * v;
      sky.uni.uMoon.value = 0.25 + 0.85 * v;
      star.uni.uBright.value = 0.35 + 0.75 * v;
      moonObj.disc.visible = v > 0.05;
      moonObj.halo.material.opacity = 0.28 + 0.6 * v;
      moonObj.wisp.material.opacity = 0.22 + 0.34 * v;
    },
    setModern(on) {
      modern.visible = on; // 塔是老城的借景，不算今景，不随开关收
      fill.intensity = on ? 26 : 10;
      scene.fog.density = on ? 0.0062 : 0.0046;
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      for (const c of cloudGrp.children) {
        c.position.x += c.userData.drift * 0.016;
        if (c.position.x > 620) c.position.x = -620;
        if (c.position.x < -620) c.position.x = 620;
      }
      moonObj.wisp.position.x = MD.x * 620 + Math.sin(t * 0.05) * 26;
    },
  };
}
