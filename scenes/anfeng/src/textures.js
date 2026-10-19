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

/** radial falloff: 灶火、灯笼、星、月晕、潮头泡沫都用它 */
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

/** 瓦垄 — 筒瓦屋顶，u 沿坡面向下 */
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
    for (let j = 0; j < 20; j++) {
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.fillRect(0, j * 13 + (Math.random() * 2 | 0), 256, 2);
      x.fillStyle = 'rgba(255,255,255,0.05)';
      x.fillRect(0, j * 13 + 3, 256, 1);
    }
    return tex(c, { repeat: [4, 2] });
  });
}

/** 草顶：灶房与窝棚的茅篷，横向扎束 */
export function thatchRoof(base = '#4a4231') {
  return memo(`thatch-${base}`, () => {
    const { c, x } = canvas(256, 128);
    x.fillStyle = base; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) {
      const y = i * 5 + Math.random() * 3;
      x.strokeStyle = `rgba(206,188,140,${0.06 + Math.random() * 0.14})`;
      x.lineWidth = 1 + Math.random() * 2.4;
      x.beginPath(); x.moveTo(0, y);
      x.bezierCurveTo(70, y + 3, 170, y - 3, 256, y + 1);
      x.stroke();
    }
    for (let k = 0; k < 8; k++) {                   // 扎束的横绳
      x.fillStyle = 'rgba(24,20,14,0.5)';
      x.fillRect(0, k * 16 + 6, 256, 2);
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(220,200,150,0.05)';
      x.fillRect(Math.random() * 256, Math.random() * 128, 1.6, 1.6);
    }
    return tex(c, { repeat: [3, 2] });
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

/** 堤面护石：比房屋砌石更大块、带海水蚀痕与盐霜 */
export function seaRock() {
  return memo('searock', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#6b7280'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {                  // 大块乱砌
      const w = 34 + Math.random() * 46, h = 24 + Math.random() * 30;
      const px = Math.random() * 256, py = Math.random() * 256;
      const v = 92 + Math.random() * 60;
      x.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
      x.beginPath();
      x.moveTo(px, py + 4);
      x.lineTo(px + w * 0.9, py);
      x.lineTo(px + w, py + h * 0.8);
      x.lineTo(px + w * 0.15, py + h);
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(12,16,22,0.5)'; x.lineWidth = 2; x.stroke();
      // 向水一面挂白盐霜
      x.fillStyle = `rgba(228,238,244,${0.05 + Math.random() * 0.12})`;
      x.fillRect(px, py + h * 0.62, w, h * 0.3);
    }
    for (let i = 0; i < 3400; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
    return tex(c, { repeat: [2.4, 1.6] });
  });
}

/** 夯土堤坡：草皮与夯层交错，坡脚被雨水冲出沟 */
export function dikeEarth() {
  return memo('dikeearth', () => {
    const { c, x } = canvas(256, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#4b4a38'); g.addColorStop(0.55, '#3d3a2c'); g.addColorStop(1, '#2c2a20');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 5; r++) {                   // 夯层
      const y = r * 52 + 12;
      x.fillStyle = 'rgba(18,16,10,0.35)';
      x.fillRect(0, y, 256, 3);
      x.fillStyle = 'rgba(196,182,140,0.06)';
      x.fillRect(0, y + 3, 256, 2);
    }
    for (let i = 0; i < 900; i++) {                 // 草皮碎点
      x.strokeStyle = `rgba(${120 + Math.random() * 60},${132 + Math.random() * 60},${86 + Math.random() * 40},${0.05 + Math.random() * 0.12})`;
      x.lineWidth = 1;
      const px = Math.random() * 256, py = Math.random() * 256;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.random() * 4 - 2, py - 3 - Math.random() * 4); x.stroke();
    }
    for (let i = 0; i < 26; i++) {                  // 冲沟
      x.strokeStyle = 'rgba(14,12,8,0.4)';
      x.lineWidth = 1 + Math.random() * 3.2;
      x.beginPath();
      const px = Math.random() * 256;
      x.moveTo(px, 0);
      x.bezierCurveTo(px + 12, 80, px - 14, 170, px + 6, 256);
      x.stroke();
    }
    return tex(c, { repeat: [3, 2] });
  });
}

/** 青石板街：长条石错缝，路面被车辕磨亮 */
export function flagstone(base = '#5d6470') {
  return memo(`flag-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 7; r++) {
      const y = r * 37;
      const off = (r % 2) * 46;
      for (let k = -1; k < 5; k++) {
        const px = k * 92 + off;
        const v = 118 + Math.random() * 44;
        x.fillStyle = `rgb(${v - 8},${v - 2},${v + 10})`;
        x.fillRect(px + 2, y + 2, 88, 33);
        x.strokeStyle = 'rgba(8,10,16,0.55)'; x.lineWidth = 2;
        x.strokeRect(px + 2, y + 2, 88, 33);
      }
    }
    // 车辙与磨光
    const g = x.createLinearGradient(0, 90, 0, 170);
    g.addColorStop(0, 'rgba(226,232,240,0)');
    g.addColorStop(0.5, 'rgba(226,232,240,0.14)');
    g.addColorStop(1, 'rgba(226,232,240,0)');
    x.fillStyle = g; x.fillRect(0, 90, 256, 80);
    for (let i = 0; i < 5200; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
    }
    return tex(c, { repeat: [6, 12] });
  });
}

/** 盐壳：堆顶与卤池边的白霜，颗粒感强 */
export function saltCrust() {
  return memo('saltcrust', () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#c9d2d8'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {                // 结晶颗粒
      const px = Math.random() * 256, py = Math.random() * 256;
      const r = 0.8 + Math.random() * 3.4;
      const v = 200 + Math.random() * 55;
      x.fillStyle = `rgba(${v},${v + 4},${v + 10},0.85)`;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 60; i++) {                  // 融雪状的暗斑
      x.fillStyle = 'rgba(96,104,120,0.16)';
      x.beginPath();
      x.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 22, 4 + Math.random() * 10, Math.random() * 3, 0, 7);
      x.fill();
    }
    return tex(c, { repeat: [3, 3] });
  });
}

/** 白粉墙：带雨痕与霉斑，夜里只吃暖光 */
export function plaster(base = '#cfc4ad') {
  return memo(`plaster-${base}`, () => {
    const { c, x } = canvas(128, 128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(70,55,40,0.06)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
    }
    for (let i = 0; i < 9; i++) {                   // 檐口滴下的黑痕
      x.fillStyle = 'rgba(40,36,30,0.12)';
      x.fillRect(Math.random() * 128, 0, 2 + Math.random() * 4, 30 + Math.random() * 70);
    }
    return tex(c, { repeat: [3, 2] });
  });
}

/** 匾额 / 招幌。dir 'h' 横读（右起），'v' 竖读 */
export function plaque(text, { dir = 'h', bg = '#1a2a3e', fg = '#f2dcae', border = '#c9974f', note = '' } = {}) {
  return memo(`plaque-${dir}-${text}-${bg}`, () => {
    const wide = dir === 'h';
    const W = wide ? 512 : 190, H = wide ? 190 : 512;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1626'); g.addColorStop(0.5, bg); g.addColorStop(1, '#071220');
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

/** 灯笼纸面 */
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
    x.fillStyle = 'rgba(150,40,25,0.3)';
    x.fillRect(0, 54, 256, 20);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 窗棂：留出透光，室内灯火才看得出来 */
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
    x.lineWidth = 4;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = i * cw + cw / 2, cy = j * rh + rh / 2, r = Math.min(cw, rh) * 0.3;
      x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.closePath(); x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 席篷：盐船与灶房棚顶的篾席 */
export function matWeave(base = '#4a3f2b') {
  return memo(`mat-${base}`, () => {
    const { c, x } = canvas(128, 128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      x.fillStyle = 'rgba(226,206,160,0.09)'; x.fillRect(0, i * 8, 128, 3);
      x.fillStyle = 'rgba(20,16,10,0.22)'; x.fillRect(i * 8, 0, 3, 128);
    }
    for (let i = 0; i < 1800; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,240,200,0.04)' : 'rgba(0,0,0,0.08)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
    }
    return tex(c, { repeat: [2, 2] });
  });
}

export function cloudPuff() {
  return memo('cloud', () => {
    const { c, x } = canvas(256, 128);
    for (let i = 0; i < 12; i++) {
      const r = 26 + Math.random() * 40;
      const cx = 40 + Math.random() * 176, cy = 64 + (Math.random() * 34 - 17);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(168,186,220,0.28)');
      g.addColorStop(1, 'rgba(168,186,220,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 灯火在水面拖出的光柱 */
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

/** 贴水的海气：横向拉丝，中间密、两头化开 */
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
      g.addColorStop(0, 'rgba(196,216,232,0)');
      g.addColorStop(0.5, `rgba(210,228,242,${a})`);
      g.addColorStop(1, 'rgba(196,216,232,0)');
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

/** 芦花穗：竖长条，上松下紧，插在草荡里 */
export function reedPlume(tip = '#d8cfae', base = '#7d7a54') {
  return memo(`reed-${tip}`, () => {
    const W = 64, H = 256;
    const { c, x } = canvas(W, H);
    x.clearRect(0, 0, W, H);
    x.strokeStyle = base; x.lineWidth = 2;
    for (let i = 0; i < 7; i++) {                   // 秆
      const px = 14 + i * 5 + Math.random() * 3;
      x.beginPath(); x.moveTo(px, H);
      x.bezierCurveTo(px - 2, H * 0.66, px + 3, H * 0.4, px + Math.random() * 6 - 3, H * 0.16);
      x.stroke();
    }
    for (let i = 0; i < 620; i++) {                 // 穗的绒毛
      const t = Math.random();
      const px = W / 2 + (Math.random() - 0.5) * (10 + 26 * (1 - t));
      const py = H * (0.05 + t * 0.4);
      x.fillStyle = `rgba(${216 + Math.random() * 30},${206 + Math.random() * 30},${170 + Math.random() * 40},${0.16 + Math.random() * 0.4})`;
      x.fillRect(px, py, 1.6, 1.6 + Math.random() * 3);
    }
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(232,224,196,0.5)');
    g.addColorStop(0.42, 'rgba(150,148,110,0.28)');
    g.addColorStop(1, 'rgba(70,72,48,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    return tex(c, { repeat: [1, 1] });
  });
}

/** 灶火舌：橙白向上，用于灶口与柴堆的贴片 */
export function flameSprite() {
  return memo('flame', () => {
    const S = 128;
    const { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    for (let i = 0; i < 34; i++) {                  // 一簇向上升的火苗
      const w = 6 + Math.random() * 22;
      const px = S / 2 + (Math.random() - 0.5) * 40;
      const h = 34 + Math.random() * 60;
      const g = x.createLinearGradient(0, S, 0, S - h);
      g.addColorStop(0, 'rgba(255,214,140,0.9)');
      g.addColorStop(0.35, 'rgba(255,150,60,0.55)');
      g.addColorStop(1, 'rgba(190,60,20,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(px - w / 2, S);
      x.quadraticCurveTo(px, S - h, px + w / 2, S);
      x.closePath(); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 烟柱团：灶烟与水汽共用 */
export function smokePuff() {
  return memo('smoke', () => {
    const { c, x } = canvas(128, 128);
    for (let i = 0; i < 16; i++) {
      const r = 16 + Math.random() * 34;
      const cx = 64 + (Math.random() - 0.5) * 52, cy = 64 + (Math.random() - 0.5) * 52;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(176,178,186,0.24)');
      g.addColorStop(1, 'rgba(176,178,186,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/**
 * 堤碑碑面：竖行右起，刻口压深并带一侧高光，
 * 斜射的堤灯下才读得出笔画起伏。文句由 data.js 传入。
 */
export function steleFace({ lines = [], head = '', tail = '', seal = '' } = {}) {
  return memo(`stele-${head}-${lines.join('')}`, () => {
    const W = 512, H = 1024;
    const { c, x } = canvas(W, H);
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#8f98a6'); g.addColorStop(0.45, '#7b8391'); g.addColorStop(1, '#666e7c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(20,24,32,0.07)';
      x.fillRect(Math.random() * W, Math.random() * H, 1.8, 1.8);
    }
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
        x.fillStyle = 'rgba(214,222,234,0.4)';
        x.fillText(ch, cx + 2.5, cy + 2.5);
        x.fillStyle = ink;
        x.fillText(ch, cx, cy);
      });
    };
    let next = 0;
    if (head) { col(head, next++, 74, 74, 168, '#1f2632'); }
    lines.forEach((ln, i) => col(ln, next + i, 62, 200, H - 150, '#1c222d'));
    if (tail) col(tail, next + lines.length, 40, 210, H - 160, '#2c3442');
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

/** 市招 / 幌子：布面竖写，下摆剪口 */
export function banner(text, { cloth = '#a8503f', fg = '#f5e3bd' } = {}) {
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
      x.fillText(ch, W / 2, 76 + (H - 190) / Math.max(1, chars.length) * (i + 0.5));
    });
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
