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

/**
 * 《枫桥夜泊》诗碑碑面：竖行右起，刻口压深并带一侧高光，
 * 这样在斜射的寺灯下才读得出笔画的起伏。
 */
export function poemStone({
  lines = ['月落乌啼霜满天', '江枫渔火对愁眠', '姑苏城外寒山寺', '夜半钟声到客船'],
  head = '枫桥夜泊', tail = '张继　俞樾书', seal = '寒山',
} = {}) {
  return memo(`poem-${head}-${lines.length}`, () => {
    const W = 512, H = 1024;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#949aa7'); g.addColorStop(0.45, '#7f8695'); g.addColorStop(1, '#6a7180');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(20,24,32,0.07)';
      x.fillRect(Math.random() * W, Math.random() * H, 1.8, 1.8);
    }
    // 碑缘
    x.strokeStyle = 'rgba(30,34,44,0.55)'; x.lineWidth = 10; x.strokeRect(14, 14, W - 28, H - 28);
    x.strokeStyle = 'rgba(226,232,242,0.22)'; x.lineWidth = 2; x.strokeRect(30, 30, W - 60, H - 60);
    const font = '"KaiTi","STKaiti","Songti SC","SimSun",serif';
    const col = (text, i, size, y0, y1, ink) => {
      const cx = W - 62 - i * (size + 16);
      const step = (y1 - y0) / text.length;
      [...text].forEach((ch, k) => {
        const cy = y0 + step * (k + 0.5);
        x.font = `600 ${size}px ${font}`;
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = 'rgba(214,222,234,0.4)';      // 刻口受光的一侧
        x.fillText(ch, cx + 2.5, cy + 2.5);
        x.fillStyle = ink;
        x.fillText(ch, cx, cy);
      });
    };
    const bodySize = 62;
    col(head, 0, 74, 74, 168, '#1f2632');                     // 碑首一行
    lines.forEach((ln, i) => col(ln, i + 1, bodySize, 200, H - 150, '#1c222d'));
    const last = lines.length + 1;
    col(tail, last, 40, 210, H - 160, '#2c3442');
    if (seal) {
      x.fillStyle = 'rgba(146,44,34,0.86)';
      x.fillRect(58, H - 128, 62, 62);
      x.fillStyle = '#f0e2c8';
      x.font = `600 26px ${font}`;
      [...seal].forEach((ch, i) => x.fillText(ch, 89, H - 112 + i * 30));
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 市招 / 酒旗：布面竖写一到三字，下摆剪口 */
export function banner(text, { cloth = '#b6493a', fg = '#f5e3bd' } = {}) {
  return memo(`banner-${text}-${cloth}`, () => {
    const W = 256, H = 512;
    const { c, x } = canvas(W, H);
    x.fillStyle = cloth; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 6) {                    // 织纹
      x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i, 0, 2, H);
    }
    for (let j = 0; j < H; j += 9) {
      x.fillStyle = 'rgba(255,255,255,0.045)'; x.fillRect(0, j, W, 2);
    }
    const g = x.createLinearGradient(0, 0, W, 0);       // 布幅的受光与阴影
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
      x.fillText(ch, W / 2, 76 + (H - 190) / Math.max(1, chars.length) * (i + 0.5));
    });
    // 下摆：剪出三个缺口的布边
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      const cx = 42 + i * 86;
      x.moveTo(cx - 34, H - 34); x.lineTo(cx, H - 6); x.lineTo(cx + 34, H - 34);
      x.closePath(); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/** 枫叶剪影（带 alpha），落叶与树冠插片共用 */
export function mapleLeaf(color = '#93301f') {
  return memo(`maple-${color}`, () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    const pts = [];
    const lobes = 5;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
      const lobe = Math.abs(Math.sin(a * (lobes / 2) + 0.6));
      const jag = 0.62 + 0.38 * Math.pow(lobe, 0.55);
      const r = S * 0.42 * jag;
      pts.push([S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r * 1.02]);
    }
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, color); g.addColorStop(0.6, '#c2542c'); g.addColorStop(1, '#6f2118');
    x.fillStyle = g;
    x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(40,12,8,0.5)'; x.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(S / 2 + Math.cos(a) * S * 0.34, S / 2 + Math.sin(a) * S * 0.34); x.stroke();
    }
    x.lineWidth = 3.4;
    x.beginPath(); x.moveTo(S / 2, S / 2 + 6); x.lineTo(S / 2, S - 4); x.stroke();
    return tex(c, { repeat: [1, 1] });
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

/* ------------------------------------------------------------------ 园林专用 */

/** 花街铺地：方砖 + 卵石镶边，走线的磨损在夜里只剩一点点反差 */
export function cobble() {
  return memo('cobble', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#7c828f'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const v = 0.86 + Math.random() * 0.3;
        x.fillStyle = `rgba(${Math.floor(140 * v)},${Math.floor(146 * v)},${Math.floor(158 * v)},1)`;
        x.fillRect(i * 32 + 2, j * 32 + 2, 28, 28);
      }
    }
    x.strokeStyle = 'rgba(30,34,44,0.5)'; x.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i * 32); x.lineTo(256, i * 32); x.stroke();
    }
    for (let i = 0; i < 2400; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    return tex(c, { repeat: [4, 4] });
  });
}

/** 太湖石：凹凸的窝坑与贯穿的皱褶 */
export function rockSurface() {
  return memo('rockSurface', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#8b93a2'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const cx = Math.random() * 256, cy = Math.random() * 256;
      const r = 6 + Math.random() * 26;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(24,28,38,0.75)');
      g.addColorStop(0.6, 'rgba(70,78,92,0.35)');
      g.addColorStop(1, 'rgba(180,190,205,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(cx, cy, r, r * (0.5 + Math.random() * 0.6), Math.random() * 3, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(228,236,246,0.16)'; x.lineWidth = 1.6;
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      let px = Math.random() * 256, py = Math.random() * 256;
      x.moveTo(px, py);
      for (let k = 0; k < 5; k++) {
        px += (Math.random() - 0.5) * 46; py += (Math.random() - 0.5) * 46;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    return tex(c, { repeat: [1.6, 1.6] });
  });
}

/** 芭蕉叶：一道中脉、斜向平行脉、叶缘的裂口 */
export function plantainLeaf() {
  return memo('plantainLeaf', () => {
    const { c, x } = canvas(256, 128);
    x.clearRect(0, 0, 256, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#4d7d55'); g.addColorStop(0.5, '#63956a'); g.addColorStop(1, '#37604a');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(6, 64);
    x.quadraticCurveTo(128, 4, 250, 64);
    x.quadraticCurveTo(128, 124, 6, 64);
    x.fill();
    x.strokeStyle = 'rgba(220,238,206,0.5)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(8, 64); x.lineTo(248, 64); x.stroke();
    x.lineWidth = 1.2; x.strokeStyle = 'rgba(206,230,196,0.26)';
    for (let i = 0; i < 26; i++) {
      const px = 20 + i * 8.6;
      x.beginPath(); x.moveTo(px, 64); x.lineTo(px + 16, i % 2 ? 112 : 16); x.stroke();
    }
    // 裂口：把叶缘擦掉几道
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const px = 40 + Math.random() * 180, s = Math.random() > 0.5 ? 1 : -1;
      x.beginPath();
      x.moveTo(px, 64 + s * 6);
      x.lineTo(px + 10 + Math.random() * 14, 64 + s * 58);
      x.lineTo(px + 16, 64 + s * 8);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/** 荷叶：圆盘带缺口 + 放射叶脉，中心最深 */
export function lotusLeaf() {
  return memo('lotusLeaf', () => {
    const { c, x } = canvas(256, 256);
    x.clearRect(0, 0, 256, 256);
    const cx = 128, cy = 128, r = 118;
    const g = x.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, '#243f2c'); g.addColorStop(0.45, '#3d6a45'); g.addColorStop(1, '#5f8f5e');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, r, 0.18, Math.PI * 2 - 0.18);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(190,220,180,0.22)'; x.lineWidth = 1.6;
    for (let i = 0; i < 22; i++) {
      const a = 0.2 + (i / 22) * (Math.PI * 2 - 0.4);
      x.beginPath(); x.moveTo(cx, cy);
      x.quadraticCurveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55 + 6,
        cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
      x.stroke();
    }
    x.fillStyle = 'rgba(230,244,236,0.5)';
    x.beginPath(); x.arc(cx, cy, 5, 0, 7); x.fill();
    return tex(c, { repeat: [1, 1] });
  });
}

/**
 * 窗芯：
 *  ice   —— 冰裂纹（乱折线拼出的空洞）
 *  lattice—— 方眼/菱花，规矩的一格一格
 *  blue  —— 蓝色玻璃长窗，从里看像一片海山
 * 底色被灯光打透，所以底色亮、筋线暗。
 */
export function latticeWindow(kind = 'lattice') {
  return memo(`lw-${kind}`, () => {
    const S = 256;
    const { c, x } = canvas(S, S);
    if (kind === 'blue') {
      const g = x.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#7fb6d8'); g.addColorStop(0.55, '#4a86ae'); g.addColorStop(1, '#2c5a7c');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(232,246,255,0.32)';
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        x.moveTo(0, S - i * 26);
        for (let k = 0; k <= 8; k++) x.lineTo(k * S / 8, S - i * 26 - Math.sin(k + i) * 9);
        x.lineTo(S, S); x.lineTo(0, S); x.fill();
      }
    } else if (kind === 'ice') {
      x.fillStyle = '#e9dcbc'; x.fillRect(0, 0, S, S);
      x.strokeStyle = '#3a2517'; x.lineWidth = 9; x.lineCap = 'square';
      for (let i = 0; i < 16; i++) {
        let px = Math.random() * S, py = Math.random() * S;
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 3; k++) {
          px += (Math.random() - 0.5) * 130; py += (Math.random() - 0.5) * 130;
          x.lineTo(px, py);
        }
        x.stroke();
      }
    } else {
      x.fillStyle = '#e6d8b6'; x.fillRect(0, 0, S, S);
      x.strokeStyle = '#41281a'; x.lineWidth = 8;
      const n = 6, step = S / n;
      for (let i = 0; i <= n; i++) {
        x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, S); x.stroke();
        x.beginPath(); x.moveTo(0, i * step); x.lineTo(S, i * step); x.stroke();
      }
      x.lineWidth = 5;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cx = i * step + step / 2, cy = j * step + step / 2;
          x.beginPath();
          x.moveTo(cx, cy - step * 0.34); x.lineTo(cx + step * 0.34, cy);
          x.lineTo(cx, cy + step * 0.34); x.lineTo(cx - step * 0.34, cy);
          x.closePath(); x.stroke();
        }
      }
    }
    x.strokeStyle = 'rgba(40,24,14,0.9)'; x.lineWidth = 16;
    x.strokeRect(8, 8, S - 16, S - 16);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 白墙上的水墨山水屏——光影秀把它"盘活"的正是这张图 */
export function inkPainting() {
  return memo('inkPainting', () => {
    const W = 512, H = 256;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#efe6d2'); g.addColorStop(1, '#d9cfb8');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // 远山：一层层淡墨推出去
    for (let i = 0; i < 5; i++) {
      x.fillStyle = `rgba(60,72,88,${0.1 + i * 0.06})`;
      x.beginPath();
      const base = 150 - i * 22;
      x.moveTo(-10, H);
      for (let k = 0; k <= 10; k++) {
        const px = -10 + k * (W + 20) / 10;
        x.lineTo(px, base - Math.abs(Math.sin(k * 0.9 + i * 1.7)) * (34 - i * 4));
      }
      x.lineTo(W + 10, H); x.closePath(); x.fill();
    }
    // 水面留白 + 几笔皴
    x.strokeStyle = 'rgba(70,84,100,0.3)'; x.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const y = 176 + i * 5;
      x.beginPath(); x.moveTo(30 + Math.random() * 60, y);
      x.lineTo(30 + Math.random() * 60 + 120 + Math.random() * 180, y); x.stroke();
    }
    // 一坡一树，气口就在这一团浓墨
    x.strokeStyle = 'rgba(36,42,52,0.72)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(392, 208); x.quadraticCurveTo(404, 152, 396, 118); x.stroke();
    x.lineWidth = 1.8;
    for (let i = 0; i < 9; i++) {
      x.beginPath(); x.moveTo(396, 130 + i * 6);
      x.lineTo(396 + (i % 2 ? 26 : -22), 112 + i * 8); x.stroke();
    }
    x.fillStyle = 'rgba(40,46,56,0.5)';
    for (let i = 0; i < 60; i++) {
      x.beginPath(); x.ellipse(396 + (Math.random() - 0.5) * 54, 112 + Math.random() * 46, 5, 3, 0, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 黄石：镇江—扬州一带的黄石，层理分明、棱角硬，与湖石的皱透正好相反 */
export function rockStrata(base = '#8a6a44') {
  return memo(`strata-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    let y = 0;
    while (y < 256) {
      const hh = 12 + Math.random() * 26;
      const g = x.createLinearGradient(0, y, 0, y + hh);
      g.addColorStop(0, 'rgba(255,236,206,0.16)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(28,16,6,0.42)');
      x.fillStyle = g; x.fillRect(0, y, 256, hh);
      // 层间一条深色裂缝，偶有错台
      x.strokeStyle = 'rgba(22,12,4,0.55)'; x.lineWidth = 1.8;
      x.beginPath(); x.moveTo(0, y + hh);
      for (let px = 0; px <= 256; px += 24) x.lineTo(px, y + hh + (Math.random() - 0.5) * 3);
      x.stroke();
      const off = Math.floor(Math.random() * 90);
      for (let px = off; px < 256; px += 60 + Math.random() * 70) {
        x.strokeStyle = 'rgba(20,12,4,0.3)'; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(px, y); x.lineTo(px + (Math.random() - 0.5) * 6, y + hh); x.stroke();
      }
      y += hh;
    }
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = `rgba(${120 + Math.random() * 90 | 0},${86 + Math.random() * 60 | 0},44,0.14)`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    return tex(c, { repeat: [2, 2] });
  });
}

/** 宣石（雪石）：底色青白，石英斑点在未日照时会回光，隙间积白 */
export function rockQuartz(base = '#aeb8c6') {
  return memo(`quartz-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      const px = Math.random() * 256, py = Math.random() * 256, r = 12 + Math.random() * 46;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(1, 'rgba(150,168,190,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.5})`;
      const s = Math.random() < 0.85 ? 1 : 2;
      x.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }
    x.strokeStyle = 'rgba(60,72,92,0.32)'; x.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      let px = Math.random() * 256, py = Math.random() * 256;
      x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; x.lineTo(px, py); }
      x.stroke();
    }
    return tex(c, { repeat: [2, 2] });
  });
}

/** 石笋：竖棱如笋壳层层抱合，用于春山那一行 */
export function shootStriate(base = '#7f8899') {
  return memo(`shoot-${base}`, () => {
    const { c, x } = canvas(128, 256);
    x.fillStyle = base; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 9; i++) {
      const u = i * 14 + 4;
      const g = x.createLinearGradient(u, 0, u + 14, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.45)');
      g.addColorStop(0.45, 'rgba(226,234,244,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0.38)');
      x.fillStyle = g; x.fillRect(u, 0, 14, 256);
    }
    x.strokeStyle = 'rgba(28,34,44,0.4)'; x.lineWidth = 2;
    for (let j = 0; j < 11; j++) {
      const y = j * 24 + Math.random() * 8;
      x.beginPath(); x.moveTo(0, y);
      for (let px = 0; px <= 128; px += 16) x.lineTo(px, y + Math.sin(px * 0.09 + j) * 4);
      x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 花街铺地：卵石与瓦片拼的园里地面，夜里只余一点花纹 */
export function pavedFlower() {
  return memo('pave-flower', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#6a6f78'; x.fillRect(0, 0, 256, 256);
    // 八角与方井交替的卵石带
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const cx0 = gx * 128 + 64, cy0 = gy * 128 + 64;
        x.strokeStyle = 'rgba(214,208,192,0.5)'; x.lineWidth = 5;
        x.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const px = cx0 + Math.cos(a) * 44, py = cy0 + Math.sin(a) * 44;
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.closePath(); x.stroke();
        x.strokeStyle = 'rgba(176,118,92,0.42)'; x.lineWidth = 4;
        x.beginPath(); x.arc(cx0, cy0, 26, 0, 7); x.stroke();
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * 7, r = 30 + Math.random() * 18;
          x.fillStyle = `rgba(${200 + Math.random() * 45 | 0},${196 + Math.random() * 40 | 0},182,0.5)`;
          x.beginPath(); x.ellipse(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r, 3, 2, a, 0, 7); x.fill();
        }
      }
    }
    // 瓦条立砌的收边
    x.fillStyle = 'rgba(44,50,60,0.6)';
    for (let i = 0; i < 256; i += 8) { x.fillRect(i, 0, 3, 256); x.fillRect(0, i, 256, 3); }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.16})`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    return tex(c, { repeat: [8, 8] });
  });
}

/** 粉墙竹影：透明底、灰竹，贴到白墙上只压暗笔画，整片墙不受影响 */
export function bambooShadow() {
  return memo('bamboo-shadow', () => {
    const { c, x } = canvas(512, 512);
    x.clearRect(0, 0, 512, 512);
    const culms = 7;
    for (let i = 0; i < culms; i++) {
      const bx = 20 + Math.random() * 460;
      const lean = (Math.random() - 0.5) * 90;
      const w = 7 + Math.random() * 9;
      x.strokeStyle = `rgba(126,138,152,${0.24 + Math.random() * 0.2})`;
      x.lineWidth = w;
      x.beginPath(); x.moveTo(bx, 512);
      let px = bx, py = 512;
      for (let k = 1; k <= 7; k++) {
        const ny = 512 - k * 70;
        const nx = bx + lean * (k / 7);
        x.lineTo(nx, ny); x.stroke();
        x.beginPath(); x.moveTo(nx, ny); px = nx; py = ny;
      }
      x.stroke();
      // 节
      x.strokeStyle = 'rgba(96,108,124,0.42)'; x.lineWidth = 2.4;
      for (let k = 1; k < 7; k++) {
        const ny = 512 - k * 70, nx = bx + lean * (k / 7);
        x.beginPath(); x.moveTo(nx - w * 0.6, ny); x.lineTo(nx + w * 0.6, ny - 2); x.stroke();
      }
      // 枝叶：三五成组，撇出去
      for (let k = 2; k < 7; k++) {
        if (Math.random() < 0.4) continue;
        const nx = bx + lean * (k / 7), ny = 512 - k * 70;
        for (let j = 0; j < 9; j++) {
          const a = (-0.2 - Math.random() * 1.1) * (Math.random() < 0.5 ? 1 : -1);
          const len = 26 + Math.random() * 40;
          x.strokeStyle = `rgba(112,126,140,${0.22 + Math.random() * 0.22})`;
          x.lineWidth = 5 + Math.random() * 5;
          x.beginPath();
          x.moveTo(nx, ny);
          x.quadraticCurveTo(nx + Math.cos(a) * len * 0.6, ny + Math.sin(a) * len * 0.6 - 8,
            nx + Math.cos(a) * len, ny + Math.sin(a) * len);
          x.stroke();
        }
      }
    }
    // 四边淡出：贴图是个方块，边缘不收干净就露出一块矩形
    x.globalCompositeOperation = 'destination-in';
    const vg = x.createRadialGradient(256, 256, 150, 256, 256, 330);
    vg.addColorStop(0, 'rgba(0,0,0,1)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = vg; x.fillRect(0, 0, 512, 512);
    x.globalCompositeOperation = 'source-over';
    return tex(c, { repeat: [1, 1] });
  });
}

/** 雪意：一地的白，边缘散开成斑块，给冬山那一片铺地 */
export function snowCover() {
  return memo('snow-cover', () => {
    const { c, x } = canvas(256, 256);
    x.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 34; i++) {
      const px = Math.random() * 256, py = Math.random() * 256, r = 16 + Math.random() * 54;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(232,240,252,0.5)');
      g.addColorStop(0.7, 'rgba(222,232,246,0.16)');
      g.addColorStop(1, 'rgba(222,232,246,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 砖雕门罩：巷门上一片青砖叠涩，中央嵌额题字 */
export function brickCarve(text = '个园') {
  return memo(`carve-${text}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#5d6472'; x.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 16; j++) {
      const off = j % 2 ? 0 : 32;
      for (let i = -1; i < 9; i++) {
        x.fillStyle = `rgba(${70 + Math.random() * 30 | 0},${78 + Math.random() * 30 | 0},92,0.9)`;
        x.fillRect(i * 64 + off + 2, j * 16 + 1, 60, 13);
      }
    }
    // 叠涩出挑的三条檐线
    for (let k = 0; k < 3; k++) {
      x.fillStyle = 'rgba(28,34,46,0.55)';
      x.fillRect(10, 34 + k * 18, 236, 6);
      x.fillStyle = 'rgba(196,204,216,0.22)';
      x.fillRect(10, 40 + k * 18, 236, 2);
    }
    // 中央额堂
    x.fillStyle = '#2b3240'; x.fillRect(58, 96, 140, 118);
    x.strokeStyle = 'rgba(186,194,206,0.6)'; x.lineWidth = 4;
    x.strokeRect(58, 96, 140, 118);
    x.fillStyle = '#e9dcc0';
    x.font = '700 58px "Songti SC","STSong","SimSun",serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    [...text].forEach((ch, i) => x.fillText(ch, 128, 128 + i * 62));
    return tex(c, { repeat: [1, 1] });
  });
}
