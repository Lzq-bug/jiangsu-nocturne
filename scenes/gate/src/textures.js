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

/** radial falloff — moon halo, star points, lamp glows, fountain spray sprites */
export function softGlow(hue = '200,225,255', hard = 0.12) {
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

/** soft horizontal band used for the glowing edge of a roof or deck */
export function edgeGlow() {
  return memo('edge', () => {
    const { c, x } = canvas(64, 16);
    const g = x.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 16);
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 幕墙 */

const rnd = (() => {
  let s = 86293;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const WARM = ['255,236,198', '255,214,158', '255,246,224'];
const COOL = ['196,224,255', '168,206,255', '224,240,255'];

/** "r,g,b" scaled into an opaque css colour — keeps the emissive canvas alpha-clean */
const scaleRgb = (hue, k) => {
  const [r, g, b] = hue.split(',').map((n) => Math.round(Number(n) * Math.min(1, k)));
  return `rgb(${r},${g},${b})`;
};

/**
 * One canvas covers the whole gate front (300 m x 302 m), so no tiling and no
 * visible repetition across the two towers. `floorH` is metres per storey.
 */
export function facadeMaps({ metersX = 300, metersY = 302, floorH = 4, bay = 1.5, size = 2048 } = {}) {
  const key = `facade-${metersX}-${metersY}-${floorH}-${bay}`;
  return memo(key, () => {
    const { c: ca, x: a } = canvas(size, size);
    const { c: ce, x: e } = canvas(size, size);
    const px = size / metersX, py = size / metersY;

    const base = a.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, '#0a1626');
    base.addColorStop(0.55, '#0d1c30');
    base.addColorStop(1, '#12283f');
    a.fillStyle = base; a.fillRect(0, 0, size, size);
    // the emissive sheet stays transparent where there is no light, so the water
    // mirror can alpha-blend it instead of adding a stack of dark rectangles

    const floors = Math.round(metersY / floorH);
    const bays = Math.round(metersX / bay);
    const cw = size / bays, ch = size / floors;

    for (let f = 0; f < floors; f++) {
      // canvas y grows downward while building height grows upward
      const rowY = size - (f + 1) * ch;
      const mech = f % 13 === 6 || f === 0;
      for (let i = 0; i < bays; i++) {
        const cx = i * cw;
        const v = rnd();
        a.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)';
        a.fillRect(cx + 0.5, rowY + ch * 0.18, cw - 1, ch * 0.62);
        if (mech) continue;
        // spandrel band every storey keeps the grid legible from far away
        a.fillStyle = 'rgba(4,8,14,0.72)';
        a.fillRect(cx, rowY, cw, ch * 0.17);
        a.fillStyle = 'rgba(6,10,18,0.55)';
        a.fillRect(cx, rowY + ch * 0.8, cw, ch * 0.2);
        if (rnd() > 0.42) {
          const hue = rnd() > 0.28 ? WARM[(rnd() * WARM.length) | 0] : COOL[(rnd() * COOL.length) | 0];
          const k = 0.35 + rnd() * 0.65;
          const lum = f > floors - 6 ? k * 0.5 : k;
          // full-alpha pixels with the brightness baked into rgb: an alpha-canvas
          // uploaded premultiplied would darken every window
          e.fillStyle = scaleRgb(hue, lum);
          e.fillRect(cx + cw * 0.14, rowY + ch * 0.22, cw * 0.72, ch * 0.54);
        }
      }
      // a few whole floors lit as one band — lobby, skybridge, plant rooms
      if (!mech && rnd() > 0.9) {
        e.fillStyle = scaleRgb('220,240,255', 0.5);
        e.fillRect(0, rowY + ch * 0.2, size, ch * 0.6);
      }
    }
    return {
      albedo: tex(ca, { repeat: [1 / metersX, 1 / metersY] }),
      emissive: tex(ce, { repeat: [1 / metersX, 1 / metersY] }),
    };
  });
}

/** generic lit-window tile for the surrounding CBD towers */
export function cityWindows({ warm = 0.72, density = 0.42 } = {}) {
  return memo(`citywin-${warm.toFixed(2)}-${density.toFixed(2)}`, () => {
    const S = 128, { c, x } = canvas(S, S);
    const cols = 8, rows = 8, cw = S / cols, chh = S / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (rnd() > density) continue;
        const hue = rnd() < warm ? WARM[(rnd() * WARM.length) | 0] : COOL[(rnd() * COOL.length) | 0];
        x.fillStyle = scaleRgb(hue, 0.4 + rnd() * 0.6);
        x.fillRect(i * cw + cw * 0.2, j * chh + chh * 0.25, cw * 0.6, chh * 0.5);
      }
    }
    return tex(c);
  });
}

/** paving for the lakeside plaza */
export function paving(base = '#222a38') {
  return memo(`pave-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
      x.fillRect(rnd() * 256, rnd() * 256, 1.7, 1.7);
    }
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1.6;
    for (let k = 0; k <= 4; k++) {
      x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke();
      x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke();
    }
    return tex(c, { repeat: [0.055, 0.055] });
  });
}
