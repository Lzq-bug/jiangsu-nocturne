/**
 * 本场景自有贴图：砖、唐砖、檐口筒瓦。softGlow / plaque / noise / columnFade
 * 直接取根目录 src/textures.js，不重复实现、也不改共享文件。
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

/** 宋皮：清水砖墙，错缝砌，灰浆缝较粗。一皮砖约 0.09 m、砖长约 0.36 m */
export function bricks(base = '#a3927c', joint = '#5c5548', rows = 16, cols = 8, wear = 0.16) {
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
        x.fillStyle = mix(base, '#2a2620', Math.max(0, -j * 0.28) + 0.04);
        x.globalAlpha = 0.72 + 0.28 * Math.min(1, tone);
        x.fillRect(px + 1.4, py + 1.4, cw - 2.8, rh - 2.8);
        x.globalAlpha = 1;
        // 砖面的细麻点
        for (let i = 0; i < 26; i++) {
          x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
          x.fillRect(px + Math.random() * cw, py + Math.random() * rh, 1.3, 1.3);
        }
      }
    }
    // 风化与雨痕：竖向淡痕，让塔身不至于像新砌
    for (let i = 0; i < 22; i++) {
      const gx = Math.random() * 256;
      const g = x.createLinearGradient(gx, 0, gx + 6, 256);
      g.addColorStop(0, 'rgba(20,18,14,0.0)');
      g.addColorStop(0.5, `rgba(20,18,14,${0.05 + Math.random() * 0.09})`);
      g.addColorStop(1, 'rgba(20,18,14,0.0)');
      x.fillStyle = g; x.fillRect(gx - 8, 0, 16, 256);
    }
    return tex(c, { repeat: [3, 1.6] });
  });
}

/** 唐骨：内塔砖色更沉、缝更宽、剥蚀更重 */
export function tangBricks() {
  return memo('tang-bricks', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#3b3126'; x.fillRect(0, 0, 256, 256);
    const rows = 9, cols = 5, rh = 256 / rows, cw = 256 / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = -1; k <= cols; k++) {
        const px = (r % 2) * cw * 0.5 + k * cw, py = r * rh;
        x.fillStyle = mix('#6d5b47', '#241d16', 0.1 + Math.random() * 0.5);
        x.fillRect(px + 2.6, py + 2.6, cw - 5.2, rh - 5.2);
      }
    }
    for (let i = 0; i < 8000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(190,170,140,0.05)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.8, 1.8);
    }
    // 剥蚀坑
    for (let i = 0; i < 26; i++) {
      x.fillStyle = 'rgba(18,14,10,0.30)';
      x.beginPath();
      x.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 9, 2 + Math.random() * 5, Math.random() * 3, 0, 7);
      x.fill();
    }
    return tex(c, { repeat: [2.4, 1.4] });
  });
}

/** 檐口筒瓦：u 沿出檐方向（放射），v 沿环向 */
export function tileBand(base = '#454f66', rib = '#69748f') {
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

/** 地坪：土路 + 残砖散石 */
export function yardGround() {
  return memo('yard-ground', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#4a463a'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(150,140,118,0.09)' : 'rgba(20,18,14,0.12)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 1.6 + Math.random() * 3);
    }
    // 散落的砖块与石条
    for (let i = 0; i < 130; i++) {
      x.fillStyle = mix('#7c6f5c', '#2b2620', Math.random() * 0.7);
      x.save();
      x.translate(Math.random() * 256, Math.random() * 256);
      x.rotate(Math.random() * 3.14);
      x.fillRect(-7, -3, 14, 6);
      x.restore();
    }
    return tex(c, { repeat: [14, 14] });
  });
}

function mix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}

export { mix };
