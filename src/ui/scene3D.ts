/**
 * 夜景 3D 场景建模器(Three.js 运行时几何体建模)
 * 依据卡牌的景点母题(motifs)与主光色(accent),用基础几何体建模出一座
 * 可 360° 环顾的夜景微城:环场建筑体块、地标构筑物、轮廓灯与灯笼、
 * 水面与实时倒影、星空月色与雾气。同一卡牌永远建出同一座场景。
 */
import * as THREE from 'three';
import type { CardData, MotifKind } from '@/tarot/types';
import { hashSeed } from './nightScene';

const WARM = '#ffd58a';

function rng(seedStr: string): () => number {
  let a = hashSeed(seedStr) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (color: string, opts?: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
const glow = (color: string, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}
function prismRoof(w: number, d: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h, 4), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.PI / 4;
  return mesh;
}

/** 檐角灯(暖光小方块+光晕 Sprite) */
function lantern(x: number, y: number, z: number, accent: string): THREE.Group {
  const g = new THREE.Group();
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow(WARM));
  lamp.position.set(x, y, z);
  const haloTex = glowTexture(accent);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0.85, depthWrite: false }));
  sprite.scale.set(0.8, 0.8, 1);
  sprite.position.set(x, y, z);
  g.add(lamp, sprite);
  return g;
}

let haloCache: THREE.Texture | null = null;
function glowTexture(accent: string): THREE.Texture {
  if (haloCache) return haloCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, WARM);
  grad.addColorStop(0.35, accent);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  haloCache = new THREE.CanvasTexture(c);
  return haloCache;
}

/* ---------------- 地标构筑物(按母题) ---------------- */

function landmark(kind: MotifKind, rnd: () => number, accent: string): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('#1b2447', { emissive: '#141d40', emissiveIntensity: 0.5 });
  const roofM = mat('#1a2240');
  const lit = glow(WARM, 0.95);
  const acc = glow(accent, 0.95);

  switch (kind) {
    case 'pagoda': {
      let w = 2.6;
      let y = 0;
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const bh = 1.1;
        g.add(box(w, bh, w, dark, 0, y + bh / 2, 0));
        g.add(box(w * 0.16, bh * 0.7, w * 0.16, lit, 0, y + bh / 2, 0));
        const eave = new THREE.Mesh(new THREE.ConeGeometry(w * 0.92, 0.5, 4), roofM);
        eave.position.y = y + bh + 0.25;
        eave.rotation.y = Math.PI / 4;
        g.add(eave);
        y += bh + 0.5;
        w *= 0.84;
      }
      g.add(box(0.12, 0.9, 0.12, dark, 0, y + 0.45, 0));
      g.add(lantern(0, y + 1, 0, accent));
      break;
    }
    case 'temple': {
      g.add(box(4.4, 1.7, 2.8, dark, 0, 0.85, 0));
      const r1 = prismRoof(5.4, 3.6, 1.1, roofM, 0, 2.2, 0);
      g.add(r1);
      g.add(box(3, 1.3, 2, dark, 0, 3.3, 0));
      g.add(prismRoof(3.8, 2.7, 0.9, roofM, 0, 4.3, 0));
      for (const x of [-1.6, 1.6]) g.add(lantern(x, 1.2, 1.5, accent));
      g.add(box(0.5, 0.7, 0.5, lit, 0, 0.35, 1.45));
      break;
    }
    case 'pavilion': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(box(0.16, 1.7, 0.16, dark, Math.cos(a) * 1.15, 0.85, Math.sin(a) * 1.15));
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.2, 6), roofM);
      roof.position.y = 2.3;
      g.add(roof);
      g.add(box(2.6, 0.22, 2.6, dark, 0, 0.11, 0));
      g.add(lantern(0, 1.6, 0, accent));
      break;
    }
    case 'bridge': {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.28, 10, 24, Math.PI), dark);
      arch.position.y = 0.1;
      g.add(arch);
      g.add(box(4.6, 0.18, 1.5, dark, 0, 1.72, 0));
      for (let i = -2; i <= 2; i++) g.add(box(0.08, 0.5, 0.08, dark, i * 1.0, 2.05, 0.6));
      g.add(lantern(-2.1, 2.2, 0.6, accent));
      g.add(lantern(2.1, 2.2, 0.6, accent));
      break;
    }
    case 'ferry': {
      g.add(box(3.4, 0.6, 1.2, dark, 0, 0.32, 0));
      g.add(box(2.4, 0.8, 0.9, roofM, 0, 1.0, 0));
      g.add(prismRoof(2.8, 1.2, 0.6, dark, 0, 1.7, 0));
      for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(lantern(x, 0.85, 0.62, accent));
      break;
    }
    case 'gate': {
      g.add(box(1.1, 3.2, 1.6, dark, -1.5, 1.6, 0));
      g.add(box(1.1, 3.2, 1.6, dark, 1.5, 1.6, 0));
      g.add(box(4.6, 0.9, 1.8, dark, 0, 3.7, 0));
      g.add(prismRoof(5.2, 2.4, 0.8, roofM, 0, 4.55, 0));
      g.add(lantern(0, 3.1, 0.95, accent));
      break;
    }
    case 'wall': {
      g.add(box(7.5, 1.7, 1.1, dark, 0, 0.85, 0));
      for (let i = 0; i < 7; i++) g.add(box(0.5, 0.4, 1.1, dark, -3.15 + i * 1.05, 1.9, 0));
      for (let i = 0; i < 4; i++) g.add(lantern(-2.4 + i * 1.6, 1.95, 0.6, accent));
      break;
    }
    case 'skyscraper': {
      g.add(box(1.5, 7.5, 1.5, dark, 0, 3.75, 0));
      g.add(box(1.0, 5.2, 1.0, mat('#0f1730'), -1.5, 2.6, 0.3));
      g.add(box(1.0, 6.1, 1.0, mat('#0f1730'), 1.6, 3.05, -0.2));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), dark);
      ant.position.y = 8.2;
      g.add(ant);
      g.add(lantern(0, 9.0, 0, accent));
      for (let i = 0; i < 5; i++) {
        g.add(box(1.52, 0.06, 0.06, acc, 0, 1.2 + i * 1.3, 0.76));
        g.add(box(0.06, 0.06, 1.52, acc, 0.76, 1.7 + i * 1.1, 0));
      }
      break;
    }
    case 'lighthouse': {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 3.6, 12), dark);
      tower.position.y = 1.8;
      g.add(tower);
      g.add(box(1.15, 0.35, 1.15, roofM, 0, 3.75, 0));
      const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 10), lit);
      lampRoom.position.y = 4.15;
      g.add(lampRoom);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.45, 10), roofM);
      cap.position.y = 4.6;
      g.add(cap);
      g.add(lantern(0, 4.15, 0, accent));
      break;
    }
    case 'buddha': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.45, 2.4, 14), mat('#1c2440'));
      body.position.y = 1.9;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), mat('#1c2440'));
      head.position.y = 3.5;
      g.add(head);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 32), acc);
      halo.position.set(0, 3.5, -0.25);
      g.add(halo);
      const lotus = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 0.5, 18), roofM);
      lotus.position.y = 0.25;
      g.add(lotus);
      for (let i = 0; i < 3; i++) g.add(lantern(-1.1 + i * 1.1, 0.8, 1.8, accent));
      break;
    }
    case 'hill': {
      for (const [x, r, h] of [[-1.6, 2.6, 2.6], [1.4, 3.2, 3.4], [0, 2.2, 2.0]] as const) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat('#182142'));
        cone.position.set(x, h / 2, -0.4);
        g.add(cone);
      }
      g.add(lantern(0.2, 2.6, 0.4, accent));
      break;
    }
    case 'garden': {
      g.add(box(4.6, 2.4, 0.7, dark, 0, 1.2, 0));
      const moon = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.14, 10, 28), acc);
      moon.position.set(0, 1.05, 0.4);
      g.add(moon);
      const wallHole = new THREE.Mesh(new THREE.CircleGeometry(0.78, 24), new THREE.MeshBasicMaterial({ color: '#0a0f22' }));
      wallHole.position.set(0, 1.05, 0.41);
      g.add(wallHole);
      g.add(prismRoof(1.6, 1.2, 0.6, roofM, 1.9, 3.0, 0));
      g.add(lantern(-1.5, 1.6, 0.5, accent));
      break;
    }
    case 'banner': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4), dark);
      pole.position.set(-0.9, 2.2, 0);
      g.add(pole);
      const flag = box(0.06, 1.3, 1.9, glow(accent, 0.85), -0.9, 3.5, 1.0);
      g.add(flag);
      g.add(box(2.8, 1.9, 1.5, dark, 0.9, 0.95, 0));
      g.add(prismRoof(3.3, 2.0, 0.7, roofM, 0.9, 2.25, 0));
      g.add(lantern(0.9, 2.0, 0.85, accent));
      break;
    }
    case 'street': {
      for (let i = 0; i < 3; i++) {
        const w = 1.5 + rnd() * 0.6;
        const h = 1.2 + rnd() * 1.1;
        g.add(box(w, h, 1.4, dark, -1.8 + i * 1.85, h / 2, 0));
        g.add(prismRoof(w * 1.15, 1.6, 0.5, roofM, -1.8 + i * 1.85, h + 0.25, 0));
        g.add(box(0.24, 0.3, 0.05, lit, -1.8 + i * 1.85, h * 0.55, 0.71));
      }
      g.add(lantern(-1.2, 2.1, 0.9, accent));
      g.add(lantern(0.4, 2.2, 0.9, accent));
      g.add(lantern(1.9, 2.05, 0.9, accent));
      break;
    }
    case 'sea':
    case 'lake':
    default: {
      // 开阔水面:远景低岸线 + 小船
      g.add(box(6, 0.5, 0.8, mat('#101832'), 0, 0.25, -1.2));
      g.add(box(1.2, 0.5, 0.5, dark, 0.6, 0.55, 0.2));
      g.add(lantern(0.6, 1.0, 0.2, accent));
      break;
    }
  }
  return g;
}

/* ---------------- 场景组装 ---------------- */

export interface Scene3D {
  group: THREE.Group;
  /** 建议的主视方向(地标朝向) */
  dispose: () => void;
}

export function buildNightScene3D(card: CardData): Scene3D {
  const group = new THREE.Group();
  const rnd = rng(card.id);
  const accent = card.accent;

  // 灯光:月光 + 环境
  group.add(new THREE.HemisphereLight('#3a4a8a', '#0b0e20', 2.6));
  const moon = new THREE.DirectionalLight('#cfd8f0', 2.3);
  moon.position.set(-5, 16, 13);
  group.add(moon);

  // 地面(水面)
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(46, 48),
    new THREE.MeshStandardMaterial({ color: '#070b18', roughness: 0.28, metalness: 0.55 }),
  );
  water.rotation.x = -Math.PI / 2;
  group.add(water);

  // 星空
  const starPos: number[] = [];
  for (let i = 0; i < 650; i++) {
    const a = rnd() * Math.PI * 2;
    const el = 0.12 + rnd() * 1.35;
    const r = 60;
    starPos.push(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#dfe6f5', size: 0.14, sizeAttenuation: true }));
  group.add(stars);

  // 月亮(光晕 Sprite)
  const moonTexCanvas = document.createElement('canvas');
  moonTexCanvas.width = moonTexCanvas.height = 96;
  {
    const ctx = moonTexCanvas.getContext('2d')!;
    const g1 = ctx.createRadialGradient(48, 48, 6, 48, 48, 46);
    g1.addColorStop(0, '#f2f5fc');
    g1.addColorStop(0.22, '#e9edf8');
    g1.addColorStop(0.3, 'rgba(233,237,248,0.35)');
    g1.addColorStop(1, 'rgba(233,237,248,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, 96, 96);
  }
  const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(moonTexCanvas), transparent: true, depthWrite: false,
  }));
  moonSpr.scale.set(9, 9, 1);
  moonSpr.position.set(-26, 30, -40);
  group.add(moonSpr);

  // 环场:地标 + 普通建筑(带倒影)
  const city = new THREE.Group();
  const motifs = card.art.motifs.length ? card.art.motifs : (['street'] as MotifKind[]);
  const openWater = motifs.includes('sea') || motifs.includes('lake');

  // 主地标:正对 -Z 方向
  const main = landmark(motifs[0], rnd, accent);
  main.scale.setScalar(1.7);
  main.position.set(0, 0, openWater ? -10 : -9.5);
  city.add(main);

  // 副地标(若有)
  if (motifs[1]) {
    const sub = landmark(motifs[1], rnd, accent);
    const a = rnd() > 0.5 ? 1 : -1;
    sub.position.set(a * 11, 0, -7);
    sub.rotation.y = -a * 0.5;
    city.add(sub);
  }

  // 环场普通建筑
  const count = 16;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.18;
    if (Math.abs(a - Math.PI) < 0.42 && !openWater) continue; // 让主地标正前方留空
    const far = 16 + rnd() * 7;
    const w = 1.6 + rnd() * 2.2;
    const h = 1.4 + rnd() * 3.6;
    const b = box(w, h, w * 0.8, mat('#1a2450', { emissive: '#131e48', emissiveIntensity: 0.6 }), Math.sin(a) * far, h / 2, -Math.cos(a) * far);
    b.rotation.y = a + (rnd() - 0.5) * 0.4;
    city.add(b);
    const roof = prismRoof(w * 1.1, w * 0.9, 0.55, mat('#141c3a'), b.position.x, h + 0.28, b.position.z);
    roof.rotation.y = b.rotation.y;
    city.add(roof);
    // 亮窗
    const wins = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < wins; k++) {
      const wx = b.position.x + (rnd() - 0.5) * w * 0.7;
      const wy = 0.5 + rnd() * (h - 0.8);
      const win = box(0.16, 0.22, 0.05, glow(rnd() > 0.25 ? WARM : accent, 0.9), 0, 0, 0);
      win.position.set(wx, wy, b.position.z + Math.cos(a) * (w * 0.41));
      win.rotation.y = a;
      // 面向圆心
      win.position.set(b.position.x - Math.sin(a) * (w * 0.41), wy, b.position.z + Math.cos(a) * (w * 0.41));
      city.add(win);
    }
    if (rnd() > 0.55) city.add(lantern(b.position.x * 0.86, 1.9, b.position.z * 0.86, accent));
  }

  // 灯笼串(面向主地标的近岸)
  if (!openWater) {
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) / 3;
      city.add(lantern(t * 6.5, 2.1 - Math.abs(t) * 0.25, -6.2, accent));
    }
  }

  // 倒影:整体克隆,压扁到水面以下
  const reflection = city.clone(true);
  reflection.scale.y = -1;
  reflection.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh || (o as THREE.Sprite).isSprite) {
      const m = (mesh.material ?? (o as THREE.Sprite).material) as THREE.Material;
      if (m) {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.2;
        c.depthWrite = false;
        mesh.material = c;
      }
    }
  });
  group.add(city, reflection);

  return {
    group,
    dispose: () => {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m?.dispose();
      });
    },
  };
}
