import * as THREE from 'three';
import { lit } from '../kit.js';

/** 城墙的砖与海墁都是这一段的门面，shared textures 里没有，就地造 */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/** 小头灰砖，顺丁相间；夜里靠泛光把砖缝读出来 */
export function brickMap(tone = '#86807c', mortar = '#46423f', weather = 0.5) {
  const [c, x] = canvas(512, 512);
  x.fillStyle = tone; x.fillRect(0, 0, 512, 512);
  const rows = 16, bw = 512 / 4, bh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let i = -1; i < 5; i++) {
      const px = i * bw + off, py = r * bh;
      const v = 0.72 + Math.random() * 0.5;
      x.fillStyle = `rgba(${Math.round(134 * v)},${Math.round(127 * v)},${Math.round(122 * v)},1)`;
      x.fillRect(px + 2, py + 2, bw - 4, bh - 4);
      // 砖面斑驳
      x.fillStyle = `rgba(20,26,36,${0.05 + Math.random() * 0.12 * weather})`;
      for (let k = 0; k < 5; k++) {
        x.fillRect(px + Math.random() * bw, py + Math.random() * bh, 2 + Math.random() * 16, 1 + Math.random() * 4);
      }
    }
    x.fillStyle = mortar;
    x.globalAlpha = 0.75;
    x.fillRect(0, r * bh, 512, 2.5);
    x.globalAlpha = 1;
  }
  // 水痕与苔
  for (let k = 0; k < 40; k++) {
    const gx = Math.random() * 512, gy = Math.random() * 512;
    const g = x.createLinearGradient(gx, gy, gx + 4, gy + 60);
    g.addColorStop(0, `rgba(16,22,30,${0.10 + Math.random() * 0.1})`);
    g.addColorStop(1, 'rgba(16,22,30,0)');
    x.fillStyle = g; x.fillRect(gx, gy, 6, 62);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 马道海墁：条石错缝，湿了会反光 */
export function paveMap(base = '#6b7280', seam = '#3a4050') {
  const [c, x] = canvas(512, 512);
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 10; r++) {
    const off = (r % 3) * 60;
    for (let i = -1; i < 5; i++) {
      const px = i * 128 + off, py = r * 51.2;
      const v = 0.8 + Math.random() * 0.4;
      x.fillStyle = `rgba(${Math.round(150 * v)},${Math.round(156 * v)},${Math.round(168 * v)},1)`;
      x.fillRect(px + 3, py + 3, 122, 45);
      x.fillStyle = `rgba(30,36,48,${0.05 + Math.random() * 0.12})`;
      for (let k = 0; k < 9; k++) x.fillRect(px + Math.random() * 128, py + Math.random() * 51, 1 + Math.random() * 30, 1);
    }
    x.strokeStyle = seam; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(0, r * 51.2); x.lineTo(512, r * 51.2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 环湖路与堤身的碎石 */
export function gravelMap(base = '#4c525f') {
  const [c, x] = canvas(256, 256);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const v = 0.6 + Math.random() * 0.8;
    x.fillStyle = `rgba(${Math.round(120 * v)},${Math.round(126 * v)},${Math.round(138 * v)},0.5)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const TM = {};

export function initTCMaterials() {
  const b = brickMap();
  TM.brick = lit('#b4b6bb', { map: b, rough: 0.94, emissive: '#161513', ei: 0.42, side: THREE.DoubleSide });
  const b2 = brickMap('#7d766f', '#3d3a37', 0.9);
  TM.brickOld = lit('#b0aea9', { map: b2, rough: 0.97, emissive: '#1d1a16', ei: 0.55, side: THREE.DoubleSide });
  const p = paveMap('#4a505a', '#2b3038');
  TM.pave = lit('#8f949c', { map: p, rough: 0.82, emissive: '#101215', ei: 0.26, side: THREE.DoubleSide });
  TM.stone = lit('#c6c8cd', { rough: 0.86, emissive: '#15161a', ei: 0.32, side: THREE.DoubleSide });
  const g = gravelMap();
  TM.gravel = lit('#9aa0ad', { map: g, rough: 0.95, side: THREE.DoubleSide });
  TM.earth = lit('#4a4b52', { rough: 1, side: THREE.DoubleSide });
  // 夜柳：底下有灯，叶子里得留一点暖
  TM.leafNight = lit('#2a3d28', { rough: 0.95, emissive: '#101a0e', ei: 0.45, side: THREE.DoubleSide });
  return TM;
}
