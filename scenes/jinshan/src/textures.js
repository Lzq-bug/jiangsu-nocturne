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

/** radial falloff, used for lantern halos, stars, moon bloom, foam */
export function softGlow(hue = '255,220,170', hard = 0.12) {
  return memo(`glow-${hue}-${hard}`, () => {
    const { c, x } = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(255,255,255,1)`);
    g.addColorStop(hard, `rgba(${hue},0.72)`);
    g.addColorStop(0.45, `rgba(${hue},0.22)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 瓦垄 — ribbed roof tiles, laid out so `u` runs down the slope */
export function roofTiles(base = '#2b3242', ridge = '#454f63', highlight = '#6d7b93') {
  return memo(`tiles-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) {
      const u = i * 16;
      const g = x.createLinearGradient(u, 0, u + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(0.42, ridge);
      g.addColorStop(0.62, highlight);
      g.addColorStop(1, 'rgba(0,0,0,0.4)');
      x.fillStyle = g; x.fillRect(u, 0, 16, 256);
    }
    // tile courses across the slope
    for (let j = 0; j < 20; j++) {
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.fillRect(0, j * 13 + (Math.random() * 2 | 0), 256, 2);
      x.fillStyle = 'rgba(255,255,255,0.05)';
      x.fillRect(0, j * 13 + 3, 256, 1);
    }
    return tex(c, { repeat: [4, 2] });
  });
}

export function wood(base = '#5a2f22', grain = '#3a1d15') {
  return memo(`wood-${base}`, () => {
    const { c, x } = canvas(128, 128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i++) {
      x.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.1})`;
      x.lineWidth = 0.6 + Math.random() * 1.6;
      x.beginPath();
      const y0 = Math.random() * 128;
      x.moveTo(0, y0);
      x.bezierCurveTo(40, y0 + (Math.random() * 8 - 4), 90, y0 + (Math.random() * 8 - 4), 128, y0);
      x.stroke();
    }
    for (let i = 0; i < 12; i++) {
      x.fillStyle = grain;
      x.beginPath();
      x.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 1 + Math.random() * 2, 0, 0, 7);
      x.fill();
    }
    return tex(c, { repeat: [2, 2] });
  });
}

export function stone(base = '#8d9199') {
  return memo(`stone-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      const a = Math.random();
      x.fillStyle = a > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
    }
    // joint lines for masonry blocks
    for (let r = 0; r < 8; r++) {
      const y = r * 32;
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.fillRect(0, y, 256, 1.6);
      for (let k = 0; k < 4; k++) {
        const xx = k * 64 + (r % 2 ? 32 : 0);
        x.fillRect(xx, y, 1.6, 32);
      }
    }
    return tex(c, { repeat: [4, 2] });
  });
}

/** 青砖 — the course work of 慈寿塔's shell: small bricks, wide head joints */
export function brickWall(base = '#7a6f5c', joint = '#3c372e', face = '#a2977f') {
  return memo(`brick-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = joint; x.fillRect(0, 0, 256, 256);
    const bh = 20, bw = 52;
    for (let r = 0; r * bh < 256; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let k = -1; k * bw + off < 256; k++) {
        const px = k * bw + off + 2, py = r * bh + 2;
        const t = Math.random();
        x.fillStyle = t > 0.72 ? face : base;
        x.fillRect(px, py, bw - 4, bh - 4);
        x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.16})`;
        x.fillRect(px, py, bw - 4, bh - 4);
        for (let i = 0; i < 12; i++) {
          x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(20,16,10,0.09)';
          x.fillRect(px + Math.random() * (bw - 6), py + Math.random() * (bh - 6), 2, 2);
        }
      }
    }
    // 泛碱与雨痕：砖塔最旧的地方总是下半截
    for (let i = 0; i < 60; i++) {
      x.fillStyle = `rgba(24,20,14,${0.03 + Math.random() * 0.07})`;
      x.fillRect(Math.random() * 256, 0, 1 + Math.random() * 2, 256);
    }
    return tex(c, { repeat: [3, 3] });
  });
}

export function plaster(base = '#cfc4ad') {
  return memo(`plaster-${base}`, () => {
    const { c, x } = canvas(128, 128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(70,55,40,0.06)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
    }
    // 寺墙上的水痕与补粉刷过的方块，夜里读成深浅不一的一片
    for (let i = 0; i < 16; i++) {
      x.fillStyle = `rgba(60,48,32,${0.03 + Math.random() * 0.05})`;
      x.fillRect(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 26, 4 + Math.random() * 18);
    }
    return tex(c, { repeat: [3, 2] });
  });
}

/** 匾额 / signboard. dir: 'h' horizontal (right→left reading), 'v' vertical */
export function plaque(text, { dir = 'h', bg = '#123057', fg = '#f2dcae', border = '#c9974f', note = '' } = {}) {
  return memo(`plaque-${dir}-${text}-${bg}`, () => {
    const wide = dir === 'h';
    const W = wide ? 512 : 190, H = wide ? 190 : 512;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07182d'); g.addColorStop(0.5, bg); g.addColorStop(1, '#050f1e');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = border; x.lineWidth = 9; x.strokeRect(9, 9, W - 18, H - 18);
    x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 2; x.strokeRect(24, 24, W - 48, H - 48);
    x.fillStyle = fg;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = [...text];
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    if (wide) {
      const size = Math.min(112, (W - 80) / chars.length);
      x.font = `600 ${size}px ${font}`;
      chars.forEach((ch, i) => x.fillText(ch, W / 2 + (chars.length / 2 - i - 0.5) * size, H / 2 + size * 0.04));
    } else {
      const size = Math.min(116, (H - 80) / chars.length);
      x.font = `600 ${size}px ${font}`;
      chars.forEach((ch, i) => x.fillText(ch, W / 2, H / 2 + (chars.length / 2 - i - 0.5) * size * 1.02));
    }
    if (note) {
      x.font = `400 26px ${font}`;
      x.fillStyle = 'rgba(242,220,174,0.62)';
      x.fillText(note, wide ? W - 54 : W / 2, wide ? H / 2 : H - 42);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 窗棂 lattice, alpha-cut so light shines through */
export function lattice(cols = 5, rows = 4, frame = '#4a2417', light = '#ffd79a') {
  return memo(`lat-${cols}-${rows}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = light; x.fillRect(0, 0, S, S);
    const g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, '#fff0c8'); g.addColorStop(1, '#e08a3c');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.strokeStyle = frame; x.lineCap = 'square';
    const cw = S / cols, rh = S / rows;
    for (let i = 0; i <= cols; i++) { x.lineWidth = i === 0 || i === cols ? 16 : 7; x.beginPath(); x.moveTo(i * cw, 0); x.lineTo(i * cw, S); x.stroke(); }
    for (let j = 0; j <= rows; j++) { x.lineWidth = j === 0 || j === rows ? 16 : 7; x.beginPath(); x.moveTo(0, j * rh); x.lineTo(S, j * rh); x.stroke(); }
    // diamond infill
    x.lineWidth = 4;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = i * cw + cw / 2, cy = j * rh + rh / 2, r = Math.min(cw, rh) * 0.3;
      x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.closePath(); x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** vertical gradient used for the light columns drawn on the water */
export function columnFade() {
  return memo('column', () => {
    const { c, x } = canvas(32, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    const s = x.createLinearGradient(0, 0, 32, 0);
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = s; x.fillRect(0, 0, 32, 128);
    return tex(c, { repeat: [1, 1] });
  });
}

export function noise() {
  return memo('noise', () => {
    const { c, x } = canvas(128, 128);
    const d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return tex(c, { srgb: false });
  });
}

/** 贴水的霜气：横向拉丝，中间密、两头化开。江雾比湖雾更厚，拉丝也更长 */
export function mistStreaks() {
  return memo('mist', () => {
    const W = 512, H = 128;
    const { c, x } = canvas(W, H);
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * H;
      const w = 90 + Math.random() * 320, h = 3 + Math.random() * 13;
      const cx = Math.random() * W;
      const a = 0.04 + Math.random() * 0.15;
      const g = x.createLinearGradient(cx - w / 2, y, cx + w / 2, y);
      g.addColorStop(0, 'rgba(188,212,228,0)');
      g.addColorStop(0.5, `rgba(204,224,238,${a})`);
      g.addColorStop(1, 'rgba(188,212,228,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(cx, y, w / 2, h, 0, 0, 7); x.fill();
    }
    const v = x.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.55, 'rgba(0,0,0,0.75)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/* ---------------------------------------------------------------- 金山寺专用 */

/** 山皮：金山是嵌入江南丘陵的独立小石山，坡上草木与碎石混着长 */
export function hillSkin() {
  return memo('hill-skin', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#7d8474'; x.fillRect(0, 0, S, S);
    // 乱石：短折线勾出崖面的走向
    for (let i = 0; i < 240; i++) {
      x.strokeStyle = `rgba(${88 + Math.random() * 44 | 0},${92 + Math.random() * 40 | 0},${96 + Math.random() * 36 | 0},${0.10 + Math.random() * 0.22})`;
      x.lineWidth = 1 + Math.random() * 2.4;
      const px = Math.random() * S, py = Math.random() * S;
      x.beginPath(); x.moveTo(px, py);
      x.lineTo(px + (Math.random() - 0.5) * 26, py + (Math.random() - 0.5) * 16);
      x.stroke();
    }
    // 草：一撮一撮竖着的短笔
    for (let i = 0; i < 4200; i++) {
      const px = Math.random() * S, py = Math.random() * S;
      const l = 2 + Math.random() * 6;
      x.strokeStyle = `rgba(${52 + Math.random() * 52 | 0},${74 + Math.random() * 54 | 0},${44 + Math.random() * 36 | 0},${0.10 + Math.random() * 0.2})`;
      x.lineWidth = 0.7 + Math.random();
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 3, py - l); x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 一丛荻：江岸与湖滩上最常见的那片白穗，交叉两片用 */
export function reedTuft() {
  return memo('reed-tuft', () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    // 秆：从底边抽到穗头，略带弧度
    x.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const bx = 12 + Math.random() * 104;
      const top = 12 + Math.random() * 30;
      const lean = (Math.random() - 0.5) * 22;
      x.strokeStyle = `rgba(${148 + Math.random() * 40 | 0},${150 + Math.random() * 34 | 0},${112 + Math.random() * 30 | 0},0.92)`;
      x.lineWidth = 1 + Math.random() * 1.4;
      x.beginPath(); x.moveTo(bx, S);
      x.quadraticCurveTo(bx + lean * 0.4, S * 0.5, bx + lean, top);
      x.stroke();
      // 穗头：一蓬扫得开的短毛，远看才是一片灰白而不是一个点
      x.fillStyle = `rgba(238,236,222,${0.5 + Math.random() * 0.4})`;
      for (let k = 0; k < 26; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        const d = 3 + Math.random() * 13;
        x.fillRect(bx + lean + Math.cos(a) * d, top + Math.sin(a) * d * 1.5, 1.5, 3.6);
      }
      // 两片狭叶
      x.fillStyle = 'rgba(126,140,96,0.7)';
      x.beginPath();
      x.ellipse(bx + lean * 0.5, S * 0.62, 12, 1.7, 0.7 + Math.random(), 0, 7);
      x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 香火的一缕：竖直拉长、边缘化开的烟，靠 alpha 的疏密读成一股一股 */
export function smokePuff() {
  return memo('smoke-puff', () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    for (let i = 0; i < 190; i++) {
      const a = Math.random() * 7;
      const d = Math.pow(Math.random(), 0.55) * S * 0.34;
      const cx = S / 2 + Math.cos(a) * d * 0.62;
      const cy = S * 0.56 + Math.sin(a) * d * 1.25;
      const r = 3 + Math.random() * 13;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(226,222,214,${0.06 + Math.random() * 0.13})`);
      g.addColorStop(1, 'rgba(226,222,214,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    const v = x.createLinearGradient(0, S, 0, 0);
    v.addColorStop(0, 'rgba(0,0,0,0.15)'); v.addColorStop(0.6, 'rgba(0,0,0,0.8)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = v; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/** 江岸与码头的石板道：块石错缝，磨心发亮 */
export function paving() {
  return memo('paving', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#3f4551'; x.fillRect(0, 0, S, S);
    const n = 5, cell = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const t = Math.random();
      x.fillStyle = `rgba(${126 + t * 58 | 0},${132 + t * 54 | 0},${142 + t * 50 | 0},1)`;
      x.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
      x.fillStyle = `rgba(10,14,20,${0.05 + Math.random() * 0.12})`;
      x.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
    }
    for (let i = 0; i < 2400; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(8,12,18,0.09)';
      x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    return tex(c, { repeat: [3, 3] });
  });
}

/** 木栈道与船板：一块块横铺的木板 */
export function planks() {
  return memo('planks', () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#4b3a2b'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      const y = i * 16;
      x.fillStyle = `rgba(${70 + Math.random() * 26 | 0},${52 + Math.random() * 18 | 0},${34 + Math.random() * 14 | 0},1)`;
      x.fillRect(0, y + 1, S, 14);
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(0, y, S, 1.6);
      for (let k = 0; k < 26; k++) {
        x.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
        x.lineWidth = 0.8;
        x.beginPath();
        const yy = y + 2 + Math.random() * 12;
        x.moveTo(0, yy); x.bezierCurveTo(40, yy + Math.random() * 2 - 1, 90, yy + Math.random() * 2 - 1, S, yy);
        x.stroke();
      }
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/**
 * 江天一览碑：康熙南巡见「江天一色」，御笔题寺额「江天禅寺」，
 * 留云亭（江天一览亭）内立「江天一览」四字碑。赐名年份诸说并存，碑面只刻四字。
 */
export function jiangtianStele(text = '江天一览', caption = '康熙御题') {
  return memo(`stele-${text}`, () => {
    const W = 512, H = 1024;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#8d95a3'); g.addColorStop(0.45, '#79818f'); g.addColorStop(1, '#646c7a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 12000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(16,20,28,0.07)';
      x.fillRect(Math.random() * W, Math.random() * H, 1.8, 1.8);
    }
    // 苔与裂：碑脚最旧
    for (let i = 0; i < 420; i++) {
      x.fillStyle = `rgba(52,66,48,${0.04 + Math.random() * 0.1})`;
      x.beginPath(); x.arc(Math.random() * W, H * (0.6 + Math.random() * 0.4), 1 + Math.random() * 5, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(26,30,40,0.55)'; x.lineWidth = 12; x.strokeRect(18, 18, W - 36, H - 36);
    x.strokeStyle = 'rgba(226,232,242,0.18)'; x.lineWidth = 2; x.strokeRect(38, 38, W - 76, H - 76);
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#1d2430';
    const chars = [...text];
    const size = Math.min(150, (H - 260) / chars.length);
    chars.forEach((ch, i) => {
      x.font = `600 ${size}px ${font}`;
      x.fillText(ch, W / 2, 150 + size * 0.5 + i * size * 1.14);
    });
    x.font = `400 34px ${font}`;
    x.fillStyle = 'rgba(30,36,48,0.7)';
    x.fillText(caption, W / 2, H - 108);
    x.fillStyle = 'rgba(146,44,34,0.85)';
    x.fillRect(W - 122, H - 190, 58, 58);
    x.fillStyle = '#f0e2c8';
    x.font = `600 24px ${font}`;
    ['江', '天'].forEach((ch, i) => x.fillText(ch, W - 93, H - 174 + i * 28));
    return tex(c, { repeat: [1, 1] });
  });
}

/** 殿内的经柜与佛龛墙：一排排抽屉面，夜里只剩金线的反光 */
export function sutraWall() {
  return memo('sutra-wall', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#2a1a12'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
      const px = i * 64 + 4, py = j * 42 + 4;
      x.fillStyle = `rgba(${88 + Math.random() * 30 | 0},${54 + Math.random() * 22 | 0},${30 + Math.random() * 16 | 0},1)`;
      x.fillRect(px, py, 56, 34);
      x.strokeStyle = 'rgba(216,171,99,0.55)'; x.lineWidth = 1.4;
      x.strokeRect(px + 3, py + 3, 50, 28);
      x.fillStyle = 'rgba(240,226,200,0.75)';
      x.fillRect(px + 24, py + 14, 8, 6);
    }
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `rgba(8,4,2,${0.04 + Math.random() * 0.1})`;
      x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    return tex(c, { repeat: [2, 2] });
  });
}
