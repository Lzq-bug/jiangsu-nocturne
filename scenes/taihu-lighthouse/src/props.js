import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, STATIONS } from './data.js';
import { M, PAL, glow, lit, mesh, box, figureGeo, rand, rr } from './kit.js';
import { elev, isLand, slopeAt } from './terrain.js';
import * as T from './textures.js';

/**
 * 会动、会亮的那一层：夜樱林、湖上的游船与航迹、步道上的游人。
 * 樱花在夜里靠上照灯，所以树冠的亮度是烘进顶点色的——下亮上暗，
 * 比挂几十个聚光灯便宜得多，也更接近实拍夜樱的观感。
 */

const clamp = THREE.MathUtils.clamp;

/* ------------------------------------------------------------------ 夜樱 */

/** 一棵树：短干 + 两层横撑的花盘，下缘被上照灯打亮 */
function cherryTreeGeo() {
  // mergeGeometries 要求所有分片的属性集一致：要么都带 color，要么都不带
  const paint = (g, fn) => {
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const [r, gg, b] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const bark = () => [0.3, 0.26, 0.24];
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.17, 0.4, 2.7, 7);
  trunk.translate(0, 1.35, 0);
  parts.push(paint(trunk, bark));
  for (let i = 0; i < 4; i++) {
    const br = new THREE.CylinderGeometry(0.06, 0.15, 2.1, 5);
    br.translate(0, 2.9, 0);
    br.rotateZ(0.5 + (i % 2) * 0.34);
    br.rotateY(i * 1.57 + 0.4);
    parts.push(paint(br, bark));
  }
  const puffs = [];
  // 树冠是横向撑开的两层盘，不是圆球——否则夜里看就是一群白气球
  for (let i = 0; i < 17; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.4 + Math.pow(rand(), 0.45) * 3.1;
    const layer = i % 2;
    const y = 3.2 + layer * 1.05 + rand() * 0.45 - r * 0.12;
    puffs.push([Math.cos(a) * r, y, Math.sin(a) * r, 1.0 + rand() * 0.95]);
  }
  for (const [px, py, pz, s] of puffs) {
    // 每簇自己转一个随机角：所有面片都对齐在 0/90°，交叉处会露出整齐的"刀片"
    const yaw = rand() * Math.PI;
    for (const ry of [yaw, yaw + Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(s * 2.0, s * 1.6);
      // 下缘亮、上缘暗：模拟地面往上打的灯
      parts.push(paint(g, (x, y) => {
        const up = clamp(y / (s * 0.8) * 0.5 + 0.5, 0, 1);
        const b = 1.05 - up * 0.75;
        return [b, b * 0.96, b * 1.02];
      }));
      parts.at(-1).rotateY(ry);
      parts.at(-1).translate(px, py, pz);
    }
  }
  return mergeGeometries(parts, false);
}

function blossomMat() {
  // 花簇必须写深度并做 alpha 裁剪：只开 transparent 的话镜头一进林子，
  // 半透明的面片就会互相叠成一屏牛乳
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#dfe0ec'),
    map: T.blossomPuff(),
    transparent: true, depthWrite: true, alphaTest: 0.3, side: THREE.DoubleSide,
    roughness: 0.9, vertexColors: true,
    emissive: new THREE.Color('#3a3346'), emissiveIntensity: 1,
  });
}

function cherryGrove(scene, columns) {
  const geo = cherryTreeGeo();
  const mat = blossomMat();
  const g = GEO.grove;
  const spots = [];
  for (let i = 0; i < 2600 && spots.length < 210; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.62) * g.r;
    const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r * 0.8;
    const e = elev(x, z);
    if (e < 1.6 || e > 26) continue;
    if (slopeAt(x, z) > 0.46) continue;
    // 桥头与楼基留出空地，别把灯埋在树里
    if (Math.hypot(x - GEO.bridge.x, z - GEO.bridge.z) < 22) continue;
    if (Math.hypot(x - GEO.pavilion.x, z - GEO.pavilion.z) < 18) continue;
    // 机位周围留空：站人的地方不能长树
    if (STATIONS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < 12)) continue;
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 6.2)) continue;
    spots.push([x, z, e]);
  }
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  im.name = 'sakura';
  const d = new THREE.Object3D();
  const tint = new THREE.Color();
  spots.forEach(([x, z, e], i) => {
    const s = rr(0.8, 1.4);
    d.position.set(x, e - 0.3, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.85, 1.2), s);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    // 每棵树差一点色温，避免整片林子像复制粘贴
    im.setColorAt(i, tint.setRGB(rr(0.82, 1.06), rr(0.78, 1.0), rr(0.86, 1.1)));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = false;
  im.frustumCulled = false;
  scene.add(im);

  // 树下一池上照灯的光斑：没有它，灯像是凭空亮的
  const poolGeo = new THREE.CircleGeometry(2.7, 12);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,212,226', 0.1), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity: 0.45,
  });
  poolMat.toneMapped = false;
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, spots.length);
  pools.name = 'sakura-pools';
  spots.forEach(([x, z, e], i) => {
    const s = rr(0.8, 1.5);
    d.position.set(x, e + 0.14, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, 1, s);
    d.updateMatrix();
    pools.setMatrixAt(i, d.matrix);
  });
  pools.instanceMatrix.needsUpdate = true;
  pools.frustumCulled = false;
  scene.add(pools);

  // 沿湖樱带下方拖一道暖光，倒影里才有花岸
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = g.x + Math.cos(a) * g.r * 0.72, z = g.z + Math.sin(a) * g.r * 0.6;
    columns.add(new THREE.Vector3(x, 0, z), PAL.sakura, 3.4, 13, 0.5);
  }
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xffd6e6, 220, 120, 2);
    l.position.set(g.x + (i - 1) * 62, 9, g.z + (i === 1 ? 30 : -18));
    scene.add(l);
    lamps.push(l);
  }

  // 落樱：只在人附近飘，飘出范围就重生
  const N = 900;
  const pg = new THREE.BufferGeometry();
  const pp = new Float32Array(N * 3), pv = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.5) * g.r;
    pp[i * 3] = g.x + Math.cos(a) * r;
    pp[i * 3 + 1] = 3 + rand() * 12;
    pp[i * 3 + 2] = g.z + Math.sin(a) * r * 0.8;
    pv[i * 3] = rr(-0.5, 0.5); pv[i * 3 + 1] = rr(-0.45, -0.15); pv[i * 3 + 2] = rr(-0.5, 0.5);
    ph[i] = rand() * 6.28;
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pm = new THREE.PointsMaterial({
    map: T.petal(), size: 0.34, transparent: true, depthWrite: false,
    color: 0xffe6f0, sizeAttenuation: true, fog: true, opacity: 0.9,
  });
  const petals = new THREE.Points(pg, pm);
  petals.name = 'petals';
  petals.frustumCulled = false;
  scene.add(petals);

  return {
    mesh: im, petals, lamps, pools, spots,
    update(t, strength, camPos) {
      mat.emissiveIntensity = 0.3 + 1.0 * strength;
      mat.color.setRGB(0.5 + 0.55 * strength, 0.5 + 0.53 * strength, 0.55 + 0.55 * strength);
      poolMat.opacity = 0.1 + 0.45 * strength;
      lamps.forEach((l, i) => { l.intensity = 60 + 240 * strength * (0.8 + 0.2 * Math.sin(t * 0.7 + i)); });
      const pos = pg.attributes.position;
      const near = camPos && Math.hypot(camPos.x - g.x, camPos.z - g.z) < 260;
      petals.visible = strength > 0.05 && near;
      if (!petals.visible) return;
      for (let i = 0; i < N; i++) {
        let x = pos.getX(i) + (pv[i * 3] + Math.sin(t * 0.9 + ph[i]) * 0.5) * 0.016;
        let y = pos.getY(i) + pv[i * 3 + 1] * 0.9;
        let z = pos.getZ(i) + (pv[i * 3 + 2] + Math.cos(t * 0.8 + ph[i]) * 0.5) * 0.016;
        if (y < elev(x, z) || Math.hypot(x - g.x, z - g.z) > g.r * 1.2) {
          const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.5) * g.r;
          x = g.x + Math.cos(a) * r; z = g.z + Math.sin(a) * r * 0.8;
          y = 5 + rand() * 10;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 游船 */

/** 夜里跑在太湖上的游船：一串舷灯 + 桅顶白灯 + 一道航迹 */
function boatGeo() {
  const parts = [];
  const hull = new THREE.BoxGeometry(13, 1.7, 3.6);
  hull.translate(0, 0.7, 0);
  parts.push(hull);
  const bow = new THREE.ConeGeometry(1.9, 4.4, 4);
  bow.rotateZ(-Math.PI / 2);
  bow.rotateY(Math.PI / 4);
  bow.translate(8.2, 0.8, 0);
  parts.push(bow);
  const cabin = new THREE.BoxGeometry(7.4, 2.2, 3.0);
  cabin.translate(-0.6, 2.6, 0);
  parts.push(cabin);
  const roof = new THREE.BoxGeometry(8.2, 0.24, 3.4);
  roof.translate(-0.6, 3.8, 0);
  parts.push(roof);
  const mast = new THREE.CylinderGeometry(0.08, 0.1, 3.0, 6);
  mast.translate(3.4, 5.0, 0);
  parts.push(mast);
  return mergeGeometries(parts, false);
}

function fleet(scene, columns) {
  const hullMat = lit('#2c323f', { map: T.wood('#33302f', '#1c1a19'), rough: 0.7 });
  const geo = boatGeo();
  const winMat = glow(PAL.lampGlow, 2.4);
  const c = { x: -300, z: 400 };
  const boats = [];
  for (let i = 0; i < 5; i++) {
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(geo, hullMat);
    hull.castShadow = false;
    grp.add(hull);
    // 舱内的灯：一排窗，夜里就是一条亮的横线
    for (let k = 0; k < 5; k++) {
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), winMat);
        w.position.set(-3.4 + k * 1.5, 2.7, s * 1.53);
        w.rotation.y = s > 0 ? 0 : Math.PI;
        grp.add(w);
      }
    }
    const mast = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ffffff', 3.2));
    mast.position.set(3.4, 6.5, 0);
    grp.add(mast);
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), glow(PAL.navRed, 2.6));
    navR.position.set(8.6, 1.9, -1.5);
    const navG = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), glow(PAL.navGreen, 2.6));
    navG.position.set(8.6, 1.9, 1.5);
    grp.add(navR, navG);
    const l = new THREE.PointLight(0xffc98a, 70, 60, 2);
    l.position.set(0, 4, 0);
    grp.add(l);

    // 航迹：船尾两片渐隐的泡沫
    const wakeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uMap: { value: T.foam() }, uTime: { value: 0 }, uOn: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uTime; uniform float uOn; varying vec2 vUv;
        void main(){
          float m = texture2D(uMap, vec2(fract(vUv.x - uTime*0.06), vUv.y)).a;
          float fade = vUv.x * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
          gl_FragColor = vec4(vec3(0.62,0.70,0.84), m * fade * uOn * 0.5);
        }`,
    });
    const wake = new THREE.Group();
    for (const s of [-1, 1]) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(52, 3.4), wakeMat);
      q.rotation.x = -Math.PI / 2;
      q.rotation.z = s * 0.1;
      q.position.set(-27, 0.1, s * 1.9);
      wake.add(q);
    }
    grp.add(wake);

    const t0 = i / 5;
    const col = columns.add(new THREE.Vector3(c.x, 0, c.z), PAL.lampWarm, 2.2, 16, 0.9);
    scene.add(grp);
    boats.push({ grp, wake, wakeMat, col, t: t0, speed: 0.010 + (i % 3) * 0.0022, r: 250 + (i % 3) * 70 });
  }
  return {
    boats,
    update(t, dt, speed) {
      for (const b of boats) {
        b.t += dt * b.speed * speed;
        const a = b.t * Math.PI * 2;
        const x = c.x + Math.cos(a) * b.r, z = c.z + Math.sin(a) * b.r * 1.25;
        const nx = c.x + Math.cos(a + 0.01) * b.r, nz = c.z + Math.sin(a + 0.01) * b.r * 1.25;
        b.grp.position.set(x, 0.1 + Math.sin(t * 0.9 + a) * 0.12, z);
        b.grp.rotation.y = Math.atan2(-(nz - z), nx - x) + Math.PI / 2;
        b.grp.rotation.z = Math.sin(t * 1.1 + a) * 0.018;
        b.wakeMat.uniforms.uTime.value = t;
        b.wakeMat.uniforms.uOn.value = clamp(speed, 0, 1);
        columns.setPos(b.col, new THREE.Vector3(x, 0, z));
      }
    },
  };
}

/* ------------------------------------------------------------------ 游人 */

/**
 * 步道上的人流：沿几条路线走，剪影为主。
 * 数量由面板控制，远处直接收掉，不占阴影。
 */
function crowd(scene) {
  const paths = [
    [[12, 190], [-16, 210], [-46, 232], [-52, 240], [-30, 224], [4, 200]],
    [[-58, 152], [-40, 168], [-8, 186], [16, 192], [26, 176]],
    [[296, -46], [262, -70], [232, -96], [212, -118], [244, -104], [278, -78]],
  ].map((pts) => pts.map(([x, z]) => new THREE.Vector3(x, elev(x, z), z)));

  const geo = figureGeo(1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.9 });
  const MAX = 260;
  const im = new THREE.InstancedMesh(geo, mat, MAX);
  im.name = 'crowd';
  im.frustumCulled = false;
  scene.add(im);

  const d = new THREE.Object3D();
  const people = [];
  for (let i = 0; i < MAX; i++) {
    const pi = i % paths.length;
    people.push({
      path: pi, t: rand(), dir: rand() > 0.5 ? 1 : -1,
      sp: rr(0.006, 0.016), s: rr(0.86, 1.16), ph: rand() * 6.28,
    });
  }
  const at = (path, t, out) => {
    const pts = paths[path];
    const f = clamp(t, 0, 0.999999) * (pts.length - 1);
    const i = Math.floor(f);
    out.copy(pts[i]).lerp(pts[Math.min(i + 1, pts.length - 1)], f - i);
    return out;
  };
  const v = new THREE.Vector3();
  return {
    mesh: im,
    update(t, dt, target, camPos) {
      const n = Math.min(MAX, Math.round(target));
      im.count = n;
      for (let i = 0; i < n; i++) {
        const p = people[i];
        p.t += dt * p.sp * p.dir;
        if (p.t > 1 || p.t < 0) { p.t = clamp(p.t, 0, 1); p.dir *= -1; }
        at(p.path, p.t, v);
        const far = camPos ? v.distanceTo(camPos) : 999;
        // 太近的剪影会糊成一块黑板挡住画面，太远则看不出是人
        const hide = far > 190 || far < 5;
        d.position.set(v.x, v.y - 0.05, v.z);
        d.rotation.set(0, p.t * 12 * p.dir, Math.sin(t * 3 + p.ph) * 0.03);
        const s = hide ? 0 : p.s;
        d.scale.set(s, s * (1 + Math.sin(t * 6 + p.ph) * 0.012), s);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 步道灯 */

function pathLamps(scene, columns) {
  const grp = new THREE.Group();
  const spots = [];
  const along = [
    [[8, 186], [-14, 202], [-34, 218], [-50, 232]],
    [[-56, 158], [-40, 168], [-18, 182], [2, 190]],
    [[290, -44], [258, -66], [228, -92], [206, -112]],
  ];
  for (const line of along) {
    for (const [x, z] of line) spots.push([x, z]);
  }
  const poleGeo = mesh([
    box(0.16, 3.1, 0.16, 0, 1.55, 0),
    box(0.34, 0.16, 0.34, 0, 3.2, 0),
    new THREE.CylinderGeometry(0.3, 0.42, 0.5, 6).translate(0, 3.5, 0),
  ], M.iron);
  const head = new THREE.SphereGeometry(0.24, 9, 7);
  const hm = glow(PAL.lampGlow, 2.6);
  for (const [x, z] of spots) {
    const y = elev(x, z);
    const p = poleGeo.clone();
    p.position.set(x, y, z);
    grp.add(p);
    const h = new THREE.Mesh(head, hm);
    h.position.set(x, y + 3.52, z);
    grp.add(h);
    // 水面倒影只在真挨着水的地方才画
    if (isLand(x, z) && Math.abs(elev(x, z)) < 6) columns.add(new THREE.Vector3(x, 0, z), PAL.lampWarm, 1.2, 12, 0.8);
  }
  const l = new THREE.PointLight(0xffc07a, 90, 90, 2);
  l.position.set(-34, elev(-34, 218) + 4, 218);
  grp.add(l);
  const l2 = new THREE.PointLight(0xffc07a, 90, 90, 2);
  l2.position.set(228, elev(228, -92) + 4, -92);
  grp.add(l2);
  scene.add(grp);
  return grp;
}

/* ------------------------------------------------------------------ assemble */

export function buildProps(scene, columns) {
  const grove = cherryGrove(scene, columns);
  const fleet_ = fleet(scene, columns);
  const crowd_ = crowd(scene);
  const lamps = pathLamps(scene, columns);
  return {
    grove, fleet: fleet_, crowd: crowd_, lamps,
    update(t, dt, state, camPos) {
      grove.update(t, state.sakura, camPos);
      fleet_.update(t, dt, state.boats);
      crowd_.update(t, dt, state.crowd, camPos);
    },
  };
}
