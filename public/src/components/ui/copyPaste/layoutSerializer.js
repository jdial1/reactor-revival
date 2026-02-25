import { BlueprintSchema, LegacyGridSchema } from "../../../core/schemas.js";

export function getCompactLayout(game) {
  if (!game.tileset || !game.tileset.tiles_list) return null;
  const rows = game.rows;
  const cols = game.cols;
  const parts = [];
  game.tileset.tiles_list.forEach((tile) => {
    if (tile.enabled && tile.part) {
      parts.push({
        r: tile.row,
        c: tile.col,
        t: tile.part.type,
        id: tile.part.id,
        lvl: tile.part.level || 1,
      });
    }
  });
  return { size: { rows, cols }, parts };
}

export function countPlacedParts(game, type, level) {
  if (!game.tileset || !game.tileset.tiles_list) return 0;
  let count = 0;
  for (const tile of game.tileset.tiles_list) {
    const tilePart = tile.part;
    if (tilePart && tilePart.type === type && tilePart.level === level) {
      count++;
    }
  }
  return count;
}

export function serializeReactor(game) {
  const layout = getCompactLayout(game);
  if (!layout) return "";
  return JSON.stringify(layout, null, 2);
}

function buildEmptyLayout(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function populateLayoutFromParts(layout, parts, rows, cols) {
  parts.forEach((part) => {
    if (part.r >= 0 && part.r < rows && part.c >= 0 && part.c < cols) {
      layout[part.r][part.c] = { t: part.t, id: part.id, lvl: part.lvl };
    }
  });
}

function parseLayoutFromBlueprint(parsed) {
  const { rows, cols } = parsed.size;
  const layout = buildEmptyLayout(rows, cols);
  populateLayoutFromParts(layout, parsed.parts, rows, cols);
  return layout;
}

export function deserializeReactor(str) {
  try {
    const data = JSON.parse(str);
    const bpResult = BlueprintSchema.safeParse(data);
    if (bpResult.success) return parseLayoutFromBlueprint(bpResult.data);
    const legacyResult = LegacyGridSchema.safeParse(data);
    if (legacyResult.success) return legacyResult.data;
    return null;
  } catch {
    return null;
  }
}
