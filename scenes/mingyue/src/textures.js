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

let s = 77654321;
const rnd = () => {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * 碟瓦卵石波浪纹铺地。碎瓦侧立排成一道道起伏的浪，瓦当的圆弧头一节节露出来，
 * 浪与浪之间填卵石。图幅按 4 m 见方一块，铺地 mesh 直接按米给 uv 就能对上。
 */
export function wavePaving() {
  return memo('wave-paving', () => {
    const S = 1024, { c, x } = canvas(S, S);
    const lime = x.createLinearGradient(0, 0, S, S);
    lime.addColorStop(0, '#9c9689'); lime.addColorStop(0.5, '#8d8778'); lime.addColorStop(1, '#969082');
    x.fillStyle = lime; x.fillRect(0, 0, S, S);

    const rows = 9;
    const amp = S / rows / 3.2;
    for (let r = 0; r < rows; r++) {
      const baseY = (r + 0.5) * (S / rows);
      const phase = r * 1.1;
      // 一道浪：卵石垫底
      x.strokeStyle = 'rgba(58,56,52,0.5)';
      x.lineWidth = amp * 1.5;
      x.beginPath();
      for (let i = 0; i <= 128; i++) {
        const t = i / 128;
        const px = t * S;
        const py = baseY + Math.sin(t * Math.PI * 4 + phase) * amp;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
      for (let i = 0; i < 190; i++) {
        const t = rnd();
        const px = t * S;
        const py = baseY + Math.sin(t * Math.PI * 4 + phase) * amp + (rnd() - 0.5) * amp * 1.25;
        const rr = 2.2 + rnd() * 3.4;
        const v = 128 + rnd() * 96;
        x.fillStyle = `rgba(${v},${v - 6},${v - 16},0.75)`;
        x.beginPath(); x.ellipse(px, py, rr, rr * 0.78, rnd() * 3, 0, 7); x.fill();
      }
      // 瓦棱：侧立的碎瓦，一排圆弧头
      for (let i = 0; i < 132; i++) {
        const t = (i + 0.5) / 132;
        const px = t * S;
        const py = baseY + Math.sin(t * Math.PI * 4 + phase) * amp;
        const slope = Math.cos(t * Math.PI * 4 + phase) * amp * Math.PI * 4 / S;
        x.save();
        x.translate(px, py);
        x.rotate(Math.atan(slope));
        const w = S / 132 * 0.86, hgt = amp * 0.62;
        const tile = 138 + rnd() * 70;
        x.fillStyle = `rgb(${tile - 26},${tile - 30},${tile - 34})`;
        x.beginPath();
        x.moveTo(-w / 2, hgt);
        x.lineTo(-w / 2, -hgt * 0.2);
        x.quadraticCurveTo(0, -hgt * 1.25, w / 2, -hgt * 0.2);
        x.lineTo(w / 2, hgt);
        x.closePath();
        x.fill();
        x.strokeStyle = 'rgba(30,30,32,0.5)'; x.lineWidth = 1.2; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.09)';
        x.fillRect(-w / 2, -hgt * 0.16, w, 1.6);
        x.restore();
      }
    }
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      x.fillRect(rnd() * S, rnd() * S, 1.8, 1.8);
    }
    return tex(c, { repeat: [1 / 4, 1 / 4] });
  });
}

/** 青砖墙：顺丁相间的砌缝，夜色下偏冷 */
export function brick(base = '#6b7280') {
  return memo(`brick-${base}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const rows = 16, bw = S / 4, bh = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let k = -1; k < 5; k++) {
        const v = 0.72 + rnd() * 0.5;
        x.fillStyle = `rgba(${Math.round(96 * v)},${Math.round(104 * v)},${Math.round(116 * v)},0.85)`;
        x.fillRect(k * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3);
      }
      x.fillStyle = 'rgba(20,24,32,0.55)';
      x.fillRect(0, r * bh, S, 1.8);
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = rnd() > 0.6 ? 'rgba(220,230,240,0.05)' : 'rgba(0,0,0,0.06)';
      x.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    return tex(c, { repeat: [0.22, 0.22] });
  });
}

/** 月形窗洞的棂条：放射的细棂，光从后面透出来 */
export function moonLattice(kind = 'full', frame = '#3a2318', light = '#ffd9a4') {
  return memo(`moonlat-${kind}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    const g = x.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S * 0.62);
    g.addColorStop(0, '#fff3d6'); g.addColorStop(0.6, light); g.addColorStop(1, '#d9782f');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.strokeStyle = frame; x.lineCap = 'round';
    x.lineWidth = 12;
    x.beginPath(); x.arc(S / 2, S / 2, S * 0.46, 0, 7); x.stroke();
    x.lineWidth = 4;
    if (kind === 'full') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        x.beginPath();
        x.moveTo(S / 2, S / 2);
        x.lineTo(S / 2 + Math.cos(a) * S * 0.45, S / 2 + Math.sin(a) * S * 0.45);
        x.stroke();
      }
      for (const r of [0.2, 0.33]) {
        x.beginPath(); x.arc(S / 2, S / 2, S * r, 0, 7); x.stroke();
      }
    } else {
      // 弦月：一组平行的横棂，被月牙剪出轮廓
      for (let j = 1; j < 9; j++) {
        const y = (j / 9) * S;
        x.beginPath(); x.moveTo(S * 0.06, y); x.lineTo(S * 0.94, y); x.stroke();
      }
      x.lineWidth = 8;
      x.beginPath(); x.arc(S * 0.34, S / 2, S * 0.4, 0, 7); x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 竹竿与竹叶用的竖纹 */
export function bambooSkin(base = '#5c7a4e') {
  return memo(`bamboo-${base}`, () => {
    const { c, x } = canvas(64, 256);
    x.fillStyle = base; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 5; i++) {
      x.fillStyle = 'rgba(20,32,18,0.55)';
      x.fillRect(0, i * 52 + 44, 64, 5);
    }
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = `rgba(255,255,255,${0.02 + rnd() * 0.05})`;
      x.lineWidth = 1;
      const xx = rnd() * 64;
      x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx + 2, 256); x.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 黄石：竖向的劈理面 */
export function huangshi(base = '#8b7c5e') {
  return memo('huangshi', () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      const xx = rnd() * S, w = 3 + rnd() * 16;
      const g = x.createLinearGradient(xx, 0, xx + w, 0);
      const v = rnd() > 0.5 ? 'rgba(255,240,210,0.16)' : 'rgba(40,30,14,0.24)';
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, v); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(xx, 0, w, S);
    }
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = 'rgba(30,24,12,0.4)'; x.lineWidth = 1 + rnd() * 3;
      x.beginPath();
      const y0 = rnd() * S;
      x.moveTo(0, y0);
      x.bezierCurveTo(S * 0.3, y0 + rnd() * 24 - 12, S * 0.7, y0 + rnd() * 24 - 12, S, y0);
      x.stroke();
    }
    return tex(c, { repeat: [0.5, 0.5] });
  });
}

/**
 * 匾额。竖匾从上往下读——根目录那套是按秦淮的横匾写的，竖排会把首字落到底下，
 * 这里只把竖排的顺序改对，横排照旧。
 */
export function plaque(text, { dir = 'h', bg = '#123057', fg = '#f2dcae', border = '#c9974f', note = '' } = {}) {
  return memo(`my-plaque-${dir}-${text}-${bg}`, () => {
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
      chars.forEach((ch, i) => x.fillText(ch, W / 2, H / 2 - (chars.length / 2 - i - 0.5) * size * 1.02));
    }
    if (note) {
      x.font = `400 24px ${font}`;
      x.fillStyle = 'rgba(242,220,174,0.6)';
      x.fillText(note, wide ? W - 52 : W / 2, wide ? H / 2 : H - 34);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

export { tex, canvas, rnd, memo };
