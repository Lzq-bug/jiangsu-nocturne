/**
 * 本景自有贴图：山坡的针叶林—裸岩混合、石阶、岩层剖面。
 * softGlow / stone / wood / plaster / roofTiles / plaque / cloudPuff 取根目录
 * src/textures.js，不在这里重复实现，也不改共享文件。
 */
import * as THREE from 'three';

const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function tex(c, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function mix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}

/**
 * 山体表面：夜里读出来的是一坡一坡的黑松与灰白裸岩。
 * 顶点色按海拔与坡度染，贴图负责的是细部（树冠斑点、岩面裂纹）。
 */
export function forestRock() {
  return memo('forestRock', () => {
    const { c, x } = canvas(512, 512);
    x.fillStyle = '#3d4a3e'; x.fillRect(0, 0, 512, 512);
    // 松杉的团冠：扁锥形的暗绿点阵，密度不均
    for (let i = 0; i < 2600; i++) {
      const px = Math.random() * 512, py = Math.random() * 512;
      const r = 2.2 + Math.random() * 5.4;
      x.fillStyle = mix('#2f3d31', '#12190f', Math.random() * 0.85);
      x.globalAlpha = 0.5 + Math.random() * 0.45;
      x.beginPath();
      x.moveTo(px, py - r * 1.5);
      x.lineTo(px + r, py + r);
      x.lineTo(px - r, py + r);
      x.closePath();
      x.fill();
    }
    x.globalAlpha = 1;
    // 岩面：一组灰白长条裂纹，斜着穿过贴图
    for (let i = 0; i < 40; i++) {
      const px = Math.random() * 512, py = Math.random() * 512;
      x.strokeStyle = mix('#7d8290', '#454b58', Math.random());
      x.lineWidth = 1 + Math.random() * 3.4;
      x.globalAlpha = 0.22 + Math.random() * 0.4;
      x.beginPath();
      x.moveTo(px, py);
      x.bezierCurveTo(px + 40, py - 16, px + 80, py + 22, px + 130 + Math.random() * 60, py - 8);
      x.stroke();
    }
    x.globalAlpha = 1;
    // 苔痕与碎石
    for (let i = 0; i < 900; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(120,132,110,0.10)' : 'rgba(8,12,10,0.16)';
      x.fillRect(Math.random() * 512, Math.random() * 512, 1.6 + Math.random() * 3, 1.6 + Math.random() * 3);
    }
    return tex(c, { repeat: [26, 26] });
  });
}

/** 石阶／神道铺装：横条石，踩中段磨亮 */
export function flagstone(base = '#6d7382') {
  return memo(`flag-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#2b2f38'; x.fillRect(0, 0, 256, 256);
    const rows = 8, cols = 3, rh = 256 / rows, cw = 256 / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * cw * 0.5;
      for (let k = -1; k <= cols; k++) {
        const px = off + k * cw, py = r * rh;
        x.fillStyle = mix(base, '#20242c', Math.random() * 0.55);
        x.fillRect(px + 1.6, py + 1.6, cw - 3.2, rh - 3.2);
        for (let i = 0; i < 22; i++) {
          x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
          x.fillRect(px + Math.random() * cw, py + Math.random() * rh, 1.4, 1.4);
        }
      }
    }
    return tex(c, { repeat: [2.2, 16] });
  });
}

/** 岩层剖面：洞天剖视时那一刀的断面，横向层理 + 裂隙 */
export function strata() {
  return memo('strata', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#4a4f5c'; x.fillRect(0, 0, 256, 256);
    let y = 0;
    while (y < 256) {
      const h = 6 + Math.random() * 22;
      x.fillStyle = mix('#6b7180', '#2b2f3a', Math.random());
      x.globalAlpha = 0.85;
      x.fillRect(0, y, 256, h);
      // 层线
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(12,14,18,0.55)';
      x.fillRect(0, y + h - 1.6, 256, 1.8);
      y += h;
    }
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = 'rgba(14,16,22,0.5)';
      x.lineWidth = 0.8 + Math.random() * 2;
      const px = Math.random() * 256;
      x.beginPath();
      x.moveTo(px, 0);
      x.bezierCurveTo(px + 20, 80, px - 24, 170, px + 12, 256);
      x.stroke();
    }
    // 洞壁的水光：局部淡青，表示石灰岩被水溶过
    for (let i = 0; i < 26; i++) {
      const g = x.createRadialGradient(Math.random() * 256, Math.random() * 256, 2, Math.random() * 256 + 40, Math.random() * 256, 60);
      g.addColorStop(0, 'rgba(150,190,200,0.16)');
      g.addColorStop(1, 'rgba(150,190,200,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
    }
    return tex(c, { repeat: [3, 3] });
  });
}

/** 道教幡／幢的布面：竖写的字数由调用方给 */
export function banner(text, { bg = '#8d2f26', fg = '#f4dcae' } = {}) {
  return memo(`banner-${text}`, () => {
    const { c, x } = canvas(128, 512);
    const g = x.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, mix(bg, '#000000', 0.45));
    g.addColorStop(0.5, bg);
    g.addColorStop(1, mix(bg, '#000000', 0.35));
    x.fillStyle = g; x.fillRect(0, 0, 128, 512);
    x.strokeStyle = fg; x.lineWidth = 3;
    x.strokeRect(9, 9, 110, 494);
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const chars = [...text];
    const size = Math.min(74, Math.floor(430 / Math.max(1, chars.length)));
    x.font = `700 ${size}px "STKaiti","KaiTi","Songti SC","Noto Serif CJK SC",serif`;
    chars.forEach((ch, i) => {
      x.fillText(ch, 64, 44 + (i + 0.5) * (424 / chars.length));
    });
    return tex(c, { repeat: [1, 1] });
  });
}

/**
 * 紫铜板壁：像身由 226 块特制紫铜板铆焊而成，所以面上是一套分格缝与铆钉；
 * 远观呈金色（记为紫铜，不是铜绿），雨水竖痕压暗。
 */
export function bronzePanels() {
  return memo('bronzePanels', () => {
    const { c, x } = canvas(512, 512);
    x.fillStyle = '#8a6242'; x.fillRect(0, 0, 512, 512);
    // 板面：一块块略带色差的双曲线板
    const cols = 9, rows = 13;
    const cw = 512 / cols, rh = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const px = k * cw, py = r * rh;
        x.fillStyle = mix('#9c7047', '#5d3d24', Math.random() * 0.8);
        x.globalAlpha = 0.85;
        x.beginPath();
        x.moveTo(px + 3, py + rh - 3);
        x.quadraticCurveTo(px + cw / 2, py + rh * 0.12, px + cw - 3, py + rh - 3);
        x.lineTo(px + cw - 3, py + rh - 3);
        x.closePath();
        x.fill();
        x.globalAlpha = 1;
        // 缝与铆钉
        x.strokeStyle = 'rgba(38,24,14,0.75)';
        x.lineWidth = 2.2;
        x.strokeRect(px + 2, py + 2, cw - 4, rh - 4);
        x.fillStyle = 'rgba(226,196,150,0.5)';
        for (let i = 0; i < 4; i++) {
          x.fillRect(px + 5 + i * (cw - 12) / 3, py + 6, 2.4, 2.4);
          x.fillRect(px + 5 + i * (cw - 12) / 3, py + rh - 8, 2.4, 2.4);
        }
      }
    }
    // 焊缝的亮脊
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = 'rgba(232,206,160,0.16)';
      x.lineWidth = 1.6;
      const py = Math.random() * 512;
      x.beginPath(); x.moveTo(0, py); x.lineTo(512, py + (Math.random() - 0.5) * 8); x.stroke();
    }
    return tex(c, { repeat: [1.4, 2.2] });
  });
}

export { mix, tex, canvas };
