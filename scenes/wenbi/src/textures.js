/**
 * 本场景自有贴图：塔身清水砖、檐口筒瓦、草坪、石板路。
 * softGlow / plaque / stone / wood / plaster / noise / columnFade / lanternPaper
 * 一律取仓库根的 src/textures.js，不重复实现、也不改共享文件。
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

/**
 * 塔身砖：光绪末重建的清水砖墙，错缝砌、灰浆缝较粗。
 * 一皮砖约 0.11 m、砖长约 0.38 m，1982 年补砌的新砖偏浅。
 */
export function bricks(base = '#a8977f', joint = '#5d5648', rows = 14, cols = 7, wear = 0.17) {
  return memo(`bricks-${base}-${rows}-${cols}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = joint; x.fillRect(0, 0, 256, 256);
    const rh = 256 / rows, cw = 256 / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * cw * 0.5;
      for (let k = -1; k <= cols; k++) {
        const px = off + k * cw, py = r * rh;
        const j = (Math.random() - 0.5) * 2;
        const tone = 1 + j * wear;
        x.fillStyle = mix(base, '#2a2620', Math.max(0, -j * 0.3) + 0.04);
        x.globalAlpha = 0.72 + 0.28 * Math.min(1, tone);
        x.fillRect(px + 1.6, py + 1.6, cw - 3.2, rh - 3.2);
        x.globalAlpha = 1;
        for (let i = 0; i < 26; i++) {
          x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
          x.fillRect(px + Math.random() * cw, py + Math.random() * rh, 1.3, 1.3);
        }
      }
    }
    // 雨痕与风化：竖向淡痕，别让塔身像新砌
    for (let i = 0; i < 24; i++) {
      const gx = Math.random() * 256;
      const g = x.createLinearGradient(gx, 0, gx + 6, 256);
      g.addColorStop(0, 'rgba(20,18,14,0.0)');
      g.addColorStop(0.5, `rgba(20,18,14,${0.05 + Math.random() * 0.1})`);
      g.addColorStop(1, 'rgba(20,18,14,0.0)');
      x.fillStyle = g; x.fillRect(gx - 8, 0, 16, 256);
    }
    return tex(c, { repeat: [3, 1.6] });
  });
}

/** 檐口筒瓦：u 沿出檐方向（放射），v 沿环向 */
export function tileBand(base = '#414b62', rib = '#66718c') {
  return memo(`tileband-${base}`, () => {
    const { c, x } = canvas(128, 64);
    x.fillStyle = base; x.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 16; i++) {
      const u = i * 8;
      const g = x.createLinearGradient(u, 0, u + 8, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.45)');
      g.addColorStop(0.45, rib);
      g.addColorStop(0.62, '#8c9ab4');
      g.addColorStop(1, 'rgba(0,0,0,0.42)');
      x.fillStyle = g; x.fillRect(u, 0, 8, 64);
    }
    for (let j = 0; j < 6; j++) {
      x.fillStyle = 'rgba(0,0,0,0.22)';
      x.fillRect(0, j * 11 + 2, 128, 1.6);
    }
    return tex(c, { repeat: [6, 1] });
  });
}

/** 草坪：夜里就是一层起球的深绿 */
export function lawn(base = '#6d7350') {
  return memo(`lawn-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = mix(base, '#101408', 0.62); x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      const t = Math.random();
      x.fillStyle = mix(base, '#0b0f07', t * 0.8);
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.4 + Math.random() * 3, 1 + Math.random() * 2.2);
    }
    for (let i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(12,16,9,0.35)';
      x.beginPath();
      x.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 16, 3 + Math.random() * 8, Math.random() * 3, 0, 7);
      x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 石板路：条石错缝，缝里长着草 */
export function paving(base = '#8c9098') {
  return memo(`paving-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = mix(base, '#1a1e24', 0.75); x.fillRect(0, 0, 256, 256);
    const rows = 6;
    const rh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      let px = -((r % 2) * 40 + 20);
      while (px < 256) {
        const w = 58 + Math.random() * 46;
        const tone = 0.72 + Math.random() * 0.4;
        x.fillStyle = mix(base, '#20242c', Math.max(0, 1 - tone) + 0.12);
        x.globalAlpha = Math.min(1, tone);
        x.fillRect(px + 2.4, r * rh + 2.4, w - 4, rh - 4.4);
        x.globalAlpha = 1;
        for (let i = 0; i < 90; i++) {
          x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.08)';
          x.fillRect(px + Math.random() * w, r * rh + Math.random() * rh, 1.6, 1.4);
        }
        px += w;
      }
    }
    // 缝里的草
    for (let i = 0; i < 260; i++) {
      x.fillStyle = 'rgba(52,66,40,0.5)';
      x.fillRect(Math.random() * 256, Math.floor(Math.random() * rows) * rh + rh - 2, 3 + Math.random() * 9, 2.4);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

function mix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}

export { mix };
