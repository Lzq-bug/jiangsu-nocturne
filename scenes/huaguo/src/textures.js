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

const rnd = (() => {
  let s = 174329;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

/* ------------------------------------------------------------------ shared */

/** radial falloff — moon halo, star points, lantern glows, firefly sprites */
export function softGlow(hue = '205,225,240', hard = 0.12) {
  return memo(`glow-${hue}-${hard}`, () => {
    const { c, x } = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(hard, `rgba(${hue},0.72)`);
    g.addColorStop(0.45, `rgba(${hue},0.22)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c);
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

/** vertical gradient for the light columns dragged down the water */
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
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 瓦 / 墙 / 石 */

/**
 * 黛瓦: 瓦垄 run along `v` (up the slope), courses stack along `u`. One tile of
 * the canvas covers `meters` metres in both directions, so the same sheet works
 * for a 4 m pavilion roof and a 90 m wall cap.
 */
export function tiles({ meters = 1.2, flute = 5, base = '#252f3c', cold = true } = {}) {
  return memo(`tiles-${meters}-${flute}-${base}-${cold}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, base);
    g.addColorStop(1, cold ? '#161e2a' : '#1b2230');
    x.fillStyle = g; x.fillRect(0, 0, S, S);

    const fw = S / flute;
    for (let i = 0; i < flute; i++) {
      const cx0 = i * fw;
      // each 垄 is a shallow trough: dark at the seams, sheen in the middle
      const sh = x.createLinearGradient(cx0, 0, cx0 + fw, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)');
      sh.addColorStop(0.42, 'rgba(255,255,255,0.10)');
      sh.addColorStop(0.62, 'rgba(255,255,255,0.05)');
      sh.addColorStop(1, 'rgba(0,0,0,0.5)');
      x.fillStyle = sh; x.fillRect(cx0, 0, fw, S);
      // the horizontal courses: one darker band per tile row
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const y = (r * S) / rows;
        x.fillStyle = 'rgba(0,0,0,0.34)';
        x.fillRect(cx0, y, fw, S / rows * 0.16);
        x.fillStyle = 'rgba(255,255,255,0.05)';
        x.fillRect(cx0, y + S / rows * 0.2, fw, S / rows * 0.1);
      }
    }
    // 苔与尘: damp speckle collecting where the troughs are
    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      x.fillStyle = v > 0.72 ? 'rgba(96,132,104,0.14)' : 'rgba(255,255,255,0.035)';
      x.fillRect(rnd() * S, rnd() * S, 1.6 + rnd() * 3, 1.4 + rnd() * 2.2);
    }
    return tex(c, { repeat: [1 / meters, 1 / meters] });
  });
}

/** 粉墙: limewashed plaster, mottled, with a faint wash of rain streaks */
export function plaster({ meters = 3, base = '#c9d2d2' } = {}) {
  return memo(`plaster-${meters}-${base}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,74,80,0.05)';
      x.beginPath();
      x.arc(rnd() * S, rnd() * S, 1 + rnd() * 7, 0, 7);
      x.fill();
    }
    for (let i = 0; i < 90; i++) {
      const px = rnd() * S;
      x.strokeStyle = 'rgba(70,86,92,0.055)';
      x.lineWidth = 0.8 + rnd() * 1.8;
      x.beginPath(); x.moveTo(px, rnd() * S * 0.4); x.lineTo(px + (rnd() - 0.5) * 8, S); x.stroke();
    }
    // damp at the foot of the wall
    const g = x.createLinearGradient(0, S * 0.72, 0, S);
    g.addColorStop(0, 'rgba(58,76,70,0)');
    g.addColorStop(1, 'rgba(58,76,70,0.22)');
    x.fillStyle = g; x.fillRect(0, S * 0.72, S, S * 0.28);
    return tex(c, { repeat: [1 / meters, 1 / meters] });
  });
}

/**
 * 黄石: the yellow-brown bedded stone the Song hill is stacked from. Horizontal
 * bedding planes plus pitting and a hair of cracks — the read is stratification,
 * not the porous 湖石 of the later gardens.
 */
export function huangshi({ meters = 2.6 } = {}) {
  return memo(`huangshi-${meters}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#7d6a52');
    g.addColorStop(0.5, '#6a5a45');
    g.addColorStop(1, '#574937');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // bedding: bands of uneven thickness, each with its own shadow line
    let y = 0;
    while (y < S) {
      const h = 14 + rnd() * 46;
      x.fillStyle = `rgba(255,244,220,${0.03 + rnd() * 0.06})`;
      x.fillRect(0, y, S, h);
      x.fillStyle = 'rgba(26,20,14,0.5)';
      x.fillRect(0, y + h - 3, S, 3 + rnd() * 2.5);
      // a vertical split somewhere in the bed
      if (rnd() > 0.45) {
        const sx = rnd() * S;
        x.strokeStyle = 'rgba(22,18,12,0.42)';
        x.lineWidth = 1 + rnd() * 2;
        x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + (rnd() - 0.5) * 14, y + h); x.stroke();
      }
      y += h;
    }
    for (let i = 0; i < 5200; i++) {
      const v = rnd();
      x.fillStyle = v > 0.55 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.05)';
      x.fillRect(rnd() * S, rnd() * S, 1.4 + rnd() * 2.6, 1.2 + rnd() * 2);
    }
    // moss in the horizontal seams only — the damp sits on the shelf
    for (let i = 0; i < 700; i++) {
      x.fillStyle = 'rgba(96,138,92,0.16)';
      x.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 12, 1.6 + rnd() * 3);
    }
    return tex(c, { repeat: [1 / meters, 1 / meters] });
  });
}

/** 树冠: soft mottled green, darker in the gaps — reads as mass, not as leaves */
export function canopy() {
  return memo('canopy', () => {
    const S = 128, { c, x } = canvas(S, S);
    x.fillStyle = '#1e2c1b'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const r = 2 + rnd() * 9;
      x.fillStyle = rnd() > 0.55 ? 'rgba(88,116,74,0.16)' : 'rgba(8,14,10,0.22)';
      x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 7); x.fill();
    }
    return tex(c, { repeat: [0.5, 0.5] });
  });
}

/** 民居立面: dark plaster-and-tile blocks with a sparse lit window grid */
export function cityFacade({ cols = 6, rows = 4, density = 0.24 } = {}) {
  return memo(`cityfacade-${cols}-${rows}-${density}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#10161d');
    g.addColorStop(1, '#1a222b');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const cw = S / cols, ch = S / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.fillRect(i * cw + cw * 0.18, j * ch + ch * 0.2, cw * 0.64, ch * 0.56);
        if (rnd() > density) continue;
        const warm = 0.5 + rnd() * 0.5;
        x.fillStyle = `rgb(${Math.round(255 * warm)},${Math.round(200 * warm)},${Math.round(132 * warm)})`;
        x.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.24, cw * 0.56, ch * 0.48);
      }
    }
    return tex(c);
  });
}

/** 花街铺地: small brick and pebble paving of a garden courtyard */
export function paving({ meters = 2.4, base = '#4a5560' } = {}) {
  return memo(`pave-${meters}-${base}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const n = 4, cell = S / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.14)';
        x.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
        // 斜铺碎石 inside each panel
        x.strokeStyle = 'rgba(210,220,225,0.09)';
        x.lineWidth = 1.4;
        x.beginPath();
        x.moveTo(i * cell + 4, j * cell + cell - 4);
        x.lineTo(i * cell + cell - 4, j * cell + 4);
        x.stroke();
      }
    }
    x.strokeStyle = 'rgba(12,16,22,0.5)';
    x.lineWidth = 3;
    for (let k = 0; k <= n; k++) {
      x.beginPath(); x.moveTo(k * cell, 0); x.lineTo(k * cell, S); x.stroke();
      x.beginPath(); x.moveTo(0, k * cell); x.lineTo(S, k * cell); x.stroke();
    }
    for (let i = 0; i < 1800; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
      x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return tex(c, { repeat: [1 / meters, 1 / meters] });
  });
}

/* ------------------------------------------------------------------ 漏窗 */

/**
 * One canvas per 式样. Bars are painted opaque so the sheet can be an alphaMap:
 * the pattern stays timber, the holes open onto the lamp behind it.
 */
const LATTICE_KINDS = 8;

function latticeDraw(kind, S) {
  const { c, x } = canvas(S, S);
  x.clearRect(0, 0, S, S);
  x.strokeStyle = '#ffffff';
  x.fillStyle = '#ffffff';
  x.lineCap = 'square';
  const bar = S * 0.045;
  x.lineWidth = bar;
  const pad = S * 0.07;
  const W = S - pad * 2;
  // frame on every kind
  x.strokeRect(pad, pad, W, W);
  const grid = (n) => {
    for (let i = 1; i < n; i++) {
      const p = pad + (W * i) / n;
      x.beginPath(); x.moveTo(p, pad); x.lineTo(p, S - pad); x.stroke();
      x.beginPath(); x.moveTo(pad, p); x.lineTo(S - pad, p); x.stroke();
    }
  };
  if (kind === 0) grid(3);                                     // 方眼
  if (kind === 1) grid(4);                                     // 豆腐筋
  if (kind === 2) {                                            // 冰裂
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, L = S * (0.12 + rnd() * 0.2);
      const px = pad + rnd() * W, py = pad + rnd() * W;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
    }
  }
  if (kind === 3) {                                            // 十字套方
    grid(2);
    x.strokeRect(pad + W * 0.25, pad + W * 0.25, W * 0.5, W * 0.5);
  }
  if (kind === 4) {                                            // 亚字
    x.beginPath();
    x.moveTo(pad, pad); x.lineTo(S - pad, pad);
    x.moveTo(pad, pad); x.lineTo(pad, S - pad);
    x.moveTo(S - pad, pad); x.lineTo(S - pad, S - pad);
    x.moveTo(pad, S - pad); x.lineTo(S - pad, S - pad);
    x.moveTo(pad + W * 0.5, pad); x.lineTo(pad + W * 0.5, S - pad);
    x.moveTo(pad, pad + W * 0.3); x.lineTo(S - pad, pad + W * 0.3);
    x.moveTo(pad + W * 0.2, pad + W * 0.72); x.lineTo(S - pad, pad + W * 0.72);
    x.stroke();
  }
  if (kind === 5) {                                            // 海棠
    const r = W * 0.3;
    x.lineWidth = bar * 1.15;
    x.beginPath(); x.arc(S / 2, S / 2, r, 0, 7); x.stroke();
    x.lineWidth = bar * 0.8;
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      x.beginPath();
      x.moveTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
      x.lineTo(S / 2 + Math.cos(a) * (W / 2), S / 2 + Math.sin(a) * (W / 2));
      x.stroke();
    }
  }
  if (kind === 6) {                                            // 瓶形 (净瓶)
    x.lineWidth = bar * 1.1;
    x.beginPath();
    x.moveTo(S * 0.36, S * 0.86); x.lineTo(S * 0.42, S * 0.58);
    x.lineTo(S * 0.34, S * 0.34); x.lineTo(S * 0.34, S * 0.18);
    x.lineTo(S * 0.66, S * 0.18); x.lineTo(S * 0.66, S * 0.34);
    x.lineTo(S * 0.58, S * 0.58); x.lineTo(S * 0.64, S * 0.86);
    x.closePath(); x.stroke();
  }
  if (kind === 7) {                                            // 万字纹
    const u = W / 6;
    x.lineWidth = bar * 0.9;
    for (const off of [0, 3]) {
      x.beginPath();
      x.moveTo(pad + off * u, pad + 3 * u);
      x.lineTo(pad + off * u + 3 * u, pad + 3 * u);
      x.lineTo(pad + off * u + 3 * u, pad);
      x.moveTo(pad + off * u + 1.5 * u, pad + 3 * u);
      x.lineTo(pad + off * u + 1.5 * u, pad + 4.5 * u);
      x.lineTo(pad + off * u + 4.5 * u, pad + 4.5 * u);
      x.stroke();
    }
  }
  return c;
}

export function lattice(kind = 0) {
  const k = ((kind % LATTICE_KINDS) + LATTICE_KINDS) % LATTICE_KINDS;
  return memo(`lattice-${k}`, () => tex(latticeDraw(k, 256), { srgb: false }));
}

export const LATTICE_COUNT = LATTICE_KINDS;

/* ------------------------------------------------------------------ 竹 / 荷 */

/** a fan of bamboo blades on a transparent card */
export function bambooLeaf() {
  return memo('bamboo-leaf', () => {
    const S = 128, { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 6; i++) {
      const a = -0.5 + (i / 5) * 1.0 + (rnd() - 0.5) * 0.18;
      const len = S * (0.34 + rnd() * 0.13);
      const w = S * (0.032 + rnd() * 0.026);
      x.save();
      x.translate(S / 2, S / 2);
      x.rotate(a);
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(len * 0.45, -w, len, -w * 0.15);
      x.quadraticCurveTo(len * 0.5, w, 0, 0);
      x.fill();
      x.restore();
    }
    return tex(c);
  });
}

/** 残荷: a few rounds and torn discs for the inner pool in autumn dark */
export function lotusLeaf() {
  return memo('lotus', () => {
    const S = 128, { c, x } = canvas(S, S);
    x.clearRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.beginPath(); x.arc(S / 2, S / 2, S * 0.44, 0, 7); x.fill();
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) {
      const a = rnd() * 7;
      x.beginPath();
      x.moveTo(S / 2, S / 2);
      x.arc(S / 2, S / 2, S * 0.5, a, a + 0.22);
      x.closePath(); x.fill();
    }
    x.beginPath(); x.arc(S * 0.68, S * 0.3, S * 0.1, 0, 7); x.fill();
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 碑刻 */

/**
 * 五百名贤: three courses of carved niches, each with a seated silhouette and a
 * column of 题赞. Read at night it is texture, not calligraphy, so the strokes
 * are suggested rather than legible.
 */
export function steleWall({ cols = 6, rows = 3, meters = 4.2 } = {}) {
  return memo(`stele-${cols}-${rows}`, () => {
    const S = 1024, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#8c8f86');
    g.addColorStop(1, '#6f7268');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const cw = S / cols, ch = S / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = i * cw + cw * 0.08, py = j * ch + ch * 0.1;
        const w = cw * 0.84, h = ch * 0.8;
        // the sunk panel, arched at the head
        x.fillStyle = 'rgba(28,32,34,0.34)';
        x.beginPath();
        x.moveTo(px, py + h);
        x.lineTo(px, py + h * 0.22);
        x.quadraticCurveTo(px + w / 2, py - h * 0.06, px + w, py + h * 0.22);
        x.lineTo(px + w, py + h);
        x.closePath(); x.fill();
        x.strokeStyle = 'rgba(238,242,236,0.16)';
        x.lineWidth = 3;
        x.stroke();
        // the figure: head, shoulders, a fold of robe
        x.fillStyle = 'rgba(30,34,36,0.5)';
        const fx = px + w * 0.36, fy = py + h * 0.34;
        x.beginPath(); x.arc(fx, fy, w * 0.1, 0, 7); x.fill();
        x.beginPath();
        x.moveTo(fx - w * 0.19, py + h * 0.86);
        x.quadraticCurveTo(fx - w * 0.16, fy + h * 0.16, fx, fy + h * 0.12);
        x.quadraticCurveTo(fx + w * 0.16, fy + h * 0.16, fx + w * 0.19, py + h * 0.86);
        x.closePath(); x.fill();
        // 题赞: three short columns of strokes
        x.strokeStyle = 'rgba(22,26,28,0.42)';
        x.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const tx = px + w * (0.66 + k * 0.1);
          let ty = py + h * 0.3;
          const n = 4 + ((rnd() * 3) | 0);
          for (let m = 0; m < n; m++) {
            const wq = w * 0.055;
            x.beginPath();
            x.moveTo(tx - wq / 2, ty); x.lineTo(tx + wq / 2, ty + wq * 0.7);
            x.moveTo(tx - wq / 2, ty + wq * 0.5); x.lineTo(tx + wq / 2, ty + wq * 0.2);
            x.stroke();
            ty += wq * 1.5;
          }
        }
      }
    }
    for (let i = 0; i < 6000; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return tex(c, { repeat: [1 / meters, 1 / meters] });
  });
}

/* ------------------------------------------------------------------ 匾额 / 联语 */

const INK_FONT = '"KaiTi", "STKaiti", "Kaiti SC", "Songti SC", "SimSun", serif';

/**
 * Calligraphy on a board: `text` runs top to bottom in `vertical` columns, right
 * to left as a scroll does. Returns an sRGB canvas texture sized to the board.
 */
export function calligraphy(text, {
  vertical = true, cols = 1, w = 256, h = 1024,
  board = null, ink = '#efe6d2', size = 0.82,
} = {}) {
  const key = `cal-${text}-${vertical}-${cols}-${w}-${h}-${board}-${ink}-${size}`;
  return memo(key, () => {
    const { c, x } = canvas(w, h);
    if (board) {
      const g = vertical ? x.createLinearGradient(0, 0, w, 0) : x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, board);
      g.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, board);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    } else {
      x.clearRect(0, 0, w, h);
    }
    const chars = [...text].filter((s) => s !== ' ');
    // a scroll reads top to bottom, right to left; a 匾 reads left to right
    const per = vertical ? Math.ceil(chars.length / cols) : chars.length;
    const cellW = vertical ? w / cols : w / per;
    const cellH = vertical ? h / per : h;
    x.font = `${Math.round(size * Math.min(cellW, cellH))}px ${INK_FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = ink;
    chars.forEach((ch, i) => {
      if (vertical) {
        const col = Math.floor(i / per), row = i % per;
        x.fillText(ch, w - (col + 0.5) * cellW, (row + 0.5) * cellH);
      } else {
        x.fillText(ch, (i + 0.5) * cellW, h / 2);
      }
    });
    return tex(c, { repeat: [1, 1] });
  });
}

/* ------------------------------------------------------------------ 山与海 */

/**
 * 崖面: 片麻岩的竖向节理加海蚀的浅坑。西壁是一整面上去的，纹理必须能撑住
 * 六百米：`meters` 是画布横向覆盖的米数，纵向再拉长一点，免得像贴了张壁纸。
 */
export function rockFace({ meters = 26, streak = 1 } = {}) {
  return memo(`rock-${meters}-${streak}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#596068');
    g.addColorStop(0.5, '#6b6f72');
    g.addColorStop(1, '#4a5057');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // 明暗相间的麻粒条带
    for (let i = 0; i < 130; i++) {
      const y = rnd() * S, w = 20 + rnd() * 180, h = 2 + rnd() * 5;
      x.fillStyle = rnd() > 0.5 ? 'rgba(206,206,200,0.07)' : 'rgba(18,22,28,0.10)';
      x.fillRect(rnd() * S - w / 2, y, w, h);
    }
    // 竖向节理：水顺着缝走，缝就是山的笔直
    for (let i = 0; i < 46 * streak; i++) {
      const px = rnd() * S;
      const w = 1 + rnd() * 3.4;
      x.strokeStyle = `rgba(10,14,18,${0.16 + rnd() * 0.3})`;
      x.lineWidth = w;
      x.beginPath();
      let y = -10;
      x.moveTo(px, y);
      while (y < S + 10) {
        y += 22 + rnd() * 44;
        x.lineTo(px + (rnd() - 0.5) * 12, y);
      }
      x.stroke();
    }
    // 海蚀的浅坑与石檐
    for (let i = 0; i < 260; i++) {
      const px = rnd() * S, py = rnd() * S, r = 2 + rnd() * 12;
      const ng = x.createRadialGradient(px, py, 0, px, py, r);
      ng.addColorStop(0, 'rgba(9,12,16,0.34)');
      ng.addColorStop(0.7, 'rgba(9,12,16,0.05)');
      ng.addColorStop(1, 'rgba(9,12,16,0)');
      x.fillStyle = ng;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      x.fillStyle = 'rgba(214,214,206,0.05)';
      x.beginPath(); x.arc(px - r * 0.2, py - r * 0.3, r * 0.55, 0, 7); x.fill();
    }
    // 苔痕：坡面朝北的那一类灰绿
    for (let i = 0; i < 90; i++) {
      const px = rnd() * S, py = rnd() * S, r = 6 + rnd() * 26;
      x.fillStyle = `rgba(${52 + rnd() * 22 | 0},${70 + rnd() * 26 | 0},${48 + rnd() * 18 | 0},${0.05 + rnd() * 0.1})`;
      x.beginPath(); x.ellipse(px, py, r, r * (0.3 + rnd() * 0.4), rnd() * 3.14, 0, 7); x.fill();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 巨石：整块崩落的石头，圆棱、少纹，比崖面亮一档 */
export function granite({ meters = 9 } = {}) {
  return memo(`granite-${meters}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, '#7c7f80');
    g.addColorStop(0.55, '#8d8f8c');
    g.addColorStop(1, '#5f6469');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(226,226,218,0.05)' : 'rgba(12,16,20,0.08)';
      x.beginPath();
      x.ellipse(rnd() * S, rnd() * S, 4 + rnd() * 26, 2 + rnd() * 9, rnd() * 3.14, 0, 7);
      x.fill();
    }
    for (let i = 0; i < 22; i++) {
      x.strokeStyle = `rgba(14,18,22,${0.2 + rnd() * 0.28})`;
      x.lineWidth = 1 + rnd() * 2.4;
      x.beginPath();
      const px = rnd() * S, py = rnd() * S;
      x.moveTo(px, py);
      x.lineTo(px + (rnd() - 0.5) * 150, py + (rnd() - 0.5) * 150);
      x.stroke();
    }
    return tex(c);
  });
}

/** 潮滩：淤出来的泥，退潮后剩一层浅浅的水纹 */
export function mudflat({ meters = 30 } = {}) {
  return memo(`mud-${meters}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#4b4f4a');
    g.addColorStop(1, '#3f4643');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 170; i++) {
      const y = rnd() * S;
      x.strokeStyle = `rgba(${rnd() > 0.5 ? '186,182,168' : '24,30,32'},${0.04 + rnd() * 0.07})`;
      x.lineWidth = 1 + rnd() * 4;
      x.beginPath();
      for (let px = -10; px <= S + 10; px += 26) x.lineTo(px, y + Math.sin(px * 0.06 + i) * (3 + rnd() * 7));
      x.stroke();
    }
    for (let i = 0; i < 300; i++) {
      x.fillStyle = `rgba(210,214,206,${0.02 + rnd() * 0.05})`;
      x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 2 + rnd() * 16, 1 + rnd() * 4, 0, 0, 7); x.fill();
    }
    return tex(c);
  });
}

/** 坡面上的草与灌：夜里就是一层带斑点的墨绿 */
export function hillside({ meters = 18 } = {}) {
  return memo(`hill-${meters}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    x.fillStyle = '#2c3a2c'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const px = rnd() * S, py = rnd() * S, r = 1 + rnd() * 6;
      x.fillStyle = `rgba(${28 + rnd() * 40 | 0},${46 + rnd() * 52 | 0},${26 + rnd() * 26 | 0},${0.16 + rnd() * 0.3})`;
      x.beginPath(); x.ellipse(px, py, r, r * (0.4 + rnd() * 0.8), rnd() * 3.14, 0, 7); x.fill();
    }
    for (let i = 0; i < 120; i++) {
      x.fillStyle = `rgba(${72 + rnd() * 40 | 0},${84 + rnd() * 36 | 0},${62 + rnd() * 30 | 0},0.12)`;
      x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 6 + rnd() * 22, 3 + rnd() * 9, rnd() * 3.14, 0, 7); x.fill();
    }
    return tex(c);
  });
}

/** 塔砖：一层一层错缝砌，檐口那几层加一道线 */
export function brick({ meters = 2.6, courses = 22 } = {}) {
  return memo(`brick-${meters}-${courses}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    x.fillStyle = '#5b5852'; x.fillRect(0, 0, S, S);
    const ch = S / courses;
    for (let r = 0; r < courses; r++) {
      const y = r * ch;
      const bw = S / (4 + (r % 2));
      for (let k = -1; k < 8; k++) {
        const px = k * bw + (r % 2 ? bw / 2 : 0);
        const v = 0.72 + rnd() * 0.5;
        x.fillStyle = `rgba(${v * 96 | 0},${v * 88 | 0},${v * 78 | 0},0.9)`;
        x.fillRect(px + 1.2, y + 1.2, bw - 2.6, ch - 2.6);
      }
      x.fillStyle = 'rgba(14,16,18,0.5)';
      x.fillRect(0, y, S, 1.6);
    }
    // 檐口那道混线：塔身逐层收分，画布上把它留在上沿
    x.fillStyle = 'rgba(228,216,190,0.1)';
    x.fillRect(0, 0, S, ch * 0.5);
    return tex(c);
  });
}

/** 石级：一条一条横在坡面上的台阶，登山一径的骨 */
export function steps({ count = 14, meters = 1 } = {}) {
  return memo(`steps-${count}-${meters}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    x.fillStyle = '#4e555c'; x.fillRect(0, 0, S, S);
    const h = S / count;
    for (let i = 0; i < count; i++) {
      const y = i * h;
      x.fillStyle = `rgba(${96 + rnd() * 26 | 0},${102 + rnd() * 22 | 0},${104 + rnd() * 20 | 0},0.95)`;
      x.fillRect(0, y + 1, S, h * 0.66);
      x.fillStyle = 'rgba(8,10,14,0.72)';
      x.fillRect(0, y + h * 0.66, S, h * 0.34);
      for (let k = 0; k < 5; k++) {
        x.fillStyle = 'rgba(20,26,24,0.16)';
        x.fillRect(rnd() * S, y + 2, 3 + rnd() * 30, h * 0.6);
      }
    }
    return tex(c);
  });
}

