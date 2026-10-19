import * as THREE from 'three';
import { mergeAll, glow, mesh, lit, rand, rr } from './kit.js';
import * as T from './textures.js';

/**
 * 灯。这一景的亮几乎全靠灯壳自己发光，而不是靠灯去照东西：
 * SwiftShader 下真实灯光的第一成本很高，全镇几百盏窗灯若各挂一盏 PointLight
 * 就再也截不出图。所以规矩是——"亮"用发光面与加性光晕假做，
 * "照"只留给十几盏真实灯（见 props.js 的 realLights）。
 */

export const LAMP_COLORS = {
  paper: '#ffd9a0',
  warm: '#ffb265',
  red: '#ff8a5c',
  cool: '#bcd6e6',
};

/** 一只圆灯笼的几何：壳 + 芯 + 上下两道箍 */
export function lanternGeo(r = 0.3, { squash = 1.3, seed = 0 } = {}) {
  const shell = new THREE.SphereGeometry(r, 9, 7);
  shell.scale(1, squash, 1);
  const top = new THREE.CylinderGeometry(r * 0.4, r * 0.52, r * 0.34, 7);
  top.translate(0, r * squash * 1.02, 0);
  const bottom = new THREE.CylinderGeometry(r * 0.44, r * 0.3, r * 0.26, 7);
  bottom.translate(0, -r * squash * 1.0, 0);
  const tassel = new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.9, 4);
  tassel.translate(0, -r * squash - r * 0.4, 0);
  const g = mergeAll([shell, top, bottom, tassel]);
  void seed;
  return g;
}

/** 一盏灯：发光壳 + 一团加性光晕；返回一个 Group，调用方摆位置 */
export function lampObject({ r = 0.3, tint = LAMP_COLORS.warm, halo = 2.0, bright = 1.4, name = 'lamp' } = {}) {
  const grp = new THREE.Group();
  grp.name = name;
  const shell = new THREE.Mesh(lanternGeo(r), glow(tint, bright));
  shell.castShadow = false;
  grp.add(shell);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,190,130', 0.05), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  s.scale.set(halo, halo, 1);
  s.name = 'lamp-halo';
  grp.add(s);
  return grp;
}

/**
 * 一长串灯合并成一次 draw：沿河与沿街的灯笼都走这条路。
 * 每盏的半径、色温与挂高都略有不同，不然一串灯像一个。
 */
export function lampBatch(spots, { tint = LAMP_COLORS.warm, bright = 1.4 } = {}) {
  const geos = [];
  const halos = [];
  for (const [x, y, z, r] of spots) {
    const g = lanternGeo(r ?? rr(0.24, 0.34));
    g.translate(x, y, z);
    geos.push(g);
    halos.push([x, y, z, (r ?? 0.3) * 7.4]);
  }
  const shells = mesh(mergeAll(geos), glow(tint, bright));
  shells.name = 'lantern-shells';
  const glowMesh = haloPoints(halos, tint);
  return { shells, halos: glowMesh };
}

/** 一片加性光晕：一整个 Points，几百盏灯一次 draw */
export function haloPoints(spots, tint = LAMP_COLORS.warm) {
  const pos = new Float32Array(spots.length * 3);
  const size = new Float32Array(spots.length);
  const col = new Float32Array(spots.length * 3);
  const c = new THREE.Color(tint);
  spots.forEach(([x, y, z, s = 2.4], i) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    size[i] = s;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uMap: { value: T.softGlow('255,196,132', 0.05) }, uStrength: { value: 1 } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vCol;
      void main(){
        vCol = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uStrength; varying vec3 vCol;
      void main(){
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vCol * (0.9 + 0.35 * uStrength), a * uStrength * 0.86);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.name = 'lamp-halos';
  p.renderOrder = 6;
  p.frustumCulled = false;
  return p;
}

/** 一盏贴水的河灯：一片亮壳加一点光晕，漂在水上 */
export function floatLamp(x, z, phase) {
  const grp = new THREE.Group();
  grp.position.set(x, 0.05, z);
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.16, 0.16, 8),
    glow('#ffb45e', 1.5),
  );
  cup.position.y = 0.06;
  grp.add(cup);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,180,110', 0.08), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  flame.scale.set(1.3, 1.3, 1);
  flame.position.y = 0.28;
  flame.name = 'lamp-halo';
  grp.add(flame);
  grp.userData.phase = phase;
  return grp;
}

/** 一块发光的额匾 / 对联：字由 textures.calligraphy 画出来 */
export function plaque(text, w, h, { board = '#2b2118', glowTint = null, ei = 0, vertical = false } = {}) {
  const ar = w / h;
  const cw = ar >= 1 ? 512 : Math.max(72, Math.round(512 * ar));
  const ch = ar >= 1 ? Math.max(72, Math.round(512 / ar)) : 512;
  const map = T.calligraphy(text, { w: cw, h: ch, board, vertical, size: vertical ? 0.78 : 0.74 });
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    map, roughness: 0.66, metalness: 0.1,
    emissive: new THREE.Color(glowTint || '#000000'),
    emissiveIntensity: glowTint ? (ei || 0.5) : 0,
    emissiveMap: glowTint ? map : null,
  });
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  grp.add(face);
  const frame = lit(board, { rough: 0.8 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.1), frame);
  back.position.z = -0.06;
  grp.add(back);
  return grp;
}
