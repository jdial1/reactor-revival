import { getPartImagePath } from "../core/part-images.js";

const PREVIEW_MAX_WIDTH = 160;
const PREVIEW_MAX_HEIGHT = 120;
const PREVIEW_MIN_TILE_SIZE = 2;
const GHOST_ALPHA = 0.35;

function getPreviewDimensions(rows, cols) {
  const tileSize = Math.max(PREVIEW_MIN_TILE_SIZE, Math.min(Math.floor(PREVIEW_MAX_WIDTH / cols), Math.floor(PREVIEW_MAX_HEIGHT / rows)));
  return { tileSize, w: cols * tileSize, h: rows * tileSize };
}

function drawPreviewTileBackground(ctx, x, y, tileSize) {
  ctx.fillStyle = "rgb(20 20 20)";
  ctx.strokeStyle = "rgb(40 40 40)";
  ctx.fillRect(x, y, tileSize, tileSize);
  ctx.strokeRect(x, y, tileSize, tileSize);
}

function drawPreviewTilePart(ctx, img, x, y, tileSize, ghost) {
  if (!img || !img.complete || !img.naturalWidth) return;
  if (ghost) ctx.globalAlpha = GHOST_ALPHA;
  ctx.drawImage(img, x, y, tileSize, tileSize);
  if (ghost) ctx.globalAlpha = 1;
}

function createImageLoader() {
  const imgCache = new Map();
  return (path) => {
    if (imgCache.has(path)) return imgCache.get(path);
    if (typeof Image !== "function" || typeof document === "undefined") {
      imgCache.set(path, null);
      return null;
    }
    try {
      const img = new Image();
      img.src = path;
      imgCache.set(path, img);
      return img;
    } catch (_) {
      imgCache.set(path, null);
      return null;
    }
  };
}

function drawPreviewCell(ctx, opts) {
  const { layout, r, c, partset, loadImg, tileSize, affordableSet } = opts;
  const x = c * tileSize;
  const y = r * tileSize;
  drawPreviewTileBackground(ctx, x, y, tileSize);
  const cell = layout[r]?.[c];
  if (!cell?.id) return;
  const part = partset.getPartById(cell.id);
  if (!part) return;
  const path = typeof part.getImagePath === "function" ? part.getImagePath() : null;
  if (!path) return;
  const key = `${r},${c}`;
  const ghost = affordableSet != null && !affordableSet.has(key);
  drawPreviewTilePart(ctx, loadImg(path), x, y, tileSize, ghost);
}

export function renderLayoutPreview(partset, layout, canvasEl, affordableSet) {
  if (!layout?.length || !canvasEl || !partset) return;
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  if (cols === 0) return;
  const { tileSize, w, h } = getPreviewDimensions(rows, cols);
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  const loadImg = createImageLoader();
  const indices = Array.from({ length: rows * cols }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols }));
  indices.forEach(({ r, c }) => drawPreviewCell(ctx, { layout, r, c, partset, loadImg, tileSize, affordableSet }));
}

export function buildPartSummary(partset, layout) {
  if (!partset || !layout) return [];
  const cells = layout.flatMap((row) => row || []).filter((cell) => cell && cell.id);
  const summary = cells.reduce((acc, cell) => {
    const key = `${cell.id}|${cell.lvl || 1}`;
    if (!acc[key]) {
      const part = partset.parts.get(cell.id);
      acc[key] = {
        id: cell.id,
        type: cell.t,
        lvl: cell.lvl || 1,
        title: part ? part.title : cell.id,
        unitPrice: part ? part.cost : 0,
        count: 0,
        total: 0,
      };
    }
    acc[key].count++;
    acc[key].total += acc[key].unitPrice;
    return acc;
  }, {});
  return Object.values(summary);
}

export function buildAffordableSet(affordableLayout) {
  if (!affordableLayout) return new Set();
  const keys = affordableLayout.flatMap((row, r) => (row || []).map((cell, c) => cell ? `${r},${c}` : null).filter(Boolean));
  return new Set(keys);
}