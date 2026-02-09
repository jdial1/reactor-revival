const STEAM_COUNT = 8;
const STEAM_DURATION_MS = 1500;
const STEAM_RISE = 80;
const STEAM_SPREAD = 40;
const STEAM_MAX = 512;
const BOLT_DURATION_MS = 400;
const BOLT_MAX = 64;
const CRITICAL_EMBER_COUNT = 24;
const CRITICAL_EMBER_DURATION_MS = 2200;
const CRITICAL_EMBER_SPREAD = 120;
const EMBER_MAX = 256;
const SPARK_COUNT = 12;
const SPARK_DURATION_MS = 600;
const SPARK_MAX = 192;

export class ParticleSystem {
  constructor() {
    this._steam = [];
    this._bolts = [];
    this._embers = [];
    this._sparks = [];
    this._w = 0;
    this._h = 0;
  }

  setSize(w, h) {
    this._w = Math.max(0, w | 0);
    this._h = Math.max(0, h | 0);
  }

  createSteamParticles(clientX, clientY, heatVented = 1) {
    const scale = Math.max(0.2, Math.min(3, Number(heatVented) || 1));
    const count = Math.max(2, Math.min(24, Math.round(STEAM_COUNT * scale)));
    const baseRadius = 1.5 + scale * 1.5;
    const maxLife = STEAM_DURATION_MS * (0.7 + scale * 0.3);
    for (let i = 0; i < count; i++) {
      if (this._steam.length >= STEAM_MAX) this._steam.shift();
      const offsetX = (Math.random() - 0.5) * STEAM_SPREAD * scale;
      this._steam.push({
        x: clientX,
        y: clientY,
        vx: offsetX * 0.04,
        vy: -STEAM_RISE / STEAM_DURATION_MS,
        life: 0,
        maxLife: maxLife,
        radius: baseRadius * (0.7 + Math.random() * 0.6),
        startRadius: baseRadius * (0.7 + Math.random() * 0.6),
        opacityScale: Math.min(1, scale),
      });
    }
  }

  createSellSparks(fromClientX, fromClientY, toClientX, toClientY) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (this._sparks.length >= SPARK_MAX) this._sparks.shift();
      const t = (i + Math.random()) / SPARK_COUNT;
      const spread = 8 + Math.random() * 12;
      const fromX = fromClientX + (Math.random() - 0.5) * spread;
      const fromY = fromClientY + (Math.random() - 0.5) * spread;
      const toX = toClientX + (Math.random() - 0.5) * spread;
      const toY = toClientY + (Math.random() - 0.5) * spread;
      const delay = Math.random() * 80;
      this._sparks.push({
        fromX,
        fromY,
        toX,
        toY,
        life: -delay,
        maxLife: SPARK_DURATION_MS + delay,
        radius: 2 + Math.random() * 2,
      });
    }
  }

  createBoltParticle(fromClientX, fromClientY, toClientX, toClientY) {
    if (this._bolts.length >= BOLT_MAX) this._bolts.shift();
    this._bolts.push({
      fromX: fromClientX,
      fromY: fromClientY,
      toX: toClientX,
      toY: toClientY,
      life: 0,
      maxLife: BOLT_DURATION_MS,
    });
  }

  createCriticalBuildupEmbers(centerX, centerY) {
    for (let i = 0; i < CRITICAL_EMBER_COUNT; i++) {
      if (this._embers.length >= EMBER_MAX) this._embers.shift();
      const angle = (i / CRITICAL_EMBER_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const dist = Math.random() * CRITICAL_EMBER_SPREAD * 0.5;
      const vx = Math.cos(angle) * 0.08;
      const vy = -0.12 - Math.random() * 0.08;
      this._embers.push({
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx,
        vy,
        life: 0,
        maxLife: CRITICAL_EMBER_DURATION_MS,
        radius: 2.5 + Math.random() * 2,
        startRadius: 2.5,
      });
    }
  }

  update(dtMs) {
    for (let i = this._steam.length - 1; i >= 0; i--) {
      const p = this._steam[i];
      p.life += dtMs;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      if (p.life >= p.maxLife) this._steam.splice(i, 1);
    }
    for (let i = this._bolts.length - 1; i >= 0; i--) {
      const b = this._bolts[i];
      b.life += dtMs;
      if (b.life >= b.maxLife) this._bolts.splice(i, 1);
    }
    for (let i = this._embers.length - 1; i >= 0; i--) {
      const p = this._embers[i];
      p.life += dtMs;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      if (p.life >= p.maxLife) this._embers.splice(i, 1);
    }
    for (let i = this._sparks.length - 1; i >= 0; i--) {
      const s = this._sparks[i];
      s.life += dtMs;
      if (s.life >= s.maxLife) this._sparks.splice(i, 1);
    }
  }

  draw(ctx) {
    if (!ctx || this._w <= 0 || this._h <= 0) return;
    for (const p of this._steam) {
      const t = p.life / p.maxLife;
      const opacityScale = p.opacityScale != null ? p.opacityScale : 1;
      const alpha = 0.6 * opacityScale * (1 - t);
      const r = p.startRadius + t * 1.5;
      ctx.fillStyle = `rgba(200,200,200,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of this._bolts) {
      const t = Math.min(1, b.life / b.maxLife);
      const x = b.fromX + (b.toX - b.fromX) * t;
      const y = b.fromY + (b.toY - b.fromY) * t;
      const alpha = 1 - t * 0.7;
      ctx.save();
      ctx.font = "1.2rem sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = alpha;
      ctx.fillText("\u26A1", x, y);
      ctx.restore();
    }
    for (const p of this._embers) {
      const t = p.life / p.maxLife;
      const alpha = 0.85 * (1 - t) * (0.5 + 0.5 * (1 - t));
      const r = p.startRadius + t * 2.5;
      const red = 255;
      const green = Math.round(80 + (1 - t) * 100);
      const blue = Math.round(40 * (1 - t));
      ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const s of this._sparks) {
      if (s.life < 0) continue;
      const t = Math.min(1, s.life / s.maxLife);
      const x = s.fromX + (s.toX - s.fromX) * t;
      const y = s.fromY + (s.toY - s.fromY) * t;
      const alpha = (1 - t) * 0.9;
      const r = s.radius * (1 - t * 0.5);
      ctx.fillStyle = `rgba(255, 220, 120, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
