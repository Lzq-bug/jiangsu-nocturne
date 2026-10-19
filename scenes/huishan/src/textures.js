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

/** 灯笼 ribbed paper surface */
export function lanternPaper(core = '#fff3d0', edge = '#e8734a') {
  return memo(`lamp-${core}-${edge}`, () => {
    const { c, x } = canvas(256, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, edge); g.addColorStop(0.5, core); g.addColorStop(1, edge);
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i <= 14; i++) {
      x.strokeStyle = 'rgba(120,40,20,0.22)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(i * 256 / 14, 0); x.lineTo(i * 256 / 14, 128); x.stroke();
    }
    // faint calligraphy band
    x.fillStyle = 'rgba(150,40,25,0.3)';
    x.fillRect(0, 54, 256, 20);
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

export function cloudPuff() {
  return memo('cloud', () => {
    const { c, x } = canvas(256, 128);
    for (let i = 0; i < 12; i++) {
      const r = 26 + Math.random() * 40;
      const cx = 40 + Math.random() * 176, cy = 64 + (Math.random() * 34 - 17);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(150,168,210,0.3)');
      g.addColorStop(1, 'rgba(150,168,210,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
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

/** 沿街幌子：竖幅布招，下摆剪三个缺口 */
export function banner(text, { cloth = '#a8462f', fg = '#f5e3bd' } = {}) {
  return memo(`banner-${text}-${cloth}`, () => {
    const W = 256, H = 512;
    const { c, x } = canvas(W, H);
    x.fillStyle = cloth; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 6) {
      x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i, 0, 2, H);
    }
    for (let j = 0; j < H; j += 9) {
      x.fillStyle = 'rgba(255,255,255,0.045)'; x.fillRect(0, j, W, 2);
    }
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(0.42, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.26)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(20,10,8,0.5)'; x.lineWidth = 8; x.strokeRect(10, 6, W - 20, H - 40);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = [...text];
    const size = Math.min(150, (H - 110) / chars.length);
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    chars.forEach((ch, i) => {
      x.font = `600 ${size}px ${font}`;
      x.fillText(ch, W / 2, 76 + ((H - 190) / Math.max(1, chars.length)) * (i + 0.5));
    });
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) {
      const cx = 42 + i * 86;
      x.beginPath();
      x.moveTo(cx - 34, H - 34); x.lineTo(cx, H - 6); x.lineTo(cx + 34, H - 34);
      x.closePath(); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 贴水的薄雾：横向拉丝，两头化开 */
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
    return tex(c, { repeat: [1, 1] });
  });
}

/** 乌篷：竹篾篷的横向筋 */
export function wupengWeave(base = '#2c2b28') {
  return memo(`wp-${base}`, () => {
    const { c, x } = canvas(128, 128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 9; i++) {
      const y = i * 14 + 4;
      x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 4;
      x.beginPath(); x.arc(64, y + 26, 78, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 2;
      x.beginPath(); x.arc(64, y + 26, 78, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
    }
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(120,110,90,0.05)' : 'rgba(0,0,0,0.09)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
    }
    return tex(c, { repeat: [2, 1] });
  });
}

/** 湖石（太湖石）：溶蚀孔洞与灰白面，二泉岸与寄畅园叠石共用 */
export function lakeStone(base = '#9aa1ac') {
  return memo(`lstone-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) {
      const cx = Math.random() * 256, cy = Math.random() * 256;
      const r = 4 + Math.random() * 26;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const dark = Math.random() > 0.5;
      g.addColorStop(0, dark ? 'rgba(24,30,42,0.5)' : 'rgba(232,238,246,0.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(cx, cy, r, r * (0.5 + Math.random() * 0.7), Math.random() * 3, 0, 7); x.fill();
    }
    // 溶蚀的沟槽
    for (let i = 0; i < 34; i++) {
      x.strokeStyle = `rgba(20,26,36,${0.1 + Math.random() * 0.22})`;
      x.lineWidth = 1 + Math.random() * 3.5;
      x.beginPath();
      let px = Math.random() * 256, py = Math.random() * 256;
      x.moveTo(px, py);
      for (let k = 0; k < 5; k++) {
        px += (Math.random() - 0.5) * 60; py += (Math.random() - 0.5) * 46;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 竹叶与竹枝：剪影插片，二泉院与街巷角落用 */
export function bambooLeaf() {
  return memo('bamboo', () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    x.strokeStyle = 'rgba(40,70,50,0.9)';
    for (let i = 0; i < 26; i++) {
      const cx = Math.random() * S, cy = Math.random() * S;
      const a = Math.random() * Math.PI;
      const len = 16 + Math.random() * 30;
      x.save();
      x.translate(cx, cy); x.rotate(a);
      const g = x.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(58,104,74,0.95)');
      g.addColorStop(1, 'rgba(30,60,44,0.75)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(len * 0.5, -4 - Math.random() * 3, len, 0);
      x.quadraticCurveTo(len * 0.5, 4 + Math.random() * 3, 0, 0);
      x.fill();
      x.restore();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 石面刻字：听松一类题刻，凹下去的字带一道受光的下唇 */
export function carve(text, { stone = '#b9c1cd', size = 256 } = {}) {
  return memo(`carve-${text}`, () => {
    const { c, x } = canvas(size, size);
    x.fillStyle = stone; x.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,48,60,0.07)';
      x.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    const chars = [...text];
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    const fs = Math.min(150, (size - 40) / chars.length);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      const cx = size / 2, cy = 46 + ((size - 80) / chars.length) * (i + 0.5);
      x.font = `600 ${fs}px ${font}`;
      x.fillStyle = 'rgba(232,239,248,0.5)';
      x.fillText(ch, cx + 2, cy + 3);
      x.fillStyle = 'rgba(28,36,48,0.82)';
      x.fillText(ch, cx, cy);
    });
    return tex(c, { repeat: [1, 1] });
  });
}
