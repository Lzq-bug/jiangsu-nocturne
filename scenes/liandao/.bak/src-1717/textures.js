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

/* ---------------------------------------------------------------- 青果巷专用 */

/** 钛锌板：二阶咬口的立缝，比瓦平整，夜里读成冷灰 */
export function seamMetal(base = '#2b313c', ridge = '#4a5364') {
  return memo(`seam-${base}`, () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      const u = i * 32;
      const g = x.createLinearGradient(u, 0, u + 32, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.18, ridge);
      g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.86, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = g; x.fillRect(u, 0, 32, S);
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(6,10,16,0.05)';
      x.fillRect(Math.random() * S, Math.random() * S, 2.4, 1.2);
    }
    return tex(c, { repeat: [3, 3] });
  });
}

/** 弹石与条石：巷底中间密铺小石卵，两侧各一条排水石沟 */
export function cobble() {
  return memo('cobble', () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = '#6c6f76'; x.fillRect(0, 0, S, S);
    // 长条石压边
    for (const band of [0, S - 26]) {
      x.fillStyle = '#8b8f97'; x.fillRect(0, band, S, 26);
      x.fillStyle = 'rgba(0,0,0,0.34)';
      for (let i = 0; i < 5; i++) x.fillRect(i * 52 + 8, band, 2.4, 26);
      x.fillRect(0, band, S, 1.6); x.fillRect(0, band + 25, S, 1.6);
    }
    // 石卵：一簇簇椭圆，缝里发黑
    for (let i = 0; i < 420; i++) {
      const px = Math.random() * S, py = 26 + Math.random() * (S - 52);
      const r = 4.4 + Math.random() * 3.2, a = Math.random() * 6.28;
      x.save(); x.translate(px, py); x.rotate(a);
      x.fillStyle = `rgba(${120 + Math.random() * 46 | 0},${122 + Math.random() * 44 | 0},${126 + Math.random() * 40 | 0},1)`;
      x.beginPath(); x.ellipse(0, 0, r, r * 0.66, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(18,20,26,0.5)'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.09)';
      x.beginPath(); x.ellipse(-r * 0.2, -r * 0.22, r * 0.42, r * 0.24, 0, 0, 7); x.fill();
      x.restore();
    }
    for (let i = 0; i < 2200; i++) {
      x.fillStyle = 'rgba(10,12,16,0.10)';
      x.fillRect(Math.random() * S, 26 + Math.random() * (S - 52), 1.8, 1.8);
    }
    return tex(c, { repeat: [2, 6] });
  });
}

/** 图案灯 gobo：冰裂 + 云头 + 一圈瓦当纹，alpha 图，投在粉墙上 */
export function gobo() {
  return memo('gobo', () => {
    const S = 512;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    x.strokeStyle = 'rgba(255,255,255,0.9)';
    // 冰裂纹：从中心放射的折线网
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * 6.283 + (i % 3) * 0.2;
      let r = 40 + (i % 5) * 26;
      x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * 44, S / 2 + Math.sin(a) * 44);
      let px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r;
      x.lineTo(px, py);
      for (let k = 0; k < 3; k++) {
        const na = a + (k % 2 ? 0.5 : -0.55);
        r += 46 + (k * 17) % 34;
        px = S / 2 + Math.cos(na) * r; py = S / 2 + Math.sin(na) * r;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    // 云头：三组同心弧
    for (const [cx, cy, s] of [[S * 0.22, S * 0.74, 1], [S * 0.78, S * 0.28, 0.8], [S * 0.66, S * 0.72, 1.15]]) {
      x.lineWidth = 3.2;
      for (let k = 1; k <= 4; k++) {
        x.beginPath(); x.arc(cx, cy, k * 11 * s, Math.PI * 0.15, Math.PI * 1.2); x.stroke();
      }
    }
    // 外圈瓦当：一圈小圆，每个里面一个十字
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283;
      const cx = S / 2 + Math.cos(a) * (S * 0.455), cy = S / 2 + Math.sin(a) * (S * 0.455);
      x.lineWidth = 2.6;
      x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(cx - 9, cy); x.lineTo(cx + 9, cy); x.moveTo(cx, cy - 9); x.lineTo(cx, cy + 9); x.stroke();
    }
    const v = x.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.72, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = v; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/** 瓦当：圆形当面，用于堂号灯与檐头点缀 */
export function wadang(text = '桂', ring = '#c9974f') {
  return memo(`wadang-${text}`, () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    const g = x.createRadialGradient(S / 2, S * 0.42, 8, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#2a2f3a'); g.addColorStop(1, '#12151c');
    x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 4, 0, 7); x.fill();
    x.strokeStyle = ring; x.lineWidth = 8;
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 14, 0, 7); x.stroke();
    x.lineWidth = 3; x.strokeStyle = 'rgba(201,151,79,0.55)';
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 40, 0, 7); x.stroke();
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    x.fillStyle = '#f2dcae'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `600 108px ${font}`;
    x.fillText(text, S / 2, S / 2 + 6);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 招幌：竖旗，布面起皱，字自上而下 */
export function banner(text, { bg = '#8d2f24', fg = '#f6e6c8' } = {}) {
  return memo(`banner-${text}`, () => {
    const W = 128, H = 320;
    const { c, x } = canvas(W, H);
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const u = i * (W / 9);
      const g = x.createLinearGradient(u, 0, u + W / 9, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
      x.fillStyle = g; x.fillRect(u, 0, W / 9, H);
    }
    x.strokeStyle = 'rgba(246,230,200,0.5)'; x.lineWidth = 3; x.strokeRect(7, 7, W - 14, H - 14);
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = [...text];
    const size = Math.min(52, (H - 40) / chars.length);
    chars.forEach((ch, i) => x.fillText(ch, W / 2, 34 + size * (i + 0.5)));
    // 下缘剪成牙状
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.moveTo(i * (W / 6), H); x.lineTo(i * (W / 6) + W / 12, H - 18); x.lineTo((i + 1) * (W / 6), H);
      x.closePath(); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/** 桂子：四瓣小花加一粒米黄，飘落实例用 */
export function osmanthus() {
  return memo('osmanthus', () => {
    const S = 64;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    const petal = (cx, cy, r, rot) => {
      for (let k = 0; k < 4; k++) {
        x.save(); x.translate(cx, cy); x.rotate(rot + (k / 4) * 6.283);
        const g = x.createLinearGradient(0, 0, 0, -r);
        g.addColorStop(0, 'rgba(255,214,120,0.95)'); g.addColorStop(1, 'rgba(255,242,196,0.9)');
        x.fillStyle = g;
        x.beginPath(); x.ellipse(0, -r * 0.62, r * 0.34, r * 0.62, 0, 0, 7); x.fill();
        x.restore();
      }
      x.fillStyle = 'rgba(255,250,225,0.95)';
      x.beginPath(); x.arc(cx, cy, r * 0.16, 0, 7); x.fill();
    };
    petal(24, 26, 15, 0.3);
    petal(45, 44, 9, 1.1);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 树冠：香樟——夜里读成一大团墨绿，边缘留碎口 */
export function canopy(hue = '72,96,64', dense = 2400) {
  return memo(`canopy-${hue}-${dense}`, () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    x.fillStyle = `rgba(${hue},0.9)`; x.fillRect(0, 0, S, S);
    for (let i = 0; i < dense; i++) {
      const a = Math.random() * 6.28, d = Math.pow(Math.random(), 0.55) * S * 0.5;
      const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
      const r = 2 + Math.random() * 5.5;
      const l = 0.55 + 0.45 * (1 - d / (S * 0.5));
      x.fillStyle = `rgba(${Number(hue.split(',')[0]) * l | 0},${Number(hue.split(',')[1]) * l | 0},${Number(hue.split(',')[2]) * l | 0},${0.16 + Math.random() * 0.3})`;
      x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(226,236,206,${0.03 + Math.random() * 0.07})`;
      x.beginPath(); x.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 2.6, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 远景楼群：只有窗光可信，形体交给几何 */
export function towerWindows() {
  return memo('tower-windows', () => {
    const W = 128, H = 512;
    const { c, x } = canvas(W, H);
    x.fillStyle = '#04070d'; x.fillRect(0, 0, W, H);
    for (let j = 0; j < 34; j++) {
      for (let i = 0; i < 7; i++) {
        if (Math.random() > 0.42) continue;
        const warm = Math.random() > 0.3;
        x.fillStyle = warm ? `rgba(255,${190 + Math.random() * 40 | 0},${120 + Math.random() * 60 | 0},${0.5 + Math.random() * 0.5})`
          : `rgba(190,214,240,${0.28 + Math.random() * 0.3})`;
        x.fillRect(6 + i * 17, 8 + j * 15, 11, 7);
      }
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/**
 * 唐氏八宅题名碑：八桂、贞和、易书、四并、复始、松健、礼和、筠星，
 * 始建于明弘治、正德年间，今存贞和、筠星、礼和、八桂、松健五堂。
 */
export function bazhaiStone(rows = null) {
  return memo(`bazhai-${rows ? rows.length : 8}`, () => {
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
      ['八桂堂', '尚存', '明嘉靖间唐顺之营建·植桂八株'],
      ['贞和堂', '尚存', '原名保合堂·抬梁月梁·楠木紫檀'],
      ['易书堂', '不存', '唐氏八宅之一'],
      ['四并堂', '不存', '唐氏八宅之一'],
      ['复始堂', '不存', '唐氏八宅之一'],
      ['松健堂', '尚存', '唐荆川曾祖之宅'],
      ['礼和堂', '尚存', '133号·周有光出生地'],
      ['筠星堂', '尚存', '唐氏八宅之一'],
    ];
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#1f2632'; x.font = `600 58px ${font}`;
    x.fillText('唐氏八宅', W / 2, 92);
    let y = 186;
    for (const [hall, state, note] of data) {
      x.font = `600 42px ${font}`; x.fillStyle = '#232a36'; x.textAlign = 'left';
      x.fillText(hall, 62, y);
      x.font = `600 30px ${font}`;
      x.fillStyle = state === '尚存' ? '#7a3f22' : 'rgba(40,48,60,0.5)';
      x.fillText(state, 250, y);
      x.font = `400 26px ${font}`; x.fillStyle = 'rgba(38,44,56,0.82)';
      x.fillText(note, 330, y + 2);
      x.strokeStyle = 'rgba(30,36,48,0.26)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(56, y + 34); x.lineTo(W - 56, y + 34); x.stroke();
      y += 92;
    }
    x.textAlign = 'center';
    x.font = `400 26px ${font}`; x.fillStyle = 'rgba(40,48,60,0.75)';
    x.fillText('始建于明弘治正德年间', W / 2, H - 96);
    x.fillStyle = 'rgba(146,44,34,0.86)';
    x.fillRect(W - 128, H - 150, 62, 62);
    x.fillStyle = '#f0e2c8'; x.font = `600 26px ${font}`;
    ['八', '宅'].forEach((ch, i) => x.fillText(ch, W - 97, H - 134 + i * 30));
    return tex(c, { repeat: [1, 1] });
  });
}

/** 旧名兼容：kit.js 里 M.plank 走复数写法 */
export const planks = (repeat) => plank(repeat);

/* ============================================================================ */
/* 连岛·开渔夏夜：滩涂 / 船体 / 消波堤 / 星月。Canvas 程序化，一律 memo 缓存。 */
/* 纪律：禁止 Math.random（dr/drr 是确定性序列）；带色贴图基色接近白，否则      */
/* 暗基色 × 暗贴图在夜景灯光下直接糊成黑。                                      */
/* ============================================================================ */

/** 确定性伪随机 + 四方连续 value noise + 逐像素底色 */
let dseed = 20260710;
const dr = () => { dseed = (Math.imul(dseed, 1664525) + 1013904223) & 0x7fffffff; return dseed / 0x7fffffff; };
const drr = (a, b) => a + dr() * (b - a);
const h2 = (i, j, p) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 665761) ^ Math.imul(p | 0, 2246822519); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vn(u, v, f, p = 0) {          // f 取整数频率 → 首尾相接
  const x = u * f, y = v * f, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = (a) => ((a % f) + f) % f;
  const i0 = w(i), i1 = w(i + 1), j0 = w(j), j1 = w(j + 1), a = h2(i0, j0, p), b = h2(i1, j0, p), c = h2(i0, j1, p), d = h2(i1, j1, p), t = a + (b - a) * sx;
  return t + (c + (d - c) * sx - t) * sy;
}
function field(S, fn) {                // fn(u,v) 返回 [r,g,b(,a)]，铺完还能继续在其上画笔
  const o = canvas(S, S), im = o.x.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const q = fn(i / S, j / S), k = (j * S + i) * 4; im.data[k] = q[0]; im.data[k + 1] = q[1]; im.data[k + 2] = q[2]; im.data[k + 3] = q.length > 3 ? q[3] : 255; }
  o.x.putImageData(im, 0, 0); return o;
}
/** 平铺笔：同一笔画在 3×3 周期副本上各画一次，接缝处不被裁断 */
function tile(x, S, px, py, draw) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { x.save(); x.translate(px + a * S, py + b * S); draw(); x.restore(); } }
const grain = (x, S, n, cols) => { for (let i = 0; i < n; i++) { x.fillStyle = cols[dr() * cols.length | 0]; x.fillRect(dr() * S, dr() * S, drr(1, 2.6), drr(1, 2.2)); } };
const seg = (x, col, lw, x0, y0, x1, y1) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
const blob = (x, fill, r) => { x.fillStyle = fill; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); };

/** 干沙：细颗粒 + 两个方向的波脊；堤灯一压就脊影分明 */
export function sand(repeat = [4, 4]) {
  return memo(`sand-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const g = vn(u, v, 56, 1) * 0.55 + vn(u, v, 128, 2) * 0.45;
      const r1 = 0.5 + 0.5 * Math.sin(v * Math.PI * 14 + vn(u, v, 6, 3) * 5.5), r2 = 0.5 + 0.5 * Math.sin(u * Math.PI * 8 + v * 12 + vn(u, v, 5, 4) * 4);
      const l = 0.8 + 0.18 * g + 0.16 * Math.pow(r1, 3) + 0.05 * Math.pow(r2, 2);
      return [236 * l, 223 * l, 194 * l];
    });
    for (let i = 0; i < 760; i++) { const w = drr(1.2, 3), h = drr(1, 2.4), col = dr() > 0.42 ? 'rgba(255,252,242,0.5)' : 'rgba(116,104,86,0.26)'; tile(x, S, dr() * S, dr() * S, () => { x.fillStyle = col; x.fillRect(0, 0, w, h); }); }
    return tex(c, { repeat });
  });
}

/** 湿沙：更冷的深调 + 水膜反光 + 潮沟；干湿线靠它和 sand 拉开 */
export function wetSand(repeat = [4, 4]) {
  return memo(`wetsand-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const g = vn(u, v, 44, 5) * 0.5 + vn(u, v, 150, 6) * 0.5;
      const sheen = Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 6 + v * 13 + vn(u, v, 4, 7) * 6), 6), l = 0.66 + 0.14 * g + 0.46 * sheen;
      return [148 * l, 160 * l, 176 * l];
    });
    x.lineCap = 'round';
    for (let i = 0; i < 11; i++) {   // 潮沟：暗槽加一道亮水线，横向三段补画保证接缝
      const y0 = drr(30, S - 30), amp = drr(10, 34), k = drr(0.7, 1.9), wd = drr(7, 17);
      const pth = () => { x.beginPath(); for (let s = 0; s <= 26; s++) { const t = s / 26, py = y0 + Math.sin(t * Math.PI * 2 * k) * amp; s ? x.lineTo(t * S, py) : x.moveTo(t * S, py); } };
      for (const [lw, col, dy] of [[wd, 'rgba(44,52,66,0.42)', 0], [1.8, 'rgba(226,240,255,0.5)', -wd * 0.32]]) for (const oy of [-S, 0, S]) { x.save(); x.translate(0, oy + dy); x.lineWidth = lw; x.strokeStyle = col; pth(); x.stroke(); x.restore(); }
    }
    for (let i = 0; i < 460; i++) { const rx = drr(2, 9), ry = drr(0.8, 3.2), col = `rgba(232,242,255,${drr(0.1, 0.34)})`; tile(x, S, dr() * S, dr() * S, () => { x.fillStyle = col; x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, 7); x.fill(); }); }
    grain(x, S, 900, ['rgba(255,252,244,0.22)', 'rgba(58,64,76,0.3)']);
    return tex(c, { repeat });
  });
}

/** 海蚀基岩：钝色块面 + 节理裂隙 + 盐霜，配 kit.rockGeo 的低模棱面 */
export function rock(repeat = [2, 2]) {
  return memo(`rock-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const fac = vn((Math.floor(u * 8) + 0.5) / 8, (Math.floor(v * 8) + 0.5) / 8, 8, 9);
      const l = 0.6 + 0.34 * fac + 0.3 * (vn(u, v, 70, 10) * 0.5 + vn(u, v, 190, 11) * 0.5);
      return [178 * l, 184 * l, 192 * l];
    });
    for (let i = 0; i < 16; i++) {   // 节理：暗缝配一条亮唇，石层走向读得出来
      const x0 = dr() * S, y0 = dr() * S, seg2 = drr(60, 260), dy = drr(-60, 60), lw = drr(2, 6);
      seg(x, 'rgba(26,30,38,0.5)', lw, x0, y0, x0 + seg2, y0 + dy);
      seg(x, 'rgba(236,242,250,0.24)', 1.4, x0 + 2, y0 + 2.6, x0 + seg2 + 2, y0 + dy + 2.6);
    }
    grain(x, S, 2600, ['rgba(244,246,252,0.16)', 'rgba(30,36,44,0.2)']);
    return tex(c, { repeat });
  });
}

/** 潮池礁石：基岩上压一层暗绿水膜，再撒藤壶——低潮时它标出潮池边界 */
export function reef(repeat = [2, 2]) {
  return memo(`reef-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const fac = vn((Math.floor(u * 7) + 0.5) / 7, (Math.floor(v * 7) + 0.5) / 7, 7, 12);
      const l = 0.58 + 0.32 * fac + 0.3 * (vn(u, v, 80, 14) * 0.5 + vn(u, v, 210, 15) * 0.5);
      const f = Math.pow(Math.max(0, vn(u, v, 5, 13) - 0.4) / 0.6, 1.3);   // 水膜覆盖率
      return [168 * l * (1 - f * 0.62) + 30 * f, 178 * l * (1 - f * 0.38) + 78 * f, 172 * l * (1 - f * 0.6) + 54 * f];
    });
    for (let i = 0; i < 420; i++) { const r = drr(1.6, 4.2), col = `rgba(238,236,222,${drr(0.4, 0.8)})`; tile(x, S, dr() * S, dr() * S, () => { blob(x, col, r); blob(x, 'rgba(34,40,38,0.55)', r * 0.42); }); }
    grain(x, S, 1200, ['rgba(180,206,178,0.16)', 'rgba(20,30,26,0.22)']);
    return tex(c, { repeat });
  });
}

/** 白沫：软边泡沫团加碎沫，透明底，贴岸线与船头浪 */
export function foam(repeat = [1, 1]) {
  return memo(`foam-${repeat}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    for (let i = 0; i < 180; i++) {
      const r = drr(14, 64), a = drr(0.42, 0.8);
      tile(x, S, dr() * S, dr() * S, () => {
        const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, 'rgba(240,248,252,0.28)'); g.addColorStop(1, 'rgba(232,244,250,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
      });
    }
    for (let i = 0; i < 900; i++) { const r = drr(0.8, 2.6), a = drr(0.3, 0.85); tile(x, S, dr() * S, dr() * S, () => blob(x, `rgba(252,254,255,${a})`, r)); }
    return tex(c, { repeat });
  });
}

/** 船壳外板：横捋木板路 + 吃水线以下的桐油黑 + 一道朱水线 */
export function hull(repeat = [2, 2]) {
  return memo(`hull-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const board = vn(u * 0.5, (Math.floor(v * 9) + 0.5) / 9, 9, 21);
      const g = vn(u, v, 150, 22) * 0.55 + vn(u, v, 420, 23) * 0.45;
      const l = (0.84 + 0.2 * board + 0.14 * g) * (v > 0.74 ? 0.48 : 1);
      return [230 * l, 208 * l, 176 * l];
    });
    for (let i = 1; i < 9; i++) {    // 板缝、亮唇与一行铁钉
      const y = i * 56.9;
      x.fillStyle = 'rgba(28,20,14,0.42)'; x.fillRect(0, y, S, 2.4);
      x.fillStyle = 'rgba(250,240,220,0.2)'; x.fillRect(0, y + 3, S, 1.2);
      x.fillStyle = 'rgba(60,50,40,0.5)'; for (let k = 0; k < 26; k++) x.fillRect(k * 20 + 6, y - 5, 2.2, 2.2);
    }
    x.fillStyle = 'rgba(176,62,44,0.85)'; x.fillRect(0, S * 0.69, S, 13);
    x.fillStyle = 'rgba(240,232,214,0.5)'; x.fillRect(0, S * 0.69 - 2, S, 2);
    return tex(c, { repeat });
  });
}

/** 甲板条木：顺纹长板 + 榫缝 + 磨白的棱 */
export function plank(repeat = [3, 1]) {
  return memo(`plank-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const board = vn(0.5, (Math.floor(v * 6) + 0.5) / 6, 6, 24);
      const g = vn(u * 3, v, 180, 25) * 0.6 + vn(u, v, 500, 26) * 0.4;
      const l = (0.82 + 0.2 * board + 0.16 * g) * (1 - Math.abs((v * 6) % 1 - 0.5) * 0.28);
      return [226 * l, 205 * l, 178 * l];
    });
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(30,22,16,0.5)'; x.fillRect(0, i * 85.3, S, 3); }
    for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(34,24,18,0.44)'; x.fillRect(drr(0, S), drr(0, S), 3, 84); }
    for (let i = 0; i < 240; i++) {  // 木纹
      x.strokeStyle = `rgba(${dr() > 0.5 ? '252,244,226,0.14' : '52,40,30,0.18'})`; x.lineWidth = drr(0.6, 1.8);
      const y0 = dr() * S;
      x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(S * 0.34, y0 + drr(-4, 4), S * 0.7, y0 + drr(-4, 4), S, y0); x.stroke();
    }
    return tex(c, { repeat });
  });
}

/** 缆绳：斜捋的股，repeat 沿绳长给足就读出捻度 */
export function rope(repeat = [10, 1]) {
  return memo(`rope-${repeat}`, () => {
    const S = 256, { c, x } = field(S, (u, v) => {
      const l = 0.8 + 0.22 * (vn(u, v, 60, 27) * 0.5 + vn(u, v, 180, 28) * 0.5);
      return [222 * l, 200 * l, 158 * l];
    });
    x.lineCap = 'round';
    for (let k = -3; k < 10; k++) {  // 股：暗沟配一道亮脊，位移正好一个整周期 → 可平铺
      const y0 = k * (S / 6);
      seg(x, 'rgba(92,74,50,0.5)', 15, -4, y0, S + 4, y0 + S / 6);
      seg(x, 'rgba(248,236,206,0.4)', 5, -4, y0 - 5, S + 4, y0 + S / 6 - 5);
    }
    grain(x, S, 900, ['rgba(252,242,216,0.18)', 'rgba(60,48,32,0.22)']);
    return tex(c, { repeat });
  });
}

/** 网衣：菱形 knot 网格，透明底，配 M.net 的 transparent */
export function net(repeat = [8, 8]) {
  return memo(`net-${repeat}`, () => {
    const S = 256, n = 6, step = S / n, { c, x } = canvas(S, S);
    x.fillStyle = 'rgba(180,196,190,0.1)'; x.fillRect(0, 0, S, S);
    x.lineCap = 'round';
    for (let k = -n; k <= n * 2; k++) { seg(x, 'rgba(226,236,228,0.86)', 2.6, k * step, 0, k * step + S, S); seg(x, 'rgba(226,236,228,0.86)', 2.6, k * step, S, k * step + S, 0); }
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { x.save(); x.translate(i * step, j * step); blob(x, 'rgba(244,250,246,0.95)', 3.4); blob(x, 'rgba(46,60,54,0.5)', 1.4); x.restore(); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${88 + dr() * 40 | 0},${112 + dr() * 40 | 0},${84 + dr() * 30 | 0},0.4)`; x.fillRect(dr() * S, dr() * S, drr(2, 7), drr(1, 3)); }
    return tex(c, { repeat });
  });
}

/** 帆布条纹：八瓣沙滩伞与排档雨棚共用（u 沿圆周时自然读成一瓣一瓣） */
export function flagStripe(a = '#c2503c', b = '#f2eee4', bands = 8, repeat = [1, 1]) {
  return memo(`stripe-${a}-${b}-${bands}`, () => {
    const S = 256, { c, x } = canvas(S, S), bw = S / bands;
    for (let i = 0; i < bands; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * bw, 0, bw + 1, S); x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(i * bw + bw - 2, 0, 2, S); }
    for (let i = 0; i < S; i += 3) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
    for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(72,64,52,${drr(0.03, 0.14)})`; x.beginPath(); x.ellipse(dr() * S, dr() * S, drr(2, 9), drr(1, 5), 0, 0, 7); x.fill(); }
    return tex(c, { repeat });
  });
}

/** 码头混凝土：骨料点 + 模板缝 + 水渍与磕棱 */
export function concrete(repeat = [2, 2]) {
  return memo(`concrete-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const g = vn(u, v, 40, 41) * 0.45 + vn(u, v, 130, 42) * 0.35 + vn(u, v, 320, 43) * 0.2, l = 0.78 + 0.26 * g;
      return [196 * l, 199 * l, 203 * l];
    });
    grain(x, S, 3200, ['rgba(236,238,242,0.22)', 'rgba(74,78,86,0.24)', 'rgba(150,152,158,0.2)']);
    for (let i = 1; i < 4; i++) { x.fillStyle = 'rgba(52,56,64,0.42)'; x.fillRect(0, i * 128 - 1, S, 3); x.fillRect(i * 128 - 1, 0, 3, S); x.fillStyle = 'rgba(244,246,250,0.2)'; x.fillRect(0, i * 128 + 2.4, S, 1.4); }
    for (let i = 0; i < 14; i++) { const g = x.createLinearGradient(0, 0, 0, S), a = drr(0.1, 0.3); g.addColorStop(0, `rgba(96,102,110,${a})`); g.addColorStop(1, 'rgba(96,102,110,0)'); x.fillStyle = g; x.fillRect(dr() * S, 0, drr(4, 22), S); }
    for (let i = 0; i < 60; i++) { const r = drr(2, 8); tile(x, S, dr() * S, dr() * S, () => { blob(x, 'rgba(228,230,234,0.5)', r); blob(x, 'rgba(66,70,78,0.3)', r * 0.5); }); }
    return tex(c, { repeat });
  });
}

/** 锈蚀钢：绣块顺水流拖下来，压在钢灰底上（堤机、船机、灯架） */
export function rust(base = '#8a4c2d', steel = '#7b8592', repeat = [2, 2]) {
  return memo(`rust-${base}-${steel}`, () => {
    const S = 512, hx = (s, o) => parseInt(s.slice(o, o + 2), 16), { c, x } = field(S, (u, v) => {
      const p = Math.pow(Math.max(0, vn(u, v, 6, 51) * 0.6 + vn(u, v, 18, 52) * 0.4 - 0.28) / 0.72, 1.2);
      const l = 0.78 + 0.3 * (vn(u, v, 90, 53) * 0.5 + vn(u, v, 260, 54) * 0.5);
      return [(hx(steel, 1) + (hx(base, 1) - hx(steel, 1)) * p) * l, (hx(steel, 3) + (hx(base, 3) - hx(steel, 3)) * p) * l, (hx(steel, 5) + (hx(base, 5) - hx(steel, 5)) * p) * l];
    });
    x.lineCap = 'round';
    for (let i = 0; i < 40; i++) { const h = drr(30, 190), g = x.createLinearGradient(0, 0, 0, h), a = drr(0.2, 0.5); g.addColorStop(0, `rgba(${104 + dr() * 40 | 0},58,26,${a})`); g.addColorStop(1, 'rgba(92,54,26,0)'); x.fillStyle = g; x.fillRect(dr() * S, dr() * S, drr(2, 9), h); }
    for (let i = 0; i < 26; i++) { const y0 = dr() * S; seg(x, 'rgba(232,238,246,0.16)', drr(1, 3), 0, y0, S, y0 + drr(-8, 8)); }
    return tex(c, { repeat });
  });
}

/** 港池标识牌：珐琅面 + 白字 + 螺栓锈痕。dir 'h' 横牌 / 'v' 竖牌 */
export function sign(text, { dir = 'h', bg = '#1c5c86', fg = '#f4f8fc', border = '#dfe6ec', sub = '', repeat = [1, 1] } = {}) {
  return memo(`sign-${dir}-${text}-${sub}-${bg}`, () => {
    const wide = dir === 'h', W = wide ? 512 : 288, H = wide ? 288 : 512, { c, x } = canvas(W, H);
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = border; x.lineWidth = 14; x.strokeRect(14, 14, W - 28, H - 28);
    x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 2; x.strokeRect(30, 30, W - 60, H - 60);
    const font = '"Heiti SC","Microsoft YaHei","SimHei",sans-serif', chars = [...text];
    const size = Math.min(wide ? 96 : 94, ((wide ? W : H) - (wide ? 92 : 110)) / chars.length);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${size}px ${font}`;
    chars.forEach((ch, i) => wide
      ? x.fillText(ch, W / 2 + (chars.length / 2 - i - 0.5) * size, H / 2 - (sub ? 18 : 0))
      : x.fillText(ch, W / 2, H / 2 + (chars.length / 2 - i - 0.5) * size * 1.04));
    if (sub) { x.font = `500 30px ${font}`; x.fillStyle = 'rgba(236,242,248,0.82)'; x.fillText(sub, W / 2, H - (wide ? 62 : 54)); }
    for (let i = 0; i < 240; i++) { x.fillStyle = `rgba(${dr() > 0.6 ? '250,252,255' : '96,64,38'},${drr(0.03, 0.16)})`; x.beginPath(); x.arc(dr() * W, dr() * H, drr(1, 5), 0, 7); x.fill(); }
    for (const [bx, by] of [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]]) {
      x.save(); x.translate(bx, by); blob(x, 'rgba(226,232,240,0.9)', 8); blob(x, 'rgba(40,46,54,0.6)', 3.2);
      x.fillStyle = 'rgba(120,72,36,0.34)'; x.beginPath(); x.ellipse(0, 12, 5, 12, 0, 0, 7); x.fill(); x.restore();
    }
    return tex(c, { repeat });
  });
}

/**
 * 新莽刻石的字口面：不写可读的字，只排凿口——短横短竖、深浅不一、边缘崩裂；
 * 残泐用一块浅色新崩面盖掉旧凿痕。近看是岩石上的刻痕，不是宣纸书法。
 */
export function steleFace(repeat = [1, 1]) {
  return memo(`stele-${repeat}`, () => {
    const S = 512, { c, x } = field(S, (u, v) => {
      const g = vn(u, v, 24, 61) * 0.45 + vn(u, v, 80, 62) * 0.3 + vn(u, v, 200, 63) * 0.25;
      const l = (0.72 + 0.34 * g) * (0.94 + 0.12 * vn(u, v, 3, 64));
      return [172 * l, 176 * l, 182 * l];
    });
    x.lineCap = 'butt';
    for (let cell = 0; cell < 46; cell++) {
      const cx = dr() * S, cy = dr() * S, cw = drr(26, 66), strokes = 3 + (dr() * 4 | 0), tilt = drr(-0.06, 0.06);
      for (let s = 0; s < strokes; s++) {   // 凿口：暗槽加凿脊反光，深浅不一
        const horiz = dr() > 0.44, px = cx + drr(-cw / 2, cw / 2), py = cy + drr(-cw / 2, cw / 2);
        const L = drr(cw * 0.2, cw * 0.6), dep = drr(0.3, 1), dx = horiz ? L : drr(-3, 3) + tilt * L, dy = horiz ? drr(-2, 2) : L;
        seg(x, `rgba(22,26,32,${0.2 + 0.42 * dep})`, drr(2.4, 5.6), px, py, px + dx, py + dy);
        seg(x, `rgba(240,244,252,${0.14 + 0.3 * dep})`, drr(1, 2), px + 1.8, py + 1.8, px + dx + 1.8, py + dy + 1.8);
      }
      for (let k = 0; k < 3; k++) {         // 崩口：抹掉一段旧字口
        const r = drr(3, 11), tone = `${186 + dr() * 26 | 0},${190 + dr() * 26 | 0},${196 + dr() * 26 | 0}`;
        x.fillStyle = `rgba(${tone},0.72)`; x.beginPath(); x.moveTo(cx + drr(-cw / 2, cw / 2), cy + drr(-cw / 2, cw / 2));
        for (let p = 0; p < 5; p++) x.lineTo(cx + drr(-r, r) * 2, cy + drr(-r, r) * 2);
        x.closePath(); x.fill();
      }
    }
    for (let i = 0; i < 7; i++) {           // 风化裂隙
      const y0 = dr() * S; x.strokeStyle = 'rgba(28,32,40,0.44)'; x.lineWidth = drr(1.4, 4); x.beginPath(); x.moveTo(0, y0);
      for (let s = 1; s <= 8; s++) x.lineTo((S / 8) * s, y0 + drr(-16, 16));
      x.stroke();
    }
    grain(x, S, 2200, ['rgba(246,248,252,0.14)', 'rgba(30,34,42,0.18)']);
    return tex(c, { repeat });
  });
}

/** 火炬/篝火火焰片：透明底，暖白芯加上飘的外焰 */
export function beaconFlame() {
  return memo('flame', () => {
    const S = 256, { c, x } = canvas(S, S);
    for (let i = 0; i < 26; i++) {
      const w = drr(16, 54), h = drr(50, 150), px = S / 2 + drr(-26, 26), py = drr(S * 0.4, S * 0.9);
      const g = x.createLinearGradient(0, py, 0, py - h);
      g.addColorStop(0, `rgba(255,${150 + dr() * 60 | 0},48,${drr(0.1, 0.3)})`); g.addColorStop(0.6, 'rgba(255,206,116,0.14)'); g.addColorStop(1, 'rgba(255,232,180,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px + w / 2, py - h * 0.5, px + drr(-8, 8), py - h);
      x.quadraticCurveTo(px - w / 2, py - h * 0.5, px, py); x.fill();
    }
    const core = x.createRadialGradient(S / 2, S * 0.72, 2, S / 2, S * 0.72, S * 0.3), halo = x.createRadialGradient(S / 2, S * 0.66, 4, S / 2, S * 0.66, S * 0.5);
    core.addColorStop(0, 'rgba(255,255,242,0.95)'); core.addColorStop(0.35, 'rgba(255,214,126,0.5)'); core.addColorStop(1, 'rgba(255,150,50,0)');
    halo.addColorStop(0, 'rgba(255,190,96,0.28)'); halo.addColorStop(1, 'rgba(255,150,60,0)');
    x.fillStyle = core; x.fillRect(0, 0, S, S); x.fillStyle = halo; x.fillRect(0, 0, S, S);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 星野：银河带加星点（背景必须黑），供穹顶贴图或 Points */
export function starField(repeat = [1, 1]) {
  return memo(`stars-${repeat}`, () => {
    const S = 1024, { c, x } = canvas(S, S);
    x.fillStyle = '#04060d'; x.fillRect(0, 0, S, S);
    x.save(); x.translate(S / 2, S / 2); x.rotate(-0.55);
    for (let i = 0; i < 3400; i++) {  // 银河：一条斜贯的稀薄云气
      const px = drr(-S, S), py = (dr() + dr() + dr() - 1.5) * S * 0.16;
      x.fillStyle = `rgba(${188 + dr() * 40 | 0},${204 + dr() * 36 | 0},246,${drr(0.015, 0.08)})`;
      x.beginPath(); x.ellipse(px, py, drr(2, 8), drr(1, 3), 0, 0, 7); x.fill();
    }
    for (let i = 0; i < 900; i++) { const px = drr(-S, S), py = (dr() + dr() + dr() - 1.5) * S * 0.13; x.fillStyle = `rgba(236,242,255,${drr(0.2, 0.6)})`; x.beginPath(); x.arc(px, py, drr(0.5, 1.5), 0, 7); x.fill(); }
    x.restore();
    for (let i = 0; i < 2600; i++) {  // 星点：亮度幂律分布，少量亮星挂十字
      const px = dr() * S, py = dr() * S, m = Math.pow(dr(), 2.6), r = 0.5 + m * 2.6;
      x.fillStyle = `rgba(${dr() > 0.82 ? '255,238,218' : '226,238,255'},${0.2 + m * 0.8})`;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      if (m > 0.88) { seg(x, `rgba(232,242,255,${(m - 0.88) * 1.1})`, 0.9, px - r * 4, py, px + r * 4, py); seg(x, `rgba(232,242,255,${(m - 0.88) * 1.1})`, 0.9, px, py - r * 4, px, py + r * 4); }
    }
    return tex(c, { repeat, aniso: 4 });
  });
}

/** 月晕：实心月盘加一圈大羽化，bloom 之后就是海面上那轮月 */
export function moonHalo(size = 256, core = '#f4f8ff') {
  return memo(`moon-${size}-${core}`, () => {
    const { c, x } = canvas(size, size), R = size / 2;
    const halo = x.createRadialGradient(R, R, R * 0.16, R, R, R);
    halo.addColorStop(0, 'rgba(226,238,255,0.42)'); halo.addColorStop(0.3, 'rgba(196,216,246,0.14)'); halo.addColorStop(0.7, 'rgba(168,196,236,0.04)'); halo.addColorStop(1, 'rgba(150,180,224,0)');
    x.fillStyle = halo; x.fillRect(0, 0, size, size);
    const disc = x.createRadialGradient(R - R * 0.06, R - R * 0.07, R * 0.05, R, R, R * 0.24);
    disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.7, core); disc.addColorStop(1, 'rgba(226,236,252,0.86)');
    x.fillStyle = disc; x.beginPath(); x.arc(R, R, R * 0.24, 0, 7); x.fill();
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(188,200,220,${drr(0.06, 0.18)})`; x.beginPath(); x.ellipse(R + drr(-R * 0.16, R * 0.16), R + drr(-R * 0.16, R * 0.16), drr(2, 11), drr(2, 8), 0, 0, 7); x.fill(); }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 海气：横向拉伸的雾条，上下羽化，贴着水面与滩地走 */
export function fogSheet(repeat = [1, 1]) {
  return memo(`fogsheet-${repeat}`, () => {
    const W = 512, H = 256, { c, x } = canvas(W, H);
    for (let i = 0; i < 54; i++) {
      const px = dr() * W, py = drr(H * 0.15, H * 0.85), sw = drr(1.8, 6), hh = drr(6, 26), a = drr(0.16, 0.42);
      x.save(); x.translate(px, py); x.scale(sw, 1);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, hh);
      g.addColorStop(0, `rgba(226,236,248,${a})`); g.addColorStop(0.55, 'rgba(214,228,244,0.14)'); g.addColorStop(1, 'rgba(206,222,240,0)');
      x.fillStyle = g;
      for (const ox of [-W / sw, 0, W / sw]) { x.beginPath(); x.arc(ox, 0, hh, 0, 7); x.fill(); }   // 左右各补一份 → 横向可平铺
      x.restore();
    }
    const fade = x.createLinearGradient(0, 0, 0, H);   // 上下羽化，条带才像浮在水上
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.34, 'rgba(0,0,0,1)'); fade.addColorStop(0.72, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'destination-in'; x.fillStyle = fade; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat });
  });
}
