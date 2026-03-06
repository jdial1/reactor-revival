import { getPartImagesByTier, getMaxTier } from "./imagePreloadService.js";
import { logger } from "../utils/logger.js";
import { runWithConcurrencyLimit } from "../utils/concurrencyLimit.js";

const splashStartTime = Date.now();
let splashBgInterval = null;

export function getSplashTier() {
  const maxTier = getMaxTier();
  const elapsedMin = (Date.now() - splashStartTime) / 60000;
  return Math.min(1 + (elapsedMin / SPLASH_TIER_ELAPSE_MINUTES) * (maxTier - 1), maxTier);
}

export function getSplashFill() {
  const elapsedMin = (Date.now() - splashStartTime) / 60000;
  return Math.min(SPLASH_FILL_INITIAL + (elapsedMin / SPLASH_TIER_ELAPSE_MINUTES) * (SPLASH_FILL_MAX - SPLASH_FILL_INITIAL), SPLASH_FILL_MAX);
}

export function pickTier(avgTier) {
  const maxTier = getMaxTier();
  let tier = Math.round(randNormal(avgTier, RAND_NORMAL_STDDEV));
  tier = Math.max(1, Math.min(maxTier, tier));
  return tier;
}

export function randNormal(mean, stddev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(BOX_MULLER_LOG_COEFF * Math.log(u)) * Math.cos(BOX_MULLER_TAU * v);
  return mean + stddev * num;
}

const TILE_SIZE = 64;
const GRID_W = 25;
const GRID_H = 25;
const PART_PADDING = 8;
const SPLASH_BG_REFRESH_MS = 60000;
const SPLASH_TIER_ELAPSE_MINUTES = 15;
const SPLASH_FILL_INITIAL = 0.015;
const SPLASH_FILL_MAX = 0.12;
const RAND_NORMAL_STDDEV = 1.1;
const BOX_MULLER_LOG_COEFF = -2.0;
const BOX_MULLER_TAU = 2.0 * Math.PI;
const BLUEPRINT_BG = '#C4C4EC';
const BLUEPRINT_GRID = '#4a5a9e';
const BLUEPRINT_INK_R = 26;
const BLUEPRINT_INK_G = 67;
const BLUEPRINT_INK_B = 121;
const BLUEPRINT_INK_ALPHA = 255;
const EDGE_ALPHA_THRESHOLD = 128;
const INTERNAL_EDGE_COLOR_DIFF = 24;
const SCHEMATIC_CATEGORY_ORDER = ['cells', 'inlets', 'outlets', 'vents', 'coolants', 'reflectors', 'exchangers', 'platings', 'capacitors', 'valves', 'accelerators', 'xcell'];

function getSchematicCategoryIndex(src) {
  const lower = src.toLowerCase();
  if (lower.includes('xcell')) return SCHEMATIC_CATEGORY_ORDER.length - 1;
  for (let i = 0; i < SCHEMATIC_CATEGORY_ORDER.length; i++) {
    if (lower.includes(SCHEMATIC_CATEGORY_ORDER[i])) return i;
  }
  return SCHEMATIC_CATEGORY_ORDER.length - 1;
}

function fillCanvasBlueprint(ctx, w, h) {
  ctx.fillStyle = BLUEPRINT_BG;
  ctx.fillRect(0, 0, w, h);
}

function drawFaintGrid(ctx, w, h, tileSize) {
  const minorAlpha = 0.18;
  const majorAlpha = 0.30;
  const majorStep = tileSize * 4;
  ctx.strokeStyle = BLUEPRINT_GRID;
  for (let x = 0; x <= w; x += tileSize) {
    ctx.globalAlpha = (x % majorStep === 0) ? majorAlpha : minorAlpha;
    ctx.lineWidth = (x % majorStep === 0) ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += tileSize) {
    ctx.globalAlpha = (y % majorStep === 0) ? majorAlpha : minorAlpha;
    ctx.lineWidth = (y % majorStep === 0) ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.globalAlpha = majorAlpha;
  for (let x = 0; x <= w; x += majorStep) {
    for (let y = 0; y <= h; y += majorStep) {
      const sz = 2;
      ctx.beginPath();
      ctx.moveTo(x - sz, y);
      ctx.lineTo(x + sz, y);
      ctx.moveTo(x, y - sz);
      ctx.lineTo(x, y + sz);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawEdgeLabels(ctx, w, h, tileSize) {
  const majorStep = tileSize * 4;
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a4a9e';
  ctx.globalAlpha = 0.65;
  for (let x = majorStep; x < w; x += majorStep) {
    const col = Math.floor(x / majorStep) - 1;
    const label = col < 26 ? String.fromCharCode(65 + col) : String.fromCharCode(65 + Math.floor(col / 26) - 1) + String.fromCharCode(65 + (col % 26));
    ctx.fillText(label, x, 10);
  }
  ctx.textAlign = 'left';
  for (let y = majorStep; y < h; y += majorStep) {
    const row = Math.floor(y / majorStep);
    ctx.fillText(String(row), 10, y);
  }
  ctx.globalAlpha = 1;
}

function extractOutline(img) {
  const w = img.width;
  const h = img.height;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0);
  const data = octx.getImageData(0, 0, w, h);
  const out = octx.createImageData(w, h);
  const d = data.data;
  const o = out.data;
  const isExternalEdge = (x, y) => {
    const i = (y * w + x) * 4;
    const a = d[i + 3];
    if (a < EDGE_ALPHA_THRESHOLD) return false;
    const neighbors = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
    return neighbors.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return true;
      const ni = (ny * w + nx) * 4;
      return d[ni + 3] < EDGE_ALPHA_THRESHOLD;
    });
  };
  const isInternalEdge = (x, y) => {
    const i = (y * w + x) * 4;
    const a = d[i + 3];
    if (a < EDGE_ALPHA_THRESHOLD) return false;
    const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
    return neighbors.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
      const ni = (ny * w + nx) * 4;
      const na = d[ni + 3];
      if (na < EDGE_ALPHA_THRESHOLD) return false;
      const dr = Math.abs(d[i] - d[ni]);
      const dg = Math.abs(d[i + 1] - d[ni + 1]);
      const db = Math.abs(d[i + 2] - d[ni + 2]);
      return dr > INTERNAL_EDGE_COLOR_DIFF || dg > INTERNAL_EDGE_COLOR_DIFF || db > INTERNAL_EDGE_COLOR_DIFF;
    });
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isExternalEdge(x, y) || isInternalEdge(x, y)) {
        o[i] = BLUEPRINT_INK_R;
        o[i + 1] = BLUEPRINT_INK_G;
        o[i + 2] = BLUEPRINT_INK_B;
        o[i + 3] = BLUEPRINT_INK_ALPHA;
      } else {
        o[i + 3] = 0;
      }
    }
  }
  const dilated = octx.createImageData(w, h);
  const dil = dilated.data;
  const hasInkNeighbor = (ox, oy) => {
    const n = [[-1,0],[1,0],[0,-1],[0,1]];
    return n.some(([dx, dy]) => {
      const nx = ox + dx, ny = oy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
      return o[(ny * w + nx) * 4 + 3] > 0;
    });
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (o[i + 3] > 0 || hasInkNeighbor(x, y)) {
        dil[i] = BLUEPRINT_INK_R;
        dil[i + 1] = BLUEPRINT_INK_G;
        dil[i + 2] = BLUEPRINT_INK_B;
        dil[i + 3] = BLUEPRINT_INK_ALPHA;
      } else {
        dil[i + 3] = 0;
      }
    }
  }
  octx.putImageData(dilated, 0, 0);
  return off;
}

function getMaxSchematicCategoryIndex(tier) {
  if (tier < 2) return 2;
  if (tier < 3) return 5;
  if (tier < 4) return 8;
  return SCHEMATIC_CATEGORY_ORDER.length - 1;
}

function filterPartsBySchematicTier(tierParts, maxCategoryIndex) {
  return tierParts.filter((src) => getSchematicCategoryIndex(src) <= maxCategoryIndex);
}

async function loadParts(partImagesByTier, gridW, gridH) {
  const avgTier = getSplashTier();
  const fillPct = getSplashFill();
  const maxCategoryIndex = getMaxSchematicCategoryIndex(avgTier);
  const halfCount = Math.floor((gridW * gridH * fillPct) / 2);
  const midCol = Math.floor(gridW / 2);
  const placements = [];
  for (let i = 0; i < halfCount; i++) {
    const px = Math.floor(Math.random() * (midCol + 1));
    const py = Math.floor(Math.random() * gridH);
    const tier = pickTier(avgTier);
    const tierParts = partImagesByTier[tier] || partImagesByTier[1];
    const filtered = filterPartsBySchematicTier(tierParts, maxCategoryIndex);
    if (filtered.length === 0) continue;
    const src = filtered[Math.floor(Math.random() * filtered.length)];
    const categoryIndex = getSchematicCategoryIndex(src);
    const ghosted = categoryIndex >= maxCategoryIndex - 1 && maxCategoryIndex >= 2;
    placements.push({ px, py, src, ghosted });
    const mirrorPx = gridW - 1 - px;
    if (mirrorPx !== px) {
      placements.push({ px: mirrorPx, py, src, ghosted });
    }
  }
  const SPLASH_LOAD_CONCURRENCY = 24;
  const tasks = placements.map(({ px, py, src, ghosted }) => () =>
    new Promise((resolve) => {
      const partImg = new window.Image();
      partImg.src = src;
      partImg.onload = () => resolve({ img: partImg, px, py, ghosted });
      partImg.onerror = () => resolve(null);
    })
  );
  const results = await runWithConcurrencyLimit(tasks, SPLASH_LOAD_CONCURRENCY);
  return results.filter(Boolean);
}

function drawGeometricReactor(ctx, w, h) {
  const sw = typeof window !== 'undefined' ? window.innerWidth : w;
  const sh = typeof window !== 'undefined' ? window.innerHeight : h;
  const scale = Math.min(1.2, Math.max(0.6, Math.min(sw, sh) / 800)) * 0.75;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.35 * scale;
  const innerR = r * 0.4;
  const lineW = Math.max(4, Math.round(8 * scale));

  ctx.save();
  ctx.strokeStyle = 'rgba(20, 20, 25, 0.5)';
  ctx.lineWidth = lineW;
  ctx.lineCap = 'square';
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255, 250, 200, 0.45)';

  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      const startAngle = (i / 6) * Math.PI * 2;
      const endAngle = ((i + 1) / 6) * Math.PI * 2;
      
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle, false);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ax = cx + r * Math.cos(a);
    const ay = cy + r * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawPartsAsOutlines(ctx, loadedParts, tileSize) {
  const prevComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'multiply';
  loadedParts.forEach(({ img, px, py, ghosted }) => {
    const outline = extractOutline(img);
    const size = tileSize - PART_PADDING * 2;
    const x = px * tileSize + PART_PADDING;
    const y = py * tileSize + PART_PADDING;
    ctx.globalAlpha = ghosted ? 0.4 : 0.5;
    ctx.drawImage(outline, x, y, size, size);
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prevComposite;
}

const SPLASH_BG_SCROLL_DURATION_S = 120;

function applySplashBackgroundStyles(splashEl, canvas) {
  splashEl.style.backgroundImage = `url('${canvas.toDataURL()}')`;
  splashEl.style.backgroundRepeat = 'repeat';
  splashEl.style.backgroundSize = '';
  splashEl.style.animation = `splash-bg-scroll ${SPLASH_BG_SCROLL_DURATION_S}s linear infinite`;
}

function scheduleSplashBackgroundRefresh() {
  if (splashBgInterval) clearTimeout(splashBgInterval);
  splashBgInterval = setTimeout(generateSplashBackground, SPLASH_BG_REFRESH_MS);
}

export function generateSplashBackground() {
  const partImagesByTier = getPartImagesByTier();
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * GRID_W;
  canvas.height = TILE_SIZE * GRID_H;
  const ctx = canvas.getContext('2d');
  fillCanvasBlueprint(ctx, canvas.width, canvas.height);
  drawFaintGrid(ctx, canvas.width, canvas.height, TILE_SIZE);
  drawEdgeLabels(ctx, canvas.width, canvas.height, TILE_SIZE);
  drawGeometricReactor(ctx, canvas.width, canvas.height);
  loadParts(partImagesByTier, GRID_W, GRID_H)
    .then((loaded) => {
      drawPartsAsOutlines(ctx, loaded, TILE_SIZE);
      const splashEl = document.getElementById('splash-screen');
      if (splashEl) {
        applySplashBackgroundStyles(splashEl, canvas);
        scheduleSplashBackgroundRefresh();
      }
    })
    .catch(() => {});
}
