import * as THREE from 'three';
import { GEO } from './data.js';
import { M, PAL, mesh, box, lit } from './kit.js';
import { depthTexture, MAP_HALF } from './terrain.js';
import * as T from './textures.js';

/**
 * 鼋头渚灯塔：金山石贴面的圆柱塔身，黄色琉璃瓦重檐顶，实高 13.1 米。
 * 这是一座"古典灯塔"——它矮，但它站在太湖西北岸最要紧的那块石头上，
 * 所以场景里让它的灯光成为唯一的强光源：空中一道旋转光锥，
 * 湖面上跟着扫过一片亮扇。
 */

const { x: LX, z: LZ, padY, towerH } = GEO.light;
const CORE_BASE = new THREE.Color(PAL.beamWhite);

/** 黄色琉璃瓦：与秦淮用的青瓦同一套瓦垄贴图，只换配色 */
function glazedYellow() {
  return lit('#f0e0a8', {
    map: T.roofTiles('#7c5a15', '#c39a34', '#f6e6a4'),
    rough: 0.42, metal: 0.1, side: THREE.DoubleSide,
    emissive: '#2b1f05', ei: 0.6,
  });
}

/** 重檐顶的曲面轮廓：从宝顶往下反曲外挑，檐角起翘 */
function eaveGeo(rEave, h, upturn = 1) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = 0.16 + (rEave - 0.16) * Math.pow(t, 0.72);
    const y = h * Math.pow(1 - t, 1.5) + upturn * Math.pow(t, 7) * h * 0.42;
    pts.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(pts, 22);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 11, uv.getY(i));
  return g;
}

export function buildLighthouse(scene) {
  const grp = new THREE.Group();
  grp.name = 'lighthouse';
  scene.add(grp);

  const granite = M.tower;
  const stonePink = lit('#eadfd8', { map: T.stone('#d9c9c0'), rough: 0.8 });
  const glazed = glazedYellow();

  /* ---- 塔基：石砌台座 + 一道矮围墙 ---- */
  const plinth = mesh([
    box(9.6, 1.1, 9.6, 0, 0.55, 0),
    box(8.2, 0.7, 8.2, 0, 1.45, 0),
  ], M.stoneDressed);
  plinth.position.set(LX, padY - 1.5, LZ);
  plinth.receiveShadow = true;
  grp.add(plinth);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 6.1, 2.2, 20, 1), stonePink);
  skirt.position.set(LX, padY + 0.2, LZ);
  skirt.castShadow = skirt.receiveShadow = true;
  grp.add(skirt);

  /* ---- 塔身：略收分的圆柱，石缝与檐线 ---- */
  const shaftH = towerH * 0.68;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.28, 3.0, shaftH, 22, 1), granite);
  shaft.position.set(LX, padY + 1.3 + shaftH / 2, LZ);
  shaft.castShadow = shaft.receiveShadow = true;
  grp.add(shaft);
  for (const [y, r] of [[0.22, 3.06], [0.55, 2.72], [0.88, 2.44]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.11, 5, 26), stonePink);
    band.rotation.x = Math.PI / 2;
    band.position.set(LX, padY + 1.3 + shaftH * y, LZ);
    grp.add(band);
  }
  // 一门两窗：朝向陆地一侧是铁门，向上是灯室的小窗
  const door = mesh([box(1.15, 2.05, 0.16, 0, 1.05, 0), box(1.4, 0.24, 0.3, 0, 2.12, 0)], M.iron);
  door.position.set(LX, padY + 1.4, LZ - 2.96);
  grp.add(door);
  const lampSlot = new THREE.Vector3(LX, padY + 1.3 + shaftH, LZ);

  /* ---- 灯座平台：石出挑 + 铁栏 ---- */
  const galleryY = padY + 1.15 + shaftH * 0.98;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.2, 0.4, 22, 1), M.stoneDressed);
  gallery.position.set(LX, galleryY, LZ);
  gallery.castShadow = true;
  grp.add(gallery);
  const rail = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 5), M.iron, 22);
  const d = new THREE.Object3D();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    d.position.set(LX + Math.cos(a) * 3.3, galleryY + 0.68, LZ + Math.sin(a) * 3.3);
    d.rotation.set(0, 0, 0);
    d.updateMatrix();
    rail.setMatrixAt(i, d.matrix);
  }
  rail.instanceMatrix.needsUpdate = true;
  grp.add(rail);
  const handRail = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.06, 5, 30), M.iron);
  handRail.rotation.x = Math.PI / 2;
  handRail.position.set(LX, galleryY + 1.14, LZ);
  grp.add(handRail);

  /* ---- 灯室：柱间开敞，中央悬灯 ---- */
  const roomY = galleryY + 0.2;
  const roomH = towerH * 0.2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, roomH, 6), M.brass);
    col.position.set(LX + Math.cos(a) * 2.5, roomY + roomH / 2, LZ + Math.sin(a) * 2.5);
    grp.add(col);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.15, 0.3, 20, 1), M.stoneDressed);
  drum.position.set(LX, roomY + roomH, LZ);
  grp.add(drum);

  // 灯：一颗高动态的核，加一圈镜片反光
  const optic = new THREE.Group();
  // 灯核独占一份材质：下面每帧要按光束强度改它的颜色，不能进 glow() 的缓存池
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.beamWhite).multiplyScalar(2.6) });
  coreMat.toneMapped = false;
  coreMat.fog = false;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), coreMat);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), M.glass);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,238,196', 0.12), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.95,
  }));
  halo.scale.set(9, 9, 1);
  halo.material.toneMapped = false;
  optic.add(core, shell, halo);
  optic.position.set(LX, roomY + roomH * 0.52, LZ);
  grp.add(optic);
  const LAMP = new THREE.Vector3(LX, roomY + roomH * 0.52, LZ);

  const lampLight = new THREE.PointLight(0xffeec6, 300, 220, 2);
  lampLight.position.copy(LAMP);
  grp.add(lampLight);

  /* ---- 重檐琉璃顶：下檐大、上檐小，收在宝顶 ---- */
  const lower = new THREE.Mesh(eaveGeo(4.5, 1.9, 1.15), glazed);
  lower.position.set(LX, roomY + roomH + 0.1, LZ);
  lower.castShadow = true;
  const upper = new THREE.Mesh(eaveGeo(2.6, 1.5, 1.0), glazed);
  upper.position.set(LX, roomY + roomH + 1.5, LZ);
  upper.castShadow = true;
  const finial = mesh([
    new THREE.SphereGeometry(0.24, 10, 8).translate(0, 0.3, 0),
    new THREE.CylinderGeometry(0.05, 0.09, 0.8, 6).translate(0, 0.8, 0),
  ], M.gilt);
  finial.position.set(LX, roomY + roomH + 2.9, LZ);
  grp.add(lower, upper, finial);

  /* ---- 旋转光束：空中锥壳 + 湖面亮扇 ---- */
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uStrength: { value: 1 },
      uColor: { value: new THREE.Color(PAL.beamWhite) },
    },
    vertexShader: `
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        vT = uv.y;                       // 锥顶 1，锥底 0
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uStrength; uniform vec3 uColor;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        // 锥壳是空心的：掠射优先会把光画成一块木板，正对镜头的一圈才该最亮
        float face = abs(dot(normalize(vN), normalize(vV)));
        float along = smoothstep(0.0, 0.32, vT) * pow(vT, 1.35);
        float hum = 0.86 + 0.14*sin(uTime*3.1 + vT*22.0);
        float a = along * (0.10 + 0.90*face*face) * uStrength * hum;
        gl_FragColor = vec4(uColor, a * 0.10);
      }`,
  });
  const BEAM_LEN = 1150, BEAM_R = 42;
  const lobeGeo = new THREE.ConeGeometry(BEAM_R, BEAM_LEN, 44, 1, true);
  lobeGeo.translate(0, -BEAM_LEN / 2, 0);   // apex at origin, opening toward -Y
  // 光束与水面亮扇单独成一个根节点：它们不是实体，不该被水面镜像成一块半透明板
  const beamRoot = new THREE.Group();
  beamRoot.name = 'beam';
  scene.add(beamRoot);
  const beam = new THREE.Group();
  const TILT = 0.06;
  for (const sgn of [1, -1]) {
    const lobe = new THREE.Mesh(lobeGeo, beamMat);
    // 锥轴原指向 -Y：转成水平，两瓣成一条直线，并略微压向湖面
    lobe.rotation.x = sgn * (Math.PI / 2 - TILT);
    lobe.renderOrder = 6;
    lobe.frustumCulled = false;
    beam.add(lobe);
  }
  beam.position.copy(LAMP);
  beam.rotation.order = 'YXZ';
  beamRoot.add(beam);

  // 湖面上的亮扇：与空中光锥同一根轴，转同一个角。
  // 只画开阔水面——贴着岸的地方用烘好的高程图把扇形切掉，免得爬到陆地上。
  const fanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uStrength: { value: 1 }, uMap: { value: T.beamGrad() },
      uColor: { value: new THREE.Color(PAL.beamWhite) },
      uDepthMap: { value: depthTexture() },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uStrength; uniform sampler2D uMap; uniform vec3 uColor;
      uniform sampler2D uDepthMap;
      varying vec2 vUv; varying vec3 vW;
      void main(){
        float m = texture2D(uMap, vUv).a;
        float e = texture2D(uDepthMap, (vW.xz + ${MAP_HALF.toFixed(1)}) / ${(2 * MAP_HALF).toFixed(1)}).r * 32.0 - 24.0;
        float water = smoothstep(1.5, -0.5, e);
        // 夜里湖面上不是均匀亮，而是一段段被涌切碎的光
        float chop = 0.72 + 0.28*sin(vUv.x*46.0 - uTime*2.6) * sin(vUv.x*13.0 + uTime*1.1);
        gl_FragColor = vec4(uColor * 1.15, m * chop * uStrength * water * 0.16);
      }`,
  });
  const HALF_ANG = 0.075;
  const fan = new THREE.Group();
  for (const sgn of [1, -1]) {
    // 扇形绕局部 +Y 张开，铺平后 +Y 落到 -Z，正好接上 sgn=+1 那瓣光锥
    const center = sgn * Math.PI / 2;
    const sec = new THREE.Mesh(
      new THREE.RingGeometry(90, BEAM_LEN * 0.9, 30, 1, center - HALF_ANG, HALF_ANG * 2),
      fanMat,
    );
    // RingGeometry 的 uv 是盒状坐标，改成 沿射程=u / 横向=v 才能对上 beamGrad 的渐变
    const uvA = sec.geometry.attributes.uv, pA = sec.geometry.attributes.position;
    for (let i = 0; i < uvA.count; i++) {
      const px = pA.getX(i), py = pA.getY(i);
      const r = (Math.hypot(px, py) - 90) / (BEAM_LEN * 0.9 - 90);
      uvA.setXY(i, Math.max(0, r), 0.5 + (Math.atan2(py, px) - center) / (HALF_ANG * 2));
    }
    uvA.needsUpdate = true;
    sec.rotation.x = -Math.PI / 2;
    sec.renderOrder = 4;
    fan.add(sec);
  }
  fan.position.set(LX, 0.16, LZ);
  fan.rotation.order = 'YXZ';
  beamRoot.add(fan);

  const spin = (2 * Math.PI) / 12;   // 12 秒一转
  return {
    group: grp,
    LAMP,
    lampLight,
    update(t, strength = 1) {
      const a = t * spin;
      beam.rotation.y = a;
      fan.rotation.y = a;
      const pulse = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(a * 2)), 2.2);
      const s = strength * pulse;
      beamMat.uniforms.uTime.value = t;
      beamMat.uniforms.uStrength.value = s;
      fanMat.uniforms.uTime.value = t;
      fanMat.uniforms.uStrength.value = s * 1.25;
      lampLight.intensity = 210 + 150 * s;
      coreMat.color.copy(CORE_BASE).multiplyScalar(1.1 + 1.5 * s);
      halo.material.opacity = 0.55 + 0.45 * s;
      const hs = 6 + 8 * s;
      halo.scale.set(hs, hs, 1);
    },
  };
}
