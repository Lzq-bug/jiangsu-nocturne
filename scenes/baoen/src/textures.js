/**
 * 本景自有贴图：琉璃釉砖（白釉为地）、黄绿赭彩檐口、券面六拏具、探方文化层、
 * 寺地铺砖。softGlow / plaque / noise / columnFade 仍取根目录 src/textures.js，
 * 不改共享文件。
 *
 * 颜色口径：实物为陶胎施黄、绿、赭釉（南京博物院藏品），白釉砖为塔身主调之说见于
 * 《金陵大报恩寺塔志》；1844 年西人游记得"绿色琉璃砖"。此处取"白地为多、彩釉为饰"，
 * 并把塔身的 字号 划印做成极淡的隐文——刻款实物照片无从核，字面属示意。
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

/** 开片：釉面上细碎裂纹，让"白磁砖"看着像釉而非石 */
function crackle(x, w, h, n, color = 'rgba(60,52,40,0.20)') {
  x.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    x.lineWidth = 0.5 + Math.random() * 0.9;
    x.beginPath();
    let px = Math.random() * w, py = Math.random() * h;
    x.moveTo(px, py);
    const steps = 3 + (Math.random() * 5 | 0);
    for (let k = 0; k < steps; k++) {
      px += (Math.random() - 0.5) * 34;
      py += (Math.random() - 0.5) * 34;
      x.lineTo(px, py);
    }
    x.stroke();
  }
}

/**
 * 塔身琉璃砖：一块砖一格，模数按单件约 0.50×0.47 m。
 * 一列 8 块 × 8 行，砖缝极细（"斗榫合缝"）。
 */
export function glazedBrick(base = '#ded8c6', cold = '#b9c3cf') {
  return memo(`glaze-${base}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    const cols = 8, rows = 8, cw = S / cols, rh = S / rows;
    x.fillStyle = '#3a352b'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const px = k * cw, py = r * rh;
        const t = Math.random();
        // 白釉为地，间以冷青与微黄——同一窑内釉色不匀是实物常态
        x.fillStyle = mix(mix(base, cold, t * 0.45), '#efe6cf', Math.random() * 0.4);
        x.fillRect(px + 1.6, py + 1.6, cw - 3.2, rh - 3.2);
        // 釉面高光在上沿
        const g = x.createLinearGradient(px, py, px, py + rh);
        g.addColorStop(0, 'rgba(255,255,255,0.16)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.02)');
        g.addColorStop(1, 'rgba(20,16,12,0.14)');
        x.fillStyle = g; x.fillRect(px + 1.6, py + 1.6, cw - 3.2, rh - 3.2);
        // 极淡的字号隐文（刻款无照片可核，属示意）
        if (Math.random() > 0.62) {
          x.save();
          x.translate(px + cw * 0.5, py + rh * 0.55);
          x.fillStyle = 'rgba(72,58,42,0.16)';
          x.font = `${Math.round(rh * 0.34)}px "KaiTi","STKaiti",serif`;
          x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText('左中上下一二三四五六七八九十百'.charAt(1 + (Math.random() * 15 | 0)), 0, 0);
          x.restore();
        }
      }
    }
    crackle(x, S, S, 120, 'rgba(70,62,48,0.13)');
    return tex(c, { repeat: [1, 1] });
  });
}

/** 彩釉带：檐口、平座、门框等处的黄绿赭彩琉璃 */
export function glazeBand(green = '#3f7a5e', ochre = '#a86b34') {
  return memo('glaze-band', () => {
    const W = 512, H = 128, { c, x } = canvas(W, H);
    x.fillStyle = green; x.fillRect(0, 0, W, H);
    // 三彩相间的一段砖带：绿地为多，黄赭点其缝
    for (let i = 0; i < 16; i++) {
      const px = i * (W / 16);
      x.fillStyle = i % 3 === 0 ? ochre : (i % 3 === 1 ? green : '#4e8b6a');
      x.fillRect(px + 1.5, 2, W / 16 - 3, H - 4);
      if (i % 4 === 2) {
        x.fillStyle = '#b99642';
        x.fillRect(px + 4, H * 0.28, W / 16 - 8, H * 0.44);
      }
    }
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(0, 0, W, 6);
    x.fillStyle = 'rgba(10,8,6,0.26)'; x.fillRect(0, H - 7, W, 7);
    crackle(x, W, H, 60, 'rgba(20,30,24,0.20)');
    return tex(c, { repeat: [4, 1] });
  });
}

/** 檐面琉璃瓦：u 沿出檐方向（放射），v 沿环向 */
export function eaveTiles(base = '#4b6f5e', rib = '#7fae94', hi = '#c3dcc9') {
  return memo('eave-tiles', () => {
    const W = 256, H = 128, { c, x } = canvas(W, H);
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 32; i++) {
      const u = i * (W / 32);
      const g = x.createLinearGradient(u, 0, u + W / 32, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.48)');
      g.addColorStop(0.44, rib);
      g.addColorStop(0.62, hi);
      g.addColorStop(1, 'rgba(0,0,0,0.44)');
      x.fillStyle = g; x.fillRect(u, 0, W / 32, H);
    }
    for (let j = 0; j < 8; j++) {
      x.fillStyle = 'rgba(0,0,0,0.20)';
      x.fillRect(0, j * 16 + 3, W, 2);
    }
    return tex(c, { repeat: [6, 1] });
  });
}

/**
 * 券面六拏具：自上而下大鹏金翅鸟、龙女、摩羯鱼、飞羊、狮子、象王。
 * 构图依南京博物院藏 1958 年中华门外出土拱门残件（九块构件拼合，今存缺狮），
 * 细部造型按同类琉璃构件的常见做法补配，属示意而非摹本。
 */
export function sixBadge() {
  return memo('six-badge', () => {
    const W = 256, H = 640, { c, x } = canvas(W, H);
    const bands = [
      ['#7d5a2c', 'bird'], ['#2f6b57', 'naga'], ['#3a6d86', 'makara'],
      ['#6f7a52', 'ram'], ['#8a5a3a', 'lion'], ['#4f5a6b', 'elephant'],
    ];
    x.fillStyle = '#2a2620'; x.fillRect(0, 0, W, H);
    const bh = H / bands.length;
    bands.forEach(([col, kind], i) => {
      const y = i * bh;
      x.fillStyle = col; x.fillRect(4, y + 4, W - 8, bh - 8);
      const g = x.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, 'rgba(255,255,255,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0.26)');
      x.fillStyle = g; x.fillRect(4, y + 4, W - 8, bh - 8);
      // 浮雕体：一团浅色的身,加两侧卷草
      x.fillStyle = 'rgba(232,214,178,0.80)';
      x.beginPath();
      const cy = y + bh * 0.54;
      if (kind === 'bird') {
        x.moveTo(W / 2, cy - 34); x.lineTo(W / 2 + 54, cy + 14); x.lineTo(W / 2 + 18, cy + 12);
        x.lineTo(W / 2, cy + 34); x.lineTo(W / 2 - 18, cy + 12); x.lineTo(W / 2 - 54, cy + 14);
      } else if (kind === 'naga') {
        x.ellipse(W / 2, cy, 30, 20, 0, 0, 7);
        x.moveTo(W / 2 + 60, cy - 8); x.ellipse(W / 2 + 58, cy - 8, 16, 10, 0.4, 0, 7);
      } else if (kind === 'makara') {
        x.ellipse(W / 2, cy, 46, 18, 0, 0, 7);
        x.moveTo(W / 2 + 40, cy); x.ellipse(W / 2 + 56, cy - 12, 14, 9, 0.6, 0, 7);
      } else if (kind === 'elephant') {
        x.ellipse(W / 2, cy, 38, 24, 0, 0, 7);
        x.moveTo(W / 2 + 30, cy + 8); x.ellipse(W / 2 + 44, cy + 20, 8, 16, 0.2, 0, 7);
      } else {
        x.ellipse(W / 2, cy, 34, 22, 0, 0, 7);
        x.moveTo(W / 2 - 40, cy - 14); x.ellipse(W / 2 - 44, cy - 18, 12, 10, -0.4, 0, 7);
      }
      x.closePath(); x.fill();
      // 卷草边饰
      x.strokeStyle = 'rgba(240,226,192,0.5)'; x.lineWidth = 3;
      for (const s of [-1, 1]) {
        x.beginPath();
        x.arc(W / 2 + s * 86, cy, 16, 0, Math.PI * 1.4);
        x.stroke();
      }
      // 构件拼缝：九块构件拼一副拱门，缝在带际
      x.fillStyle = 'rgba(12,10,8,0.55)';
      x.fillRect(0, y, W, 3);
    });
    crackle(x, W, H, 90, 'rgba(20,16,12,0.20)');
    return tex(c, { repeat: [1, 1] });
  });
}

/** 探方壁的文化层：横向层线 + 碎砖包含物 + 深度标尺的刻度底 */
export function strata() {
  return memo('strata', () => {
    const S = 256, { c, x } = canvas(S, S);
    const layers = [['#6b5a44', 0], ['#7d6a4e', 0.16], ['#5d5340', 0.34], ['#6a5b47', 0.5], ['#4f4636', 0.68], ['#3f382c', 0.86]];
    x.fillStyle = '#3f382c'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < layers.length; i++) {
      const [, top] = layers[i];
      const bot = i + 1 < layers.length ? layers[i + 1][1] : 1;
      x.fillStyle = layers[i][0];
      x.fillRect(0, top * S, S, (bot - top) * S);
      x.fillStyle = 'rgba(20,16,12,0.30)';
      x.fillRect(0, top * S, S, 2.6);
    }
    // 碎砖瓦包含物
    for (let i = 0; i < 240; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(150,138,112,0.35)' : 'rgba(30,24,18,0.4)';
      x.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 9, 1.6 + Math.random() * 3.5);
    }
    return tex(c, { repeat: [3, 3] });
  });
}

/** 寺院地坪：大条砖墁地，十字缝 */
export function paving() {
  return memo('paving', () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = '#4b463c'; x.fillRect(0, 0, S, S);
    const rows = 4, cols = 4, rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const px = k * cw + (r % 2 ? cw * 0.5 : 0), py = r * rh;
        x.fillStyle = mix('#8b8371', '#5f5950', Math.random() * 0.8);
        x.fillRect(px + 2, py + 2, cw - 4, rh - 4);
      }
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      x.fillRect(Math.random() * S, Math.random() * S, 2.2, 2.2);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 宋砖（地宫砖砌券顶），比明琉璃旧、比唐砖规整 */
export function songBrick() {
  return memo('song-brick', () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = '#2e2a22'; x.fillRect(0, 0, S, S);
    const rows = 10, cols = 5, rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = -1; k <= cols; k++) {
        const px = k * cw + (r % 2 ? cw * 0.5 : 0), py = r * rh;
        x.fillStyle = mix('#6d604c', '#2b2419', Math.random() * 0.7);
        x.fillRect(px + 2, py + 2, cw - 4, rh - 4);
      }
    }
    for (let i = 0; i < 3000; i++) {
      x.fillStyle = 'rgba(0,0,0,0.07)';
      x.fillRect(Math.random() * S, Math.random() * S, 1.8, 1.8);
    }
    return tex(c, { repeat: [2, 2] });
  });
}

/** 铁函表面：经文与供养人铭文的暗示，不作实摹 */
export function ironCase() {
  return memo('iron-case', () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = '#2b2e33'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 6000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(120,110,96,0.05)' : 'rgba(10,10,12,0.09)';
      x.fillRect(Math.random() * S, Math.random() * S, 2.4, 1.4);
    }
    // 锈蚀竖向流痕
    for (let i = 0; i < 26; i++) {
      const gx = Math.random() * S;
      const g = x.createLinearGradient(gx, 0, gx + 4, S);
      g.addColorStop(0, 'rgba(96,52,24,0.0)');
      g.addColorStop(0.4, `rgba(112,62,28,${0.10 + Math.random() * 0.16})`);
      g.addColorStop(1, 'rgba(80,48,24,0.0)');
      x.fillStyle = g; x.fillRect(gx - 5, 0, 10, S);
    }
    x.strokeStyle = 'rgba(196,178,140,0.22)'; x.lineWidth = 2;
    for (let j = 0; j < 7; j++) {
      x.strokeRect(14, 18 + j * 32, S - 28, 22);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

export { mix };
