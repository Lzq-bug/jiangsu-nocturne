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

export function plaster(base = '#cfc4ad') {
  return memo(`plaster-${base}`, () => {
    const { c, x } = canvas(128, 128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(70,55,40,0.06)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
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

/** 贴水的霜气：横向拉丝，中间密、两头化开 */
export function mistStreaks() {
  return memo('mist', () => {
    const W = 512, H = 128;
    const { c, x } = canvas(W, H);
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * H;
      const w = 60 + Math.random() * 260, h = 3 + Math.random() * 12;
      const cx = Math.random() * W;
      const a = 0.04 + Math.random() * 0.14;
      const g = x.createLinearGradient(cx - w / 2, y, cx + w / 2, y);
      g.addColorStop(0, 'rgba(190,214,232,0)');
      g.addColorStop(0.5, `rgba(206,226,240,${a})`);
      g.addColorStop(1, 'rgba(190,214,232,0)');
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

/* ---------------------------------------------------------------- 三台山专用 */

/** 坡面草皮：夜里只留颗粒与枯草的走向，颜色交给顶点色 */
export function grassNight() {
  return memo('grass-night', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#8f9a86'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const px = Math.random() * S, py = Math.random() * S;
      const l = 3 + Math.random() * 7;
      x.strokeStyle = `rgba(${60 + Math.random() * 60 | 0},${70 + Math.random() * 60 | 0},${50 + Math.random() * 40 | 0},${0.10 + Math.random() * 0.2})`;
      x.lineWidth = 0.8 + Math.random();
      x.beginPath(); x.moveTo(px, py);
      x.lineTo(px + (Math.random() - 0.5) * 3, py - l);
      x.stroke();
    }
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(40,36,28,${0.05 + Math.random() * 0.12})`;
      x.beginPath(); x.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 4, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 一丛花：几朵五瓣加一片叶，交叉两片用，alpha 决定实例的剪影 */
export function flowerTuft() {
  return memo('flower-tuft', () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    // 三根细茎，从底边长到花头
    x.strokeStyle = 'rgba(126,150,96,0.9)'; x.lineWidth = 1.6;
    for (const [bx, top] of [[64, 44], [42, 62], [86, 58]]) {
      x.beginPath(); x.moveTo(bx, S);
      x.quadraticCurveTo(bx + (bx - 64) * 0.35, S * 0.6, bx, top);
      x.stroke();
    }
    x.lineWidth = 1.2;
    for (const [bx, by] of [[58, 92], [70, 78], [46, 100]]) {
      x.beginPath(); x.ellipse(bx, by, 7, 2.6, bx < 60 ? 0.5 : -0.5, 0, 7);
      x.fillStyle = 'rgba(112,138,86,0.75)'; x.fill();
    }
    // 花头 = 一撮小五瓣，边缘留虚，远看才是一团色而不是一个圆
    const head = (cx, cy, r, n) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + (cx + cy) * 0.03;
        const d = r * (0.42 + 0.58 * ((i * 37 % 11) / 11));
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9;
        const pr = r * (0.24 + 0.16 * ((i * 53 % 7) / 7));
        for (let k = 0; k < 5; k++) {
          x.beginPath();
          x.ellipse(px, py, pr * 0.46, pr, (k / 5) * 6.283, 0, 6.283);
          x.fillStyle = 'rgba(255,255,255,0.94)'; x.fill();
        }
        x.beginPath(); x.arc(px, py, pr * 0.3, 0, 7);
        x.fillStyle = 'rgba(255,238,180,0.95)'; x.fill();
      }
    };
    head(64, 40, 21, 7);
    head(41, 60, 13, 5);
    head(87, 56, 14, 5);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 花瓣：梨花瓣的先端缺口 */
export function petal() {
  return memo('petal', () => {
    const S = 64;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    x.beginPath();
    x.moveTo(S / 2, 6);
    x.bezierCurveTo(S - 8, 22, S - 10, S - 8, S / 2, S - 4);
    x.bezierCurveTo(10, S - 8, 8, 22, S / 2, 6);
    x.fillStyle = 'rgba(255,255,255,1)'; x.fill();
    const g = x.createRadialGradient(S / 2, S * 0.62, 2, S / 2, S * 0.62, S * 0.5);
    g.addColorStop(0, 'rgba(255,214,224,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fill();
    return tex(c, { repeat: [1, 1] });
  });
}

/** 梨树冠：夜里读成一团浅白，用 alpha 的疏密做出花的颗粒 */
export function blossomPuff() {
  return memo('blossom-puff', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#6b757c'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const r = 2 + Math.random() * 5;
      const a = Math.random() * 6.28, d = Math.pow(Math.random(), 0.6) * S * 0.5;
      const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d * 0.9;
      x.fillStyle = `rgba(${230 + Math.random() * 25 | 0},${232 + Math.random() * 23 | 0},242,${0.1 + Math.random() * 0.35})`;
      x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 400; i++) {
      x.fillStyle = 'rgba(70,84,72,0.25)';
      x.fillRect(Math.random() * S, Math.random() * S, 3, 2);
    }
    return tex(c, { repeat: [2, 2] });
  });
}

/** 廊桥桥面的防滑钢板：细密方格与磨亮的焊道 */
export function deckPlate() {
  return memo('deck-plate', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#6e747f'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 1;
    for (let i = 0; i <= S; i += 16) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(10,14,20,0.09)';
      x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    x.strokeStyle = 'rgba(20,24,32,0.35)'; x.lineWidth = 3;
    for (let j = 0; j < S; j += 64) { x.beginPath(); x.moveTo(0, j); x.lineTo(S, j); x.stroke(); }
    return tex(c, { repeat: [3, 6] });
  });
}

/** 木栈道：一块块横铺的防腐木 */
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
 * 廿四番花信风碑：自小寒至谷雨八气二十四候，每候一花。
 * 语出南朝梁·宗懔《荆楚岁时记》「始梅花，终楝花」，逐候名单见明·王逵《蠡海集》。
 */
export function huaxinStone(rows = null) {
  return memo(`huaxin-${rows ? rows.length : 24}`, () => {
    const W = 640, H = 1024;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#8f96a4'); g.addColorStop(0.45, '#7b8291'); g.addColorStop(1, '#666d7c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 11000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(18,22,30,0.07)';
      x.fillRect(Math.random() * W, Math.random() * H, 1.8, 1.8);
    }
    x.strokeStyle = 'rgba(28,32,42,0.55)'; x.lineWidth = 12; x.strokeRect(16, 16, W - 32, H - 32);
    x.strokeStyle = 'rgba(226,232,242,0.2)'; x.lineWidth = 2; x.strokeRect(34, 34, W - 68, H - 68);
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    const data = rows || [
      ['小寒', '梅花 山茶 水仙'], ['大寒', '瑞香 兰花 山矾'],
      ['立春', '迎春 樱桃 望春'], ['雨水', '菜花 杏花 李花'],
      ['惊蛰', '桃花 棣棠 蔷薇'], ['春分', '海棠 梨花 木兰'],
      ['清明', '桐花 麦花 柳花'], ['谷雨', '牡丹 荼蘼 楝花'],
    ];
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#1f2632';
    x.font = `600 60px ${font}`;
    x.fillText('廿四番花信风', W / 2, 92);
    let y = 176;
    for (const [jieqi, flowers] of data) {
      x.font = `600 40px ${font}`;
      x.fillStyle = '#232a36';
      x.fillText(jieqi, 96, y);
      x.strokeStyle = 'rgba(30,36,48,0.3)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(150, y); x.lineTo(W - 60, y); x.stroke();
      x.font = `600 34px ${font}`;
      x.textAlign = 'left';
      x.fillStyle = '#2a323f';
      x.fillText(flowers, 170, y);
      x.textAlign = 'center';
      y += 100;
    }
    x.font = `400 26px ${font}`;
    x.fillStyle = 'rgba(40,48,60,0.75)';
    x.fillText('始梅花 终楝花', W / 2, H - 66);
    x.fillStyle = 'rgba(146,44,34,0.86)';
    x.fillRect(W - 128, H - 130, 62, 62);
    x.fillStyle = '#f0e2c8';
    x.font = `600 26px ${font}`;
    ['花', '信'].forEach((ch, i) => x.fillText(ch, W - 97, H - 114 + i * 30));
    return tex(c, { repeat: [1, 1] });
  });
}
