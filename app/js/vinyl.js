// Record skins, record rendering and the turntable stage (half record + tonearm).

export const SKINS = [
  { id: 'noir', name: 'Классика', premium: false, type: 'solid', base: '#141211', label: '#EFE6D6', ink: '#2b211b' },
  { id: 'copper', name: 'Медь', premium: true, type: 'solid', base: '#5a2f17', glow: '#8a4a22', label: '#E7D5BE', ink: '#3b1d0d', translucent: true },
  { id: 'ruby', name: 'Рубин', premium: true, type: 'marble', base: '#9b1420', blob: '#3a0508', label: '#B8323A', ink: '#f6dfe0', translucent: true },
  { id: 'cobalt', name: 'Кобальт', premium: true, type: 'marble', base: '#1c2f9a', blob: '#0d1866', label: '#4f6fb8', ink: '#e8eefc', translucent: true, soft: true },
  { id: 'forest', name: 'Лес', premium: true, type: 'marble', base: '#1f6a45', blob: '#05200f', label: '#5b8b77', ink: '#eef6f1', translucent: true },
  { id: 'sorbet', name: 'Сорбет', premium: true, type: 'split', base: '#efe5d2', base2: '#e2668a', label: '#f0c3c3', ink: '#5a2734' },
  { id: 'splatter', name: 'Брызги', premium: true, type: 'splatter', base: '#121212', dots: ['#f093b0', '#58a8d6', '#f2d36b', '#f4a6a6'], label: '#2b2b2b', ink: '#d9d2c4' },
  { id: 'sunglow', name: 'Санглоу', premium: true, type: 'solid', base: '#e9b21f', glow: '#FDC934', label: '#1D79AA', ink: '#fdf4dc', translucent: true },
  { id: 'contessa', name: 'Контесса', premium: true, type: 'solid', base: '#c45a64', glow: '#D26A73', label: '#F4A6A6', ink: '#78371B', translucent: true },
  { id: 'olive', name: 'Олива', premium: true, type: 'marble', base: '#877B17', blob: '#4d460b', label: '#B7B23D', ink: '#2e2a06', translucent: true, soft: true },
  { id: 'cinnamon', name: 'Корица', premium: true, type: 'split', base: '#CC6618', base2: '#7B3511', label: '#6E7882', ink: '#f3ece4' },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Draw a full record into a square canvas. */
export function drawRecord(canvas, skin, { title = '', artist = '' } = {}) {
  const S = canvas.width, ctx = canvas.getContext('2d'), R = S / 2, k = S / 1000;
  const rand = rng(hashStr(skin.id));
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(R, R);
  ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.clip();

  // --- base vinyl ---
  if (skin.type === 'split') {
    ctx.fillStyle = skin.base; ctx.fillRect(-R, -R, S, S);
    ctx.save(); ctx.filter = `blur(${14 * k}px)`; ctx.fillStyle = skin.base2;
    ctx.beginPath(); ctx.moveTo(-40 * k, -R - 50); ctx.bezierCurveTo(30 * k, -R * 0.3, -30 * k, R * 0.3, 20 * k, R + 50); ctx.lineTo(R + 50, R + 50); ctx.lineTo(R + 50, -R - 50); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    g.addColorStop(0, skin.glow || skin.base); g.addColorStop(1, skin.base);
    ctx.fillStyle = g; ctx.fillRect(-R, -R, S, S);
  }
  if (skin.type === 'marble') {
    ctx.save(); ctx.filter = `blur(${(skin.soft ? 26 : 16) * k}px)`;
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, r = R * (0.35 + rand() * 0.65);
      ctx.globalAlpha = 0.18 + rand() * 0.35; ctx.fillStyle = skin.blob;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, (20 + rand() * 70) * k, (8 + rand() * 30) * k, a + Math.PI / 2 + (rand() - 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (skin.type === 'splatter') {
    for (let i = 0; i < 150; i++) {
      const a = rand() * Math.PI * 2, r0 = R * (0.42 + rand() * 0.45), len = (20 + rand() * 90) * k, w = (2 + rand() * 7) * k;
      ctx.fillStyle = skin.dots[Math.floor(rand() * skin.dots.length)];
      ctx.globalAlpha = 0.65 + rand() * 0.35;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(r0, 0); ctx.quadraticCurveTo(r0 + len * 0.6, -w, r0 + len, 0); ctx.quadraticCurveTo(r0 + len * 0.6, w, r0, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(r0 + len, 0, w * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // --- grooves ---
  const labelR = R * 0.33, inner = R * 0.42, outer = R * 0.965;
  const gapsAt = [0.52, 0.61, 0.70, 0.79, 0.88].map((f) => R * f);
  ctx.lineWidth = Math.max(0.6, 1.1 * k);
  for (let r = inner; r < outer; r += 2.2 * k) {
    const dark = rand() < 0.5;
    ctx.strokeStyle = dark ? `rgba(0,0,0,${0.08 + rand() * 0.12})` : `rgba(255,255,255,${0.02 + rand() * (skin.translucent ? 0.06 : 0.04)})`;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
  for (const r of gapsAt) {
    ctx.lineWidth = 4 * k; ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2 * k; ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(0, 0, r + 2.6 * k, 0, Math.PI * 2); ctx.stroke();
  }
  // run-out (smooth, glossy) area
  const ro = ctx.createRadialGradient(0, 0, labelR, 0, 0, inner);
  ro.addColorStop(0, 'rgba(0,0,0,0.35)'); ro.addColorStop(0.6, 'rgba(0,0,0,0.12)'); ro.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = ro; ctx.beginPath(); ctx.arc(0, 0, inner, 0, Math.PI * 2); ctx.fill();
  // rim
  ctx.lineWidth = 5 * k; ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.arc(0, 0, R - 4 * k, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(0, 0, R - 9 * k, 0, Math.PI * 2); ctx.stroke();

  // --- label ---
  ctx.fillStyle = skin.label;
  ctx.beginPath(); ctx.arc(0, 0, labelR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1.5 * k;
  ctx.beginPath(); ctx.arc(0, 0, labelR * 0.93, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, labelR * 0.2, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${34 * k}px "Archivo", "Arial Black", sans-serif`;
  ctx.fillText('VINIL', 0, -labelR * 0.62);
  ctx.font = `500 ${15 * k}px "Space Mono", monospace`;
  ctx.globalAlpha = 0.75;
  ctx.fillText('33⅓ RPM · SIDE A', 0, -labelR * 0.4);
  ctx.globalAlpha = 1;
  if (title) {
    ctx.font = `700 ${26 * k}px "Archivo", sans-serif`;
    wrapText(ctx, title, 0, labelR * 0.38, labelR * 1.45, 28 * k, 2);
    ctx.font = `400 ${17 * k}px "Space Mono", monospace`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(truncate(ctx, artist || '', labelR * 1.3), 0, labelR * 0.7);
    ctx.globalAlpha = 1;
  }
  // spindle hole
  ctx.fillStyle = '#d9d4cc';
  ctx.beginPath(); ctx.arc(0, 0, 9 * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(0, 0, 6 * k, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function truncate(ctx, s, max) {
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}
function wrapText(ctx, text, x, y, max, lh, lines) {
  const words = text.split(/\s+/); const out = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  const shown = out.slice(0, lines);
  if (out.length > lines) shown[lines - 1] = truncate(ctx, shown[lines - 1] + '…', max);
  const y0 = y - ((shown.length - 1) * lh) / 2;
  shown.forEach((l, i) => ctx.fillText(truncate(ctx, l, max), x, y0 + i * lh));
}

// ---------------------------------------------------------------------------

const DEG_PER_SEC = (100 / 3) * 6; // 33⅓ rpm → 200°/s

export class Turntable {
  constructor(stage) {
    this.stage = stage;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'record';
    this.sheen = document.createElement('div');
    this.sheen.className = 'sheen';
    this.mat = document.createElement('div');
    this.mat.className = 'platter';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('arm');
    stage.append(this.mat, this.canvas, this.sheen, this.svg);

    this.skin = SKINS[0];
    this.meta = {};
    this.angle = 0; this.omega = 0; this.motor = 'off';
    this.armAngle = null; this.armTarget = 0; this.armMode = 'rest'; this.progress = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
    this._last = performance.now();
    const loop = (t) => { this._tick(Math.min(0.05, (t - this._last) / 1000)); this._last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setSkin(skin) { this.skin = skin; this._redraw(); }
  setMeta(meta) { this.meta = meta || {}; this._redraw(); }
  setMotor(m) { this.motor = m === true ? 'on' : m === false ? 'off' : m; }
  setArm(mode) { this.armMode = mode; }
  setProgress(p) { this.progress = Math.max(0, Math.min(1, p || 0)); }
  get spinning() { return this.omega > 1; }

  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    const R = Math.min((h / 2) * 0.94, w / 1.3);
    this.R = R; this.cy = h / 2; this.w = w; this.h = h;
    const size = 2 * R;
    for (const el of [this.canvas, this.sheen]) {
      Object.assign(el.style, { width: size + 'px', height: size + 'px', left: -R + 'px', top: this.cy - R + 'px' });
    }
    const m = R * 1.035;
    Object.assign(this.mat.style, { width: 2 * m + 'px', height: 2 * m + 'px', left: -m + 'px', top: this.cy - m + 'px' });
    const px = Math.min(2048, Math.round(size * Math.min(2, devicePixelRatio || 1)));
    if (this.canvas.width !== px) { this.canvas.width = this.canvas.height = px; this._redraw(); }
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', w); this.svg.setAttribute('height', h);
    this.P = { x: R * 1.02, y: this.cy - R * 0.64 };
    this.L = R * 1.0;
    this._buildArm();
  }

  _redraw() {
    if (!this.canvas.width) return;
    drawRecord(this.canvas, this.skin, this.meta);
    this.stage.style.setProperty('--glow', this.skin.glow || this.skin.base);
  }

  _buildArm() {
    const { R, L } = this;
    const tube = R * 0.024;
    this.svg.innerHTML = `
      <defs>
        <linearGradient id="metal" x1="0" x2="1">
          <stop offset="0" stop-color="var(--arm-dark)"/><stop offset=".45" stop-color="var(--arm-light)"/><stop offset="1" stop-color="var(--arm-dark)"/>
        </linearGradient>
        <radialGradient id="base" cx=".4" cy=".35" r=".8">
          <stop offset="0" stop-color="var(--arm-light)"/><stop offset="1" stop-color="var(--arm-dark)"/>
        </radialGradient>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="${R * 0.03}" dy="${R * 0.04}" stdDeviation="${R * 0.02}" flood-opacity=".35"/>
        </filter>
      </defs>
      <g transform="translate(${this.P.x} ${this.P.y})">
        <circle r="${R * 0.2}" fill="var(--plinth-2)" stroke="var(--line)" stroke-width="1"/>
        <circle r="${R * 0.15}" fill="none" stroke="var(--line)" stroke-dasharray="2 4" stroke-width="${R * 0.04}" opacity=".5"/>
        <g id="armg" filter="url(#shadow)">
          <rect x="${-R * 0.055}" y="${-R * 0.3}" width="${R * 0.11}" height="${R * 0.14}" rx="${R * 0.02}" fill="url(#metal)"/>
          <rect x="${-tube / 2}" y="${-R * 0.18}" width="${tube}" height="${L * 0.83 + R * 0.18}" rx="${tube / 2}" fill="url(#metal)"/>
          <g transform="translate(0 ${L * 0.83}) rotate(22)">
            <rect x="${-R * 0.04}" y="0" width="${R * 0.08}" height="${R * 0.17}" rx="${R * 0.012}" fill="var(--headshell)"/>
            <rect x="${-R * 0.03}" y="${R * 0.1}" width="${R * 0.06}" height="${R * 0.09}" rx="${R * 0.008}" fill="#1b1a19"/>
            <rect x="${R * 0.04}" y="${R * 0.04}" width="${R * 0.07}" height="${R * 0.016}" rx="${R * 0.008}" fill="url(#metal)"/>
            <circle cx="${-R * 0.015}" cy="${R * 0.05}" r="${R * 0.008}" fill="var(--arm-dark)"/>
            <circle cx="${R * 0.015}" cy="${R * 0.05}" r="${R * 0.008}" fill="var(--arm-dark)"/>
          </g>
        </g>
        <circle r="${R * 0.085}" fill="url(#base)"/>
        <circle r="${R * 0.045}" fill="var(--arm-dark)" opacity=".5"/>
      </g>`;
    this.armG = this.svg.querySelector('#armg');
  }

  // Arm rotation (deg) that puts the stylus on a groove of radius r.
  _angleFor(r) {
    const C = { x: 0, y: this.cy }, P = this.P;
    // stylus position in the arm's local frame (headshell is angled 22°)
    const a22 = (22 * Math.PI) / 180, hs = this.R * 0.17;
    const lx = -hs * Math.sin(a22), ly = this.L * 0.83 + hs * Math.cos(a22);
    const L = Math.hypot(lx, ly);
    const dx = C.x - P.x, dy = C.y - P.y, d = Math.hypot(dx, dy);
    const a = (L * L - r * r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L * L - a * a));
    const bx = P.x + (a * dx) / d, by = P.y + (a * dy) / d;
    const n1 = { x: bx + (h * dy) / d, y: by - (h * dx) / d }, n2 = { x: bx - (h * dy) / d, y: by + (h * dx) / d };
    const N = n1.y > n2.y ? n1 : n2;
    return ((Math.atan2(N.y - P.y, N.x - P.x) - Math.atan2(ly, lx)) * 180) / Math.PI;
  }

  _tick(dt) {
    // platter physics: quick spin-up, gentle spin-down
    const target = this.motor === 'on' ? DEG_PER_SEC : 0;
    const rate = this.motor === 'on' ? 2.4 : this.motor === 'slow' ? 0.55 : 1.0;
    this.omega += (target - this.omega) * (1 - Math.exp(-rate * dt));
    if (this.motor !== 'on' && this.omega < 2) this.omega = Math.max(0, this.omega - 20 * dt);
    if (!this.reduced) this.angle = (this.angle + this.omega * dt) % 360;
    this.canvas.style.transform = `rotate(${this.angle}deg)`;

    if (!this.R) return;
    const R = this.R;
    let t;
    if (this.armMode === 'rest') t = this._angleFor(R * 1.18) - 4;
    else if (this.armMode === 'cue') t = this._angleFor(R * 0.95);
    else if (this.armMode === 'runout') t = this._angleFor(R * 0.38);
    else t = this._angleFor(R * (0.94 - this.progress * 0.5));
    if (this.armAngle == null) this.armAngle = t;
    this.armAngle += (t - this.armAngle) * (1 - Math.exp(-4 * dt));
    this.armG.setAttribute('transform', `rotate(${this.armAngle.toFixed(3)})`);
  }
}
