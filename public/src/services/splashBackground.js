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
const SPLASH_FILL_INITIAL = 0.03;
const SPLASH_FILL_MAX = 0.80;
const RAND_NORMAL_STDDEV = 1.1;
const BOX_MULLER_LOG_COEFF = -2.0;
const BOX_MULLER_TAU = 2.0 * Math.PI;

function drawTilesOnCanvas(ctx, tileImg, gridW, gridH, tileSize) {
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      ctx.drawImage(tileImg, x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
}

async function loadParts(partImagesByTier, gridW, gridH) {
  const avgTier = getSplashTier();
  const fillPct = getSplashFill();
  const totalPartsToPlace = Math.floor(gridW * gridH * fillPct);
  const placements = [];
  for (let i = 0; i < totalPartsToPlace; i++) {
    const px = Math.floor(Math.random() * gridW);
    const py = Math.floor(Math.random() * gridH);
    const tier = pickTier(avgTier);
    const tierParts = partImagesByTier[tier] || partImagesByTier[1];
    const src = tierParts[Math.floor(Math.random() * tierParts.length)];
    placements.push({ px, py, src });
  }
  const SPLASH_LOAD_CONCURRENCY = 24;
  const tasks = placements.map(({ px, py, src }) => () =>
    new Promise((resolve) => {
      const partImg = new window.Image();
      partImg.src = src;
      partImg.onload = () => resolve({ img: partImg, px, py });
      partImg.onerror = () => resolve(null);
    })
  );
  const results = await runWithConcurrencyLimit(tasks, SPLASH_LOAD_CONCURRENCY);
  return results.filter(Boolean);
}

function drawParts(ctx, loadedParts, tileSize) {
  loadedParts.forEach(({ img, px, py }) => {
    ctx.drawImage(img, px * tileSize + PART_PADDING, py * tileSize + PART_PADDING, tileSize - PART_PADDING * 2, tileSize - PART_PADDING * 2);
  });
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
  const tileImg = new window.Image();
  tileImg.src = 'img/ui/tile.png';
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * GRID_W;
  canvas.height = TILE_SIZE * GRID_H;
  const ctx = canvas.getContext('2d');
  tileImg.onload = () => {
    drawTilesOnCanvas(ctx, tileImg, GRID_W, GRID_H, TILE_SIZE);
    loadParts(partImagesByTier, GRID_W, GRID_H)
      .then((loaded) => {
        drawParts(ctx, loaded, TILE_SIZE);
        const splashEl = document.getElementById('splash-screen');
        if (splashEl) {
          applySplashBackgroundStyles(splashEl, canvas);
          scheduleSplashBackgroundRefresh();
        }
      })
      .catch(() => {});
  };
  tileImg.onerror = () => {
    logger.log('error', 'splash', "Failed to load base tile image: 'img/ui/tile.png'. Dynamic background with parts will not be fully rendered.");
  };
}
