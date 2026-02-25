export function getCellCostNumber(part, cell) {
  if (typeof part.cost === "undefined" || part.cost == null) return 0;
  const amount = part.cost.gte ? part.cost.mul(cell.lvl || 1) : part.cost * (cell.lvl || 1);
  return amount != null && amount.gte != null ? amount.toNumber?.() ?? Number(amount) : Number(amount);
}

export function addCellCostToBreakdown(out, part, num) {
  if (part.erequires) out.ep += num;
  else out.money += num;
}

export function calculateLayoutCostBreakdown(partset, layout) {
  const out = { money: 0, ep: 0 };
  if (!layout || !partset) return out;
  const cells = layout.flatMap((row) => row || []);
  cells
    .filter((cell) => cell?.id)
    .forEach((cell) => {
      const part = partset.parts.get(cell.id);
      if (part) addCellCostToBreakdown(out, part, getCellCostNumber(part, cell));
    });
  return out;
}

export function calculateLayoutCost(partset, layout) {
  if (!layout || !partset) return 0;
  return layout.flatMap((row) => row || []).filter((cell) => cell && cell.id).reduce((cost, cell) => {
    const part = partset.parts.get(cell.id);
    return cost + (part ? getCellCostNumber(part, cell) : 0);
  }, 0);
}

const PREVIEW_MAX_WIDTH = 160;
const PREVIEW_MAX_HEIGHT = 120;
const PREVIEW_MIN_TILE_SIZE = 2;
const GHOST_ALPHA = 0.35;

export function getPreviewDimensions(rows, cols) {
  const tileSize = Math.max(PREVIEW_MIN_TILE_SIZE, Math.min(Math.floor(PREVIEW_MAX_WIDTH / cols), Math.floor(PREVIEW_MAX_HEIGHT / rows)));
  return { tileSize, w: cols * tileSize, h: rows * tileSize };
}

export function drawPreviewTileBackground(ctx, x, y, tileSize) {
  ctx.fillStyle = "rgb(20 20 20)";
  ctx.strokeStyle = "rgb(40 40 40)";
  ctx.fillRect(x, y, tileSize, tileSize);
  ctx.strokeRect(x, y, tileSize, tileSize);
}

export function drawPreviewTilePart(ctx, img, x, y, tileSize, ghost) {
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
