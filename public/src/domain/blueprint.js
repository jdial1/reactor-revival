import { BlueprintSchema, LegacyGridSchema } from "../store.js";
import { isLayoutShareCode, shareCodeToLayoutGrid } from "../core/layoutShareCodec.js";
import { clipToGrid, layoutFromPlannerSlots as coreLayoutFromPlannerSlots } from "reactor-core";
export { clipToGrid };

function resolveGame(gameOrPartset) {
  if (gameOrPartset?.coreBridge) return gameOrPartset;
  if (gameOrPartset?.game?.coreBridge) return gameOrPartset.game;
  return null;
}

export function getCostBreakdown(layout, gameOrPartset) {
  const game = resolveGame(gameOrPartset);
  return game?.coreBridge?.isActive
    ? game.coreBridge.layoutCost(layout).breakdown
    : { money: 0, ep: 0 };
}

export function layoutFromPlannerSlots(game) {
  const bridge = game?.coreBridge;
  if (!bridge?.isActive) return null;
  bridge._syncGridCheap();
  bridge.syncMetaFromGame();
  return coreLayoutFromPlannerSlots(bridge.session, game.blueprintPlanner?.slots);
}

export function computeBlueprintDiff(game, targetLayout) {
  if (!game?.tileset || !targetLayout) {
    return { toRemove: [], toPlace: [], unchanged: [], breakdown: { money: 0, ep: 0 } };
  }
  const bridge = game.coreBridge;
  if (!bridge?.isActive) {
    return { toRemove: [], toPlace: [], unchanged: [], breakdown: { money: 0, ep: 0 } };
  }
  const core = bridge.previewBlueprintDiff(targetLayout);
  return {
    toRemove: (core.toRemove || []).map(({ r, c }) => ({
      r,
      c,
      tile: game.tileset.getTile(r, c),
    })),
    toPlace: (core.toPlace || []).map(({ r, c, cell }) => {
      const part = game.partset?.getPartById?.(cell?.id);
      return {
        r,
        c,
        cell,
        part,
        tile: game.tileset.getTile(r, c),
      };
    }).filter((entry) => entry.part),
    unchanged: core.unchanged || [],
    breakdown: core.breakdown || { money: 0, ep: 0 },
  };
}

export function applyBlueprintLayoutDiff(game, targetLayout, options = {}) {
  const bridge = game?.coreBridge;
  if (!bridge?.isActive || !targetLayout) return { ok: false, reason: "invalid" };
  return bridge.applyBlueprint({
    layout: targetLayout,
    skipCostDeduction: options.skipCostDeduction === true,
    partial: options.partial === true,
    sellExisting: options.sellExisting === true,
    sellCredit: options.sellCredit ?? 0,
  });
}

function mapCorePlacementToHost(game, entry) {
  const part = game.partset?.getPartById?.(entry.cell?.id ?? entry.def?.id);
  if (!part) return null;
  return {
    r: entry.r,
    c: entry.c,
    cell: entry.cell,
    part,
    tile: game.tileset?.getTile?.(entry.r, entry.c),
    def: entry.def,
  };
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
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  if (isLayoutShareCode(trimmed)) return null;
  try {
    const data = JSON.parse(trimmed);
    const bpResult = BlueprintSchema.safeParse(data);
    if (bpResult.success) return parseLayoutFromBlueprint(bpResult.data);
    const legacyResult = LegacyGridSchema.safeParse(data);
    if (legacyResult.success) return legacyResult.data;
    return null;
  } catch {
    return null;
  }
}

export function deserializeReactorInput(str, game) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  if (isLayoutShareCode(trimmed) && game?.partset) {
    return shareCodeToLayoutGrid(trimmed, game.partset);
  }
  return deserializeReactor(trimmed);
}

export function parseClipboardString(raw, game) {
  const layout = deserializeReactorInput(raw, game);
  if (!layout) return { layout: null, error: "Invalid layout data" };
  return { layout, error: null };
}

function resourceGte(a, b) {
  return a != null && typeof a.gte === "function" ? a.gte(b) : Number(a) >= b;
}

export function calculateLayoutCostBreakdown(gameOrPartset, layout) {
  return getCostBreakdown(layout, gameOrPartset);
}

export function calculateLayoutCost(gameOrPartset, layout) {
  return calculateLayoutCostBreakdown(gameOrPartset, layout).money;
}

export function calculateLayoutCostFromData(entryData, gameOrPartset, fmtFn) {
  try {
    const str = typeof entryData === "string" ? entryData : JSON.stringify(entryData);
    const layout2D = deserializeReactor(str);
    if (!layout2D) return "-";
    const cost = calculateLayoutCost(gameOrPartset, layout2D);
    return cost > 0 ? fmtFn(cost) : "-";
  } catch {
    return "-";
  }
}

export function calculateLayoutDiffBreakdown(game, layout) {
  if (!game) return { money: 0, ep: 0 };
  const clipped = clipToGrid(layout, game.rows, game.cols);
  return game.coreBridge?.isActive
    ? game.coreBridge.previewBlueprintDiff(clipped).breakdown
    : { money: 0, ep: 0 };
}

export function filterLayoutByCheckedTypes(layout, checkedTypes) {
  return layout.map((row) => row.map((cell) => (cell && checkedTypes[cell.id] !== false) ? cell : null));
}

export function calculateCurrentSellValue(tileset) {
  return tileset?.game?.coreBridge?.computeGridSellCredit?.().total ?? 0;
}

export function buildAffordableLayout(filteredLayout, sellCredit, gameRows, gameCols, game) {
  const bridge = game?.coreBridge;
  if (!bridge?.isActive || !filteredLayout) return null;
  const preview = bridge.previewPartialBlueprint(filteredLayout, { sellCredit });
  const rows = Math.min(gameRows, filteredLayout.length);
  const cols = Math.min(gameCols, filteredLayout[0]?.length ?? 0);
  const result = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  for (let i = 0; i < (preview.affordable || []).length; i++) {
    const { r, c, cell } = preview.affordable[i];
    if (r >= 0 && r < rows && c >= 0 && c < cols) result[r][c] = cell;
  }
  return result;
}

export function buildPasteState(layout, checkedTypes, game, tileset, sellCheckboxChecked) {
  if (!layout) return { valid: false, invalidMessage: "Invalid layout data" };

  const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
  const sellCredit = sellCheckboxChecked ? calculateCurrentSellValue(tileset) : 0;
  const bridge = game?.coreBridge;
  const currentMoney = game.state.current_money;
  const currentEp = game.state.current_exotic_particles;
  const currentMoneyNum = typeof currentMoney?.toNumber === "function"
    ? currentMoney.toNumber()
    : Number(currentMoney ?? 0);
  const currentEpNum = typeof currentEp?.toNumber === "function"
    ? currentEp.toNumber()
    : Number(currentEp ?? 0);

  const preview = bridge?.isActive
    ? bridge.previewPartialBlueprint(filteredLayout, {
      sellCredit,
      balances: { money: currentMoneyNum, ep: currentEpNum },
    })
    : null;
  const breakdown = preview?.breakdown
    ?? (game ? calculateLayoutDiffBreakdown(game, filteredLayout) : { money: 0, ep: 0 });

  const canAffordMoney = preview?.deficit?.moneyShort == null || preview.deficit.moneyShort <= 0;
  const canAffordEp = preview?.deficit?.epShort == null || preview.deficit.epShort <= 0;
  const canPaste = preview?.canAfford === true
    || ((breakdown.money > 0 || breakdown.ep > 0) && canAffordMoney && canAffordEp && preview?.deficit == null);
  const affordablePlacements = (preview?.affordable || [])
    .map((entry) => mapCorePlacementToHost(game, entry))
    .filter(Boolean);
  const hasPartial = !canPaste && affordablePlacements.length > 0;

  return {
    valid: true,
    filteredLayout,
    breakdown,
    canAffordMoney,
    canAffordEp,
    canPaste,
    affordablePlacements,
    currentMoneyNum,
    currentEpNum,
    hasPartial,
    deficit: preview?.deficit ?? null,
  };
}

export function validatePasteResources(breakdown, sellCredit, currentMoney, currentEp, preview = null) {
  if (preview?.canAfford === true) return { valid: true };
  if (preview?.deficit) return { valid: false, reason: "insufficient_resources" };
  const netMoney = breakdown.money - sellCredit;
  if (breakdown.money <= 0 && breakdown.ep <= 0) return { valid: false, reason: "no_parts" };
  if (!resourceGte(currentMoney, netMoney) || !resourceGte(currentEp, breakdown.ep)) {
    return { valid: false, reason: "insufficient_resources" };
  }
  return { valid: true };
}

export function computePastePreview(game, layout, options = {}) {
  const { checkedTypes = {}, sellExisting = false, tileset } = options;
  const state = buildPasteState(layout, checkedTypes, game, tileset ?? game?.tileset, sellExisting);
  if (!state.valid) return { ...state, diff: null, cost: null, affordable: false, partial: false };
  const diff = computeBlueprintDiff(game, state.filteredLayout);
  return {
    ...state,
    diff,
    cost: state.breakdown,
    affordable: state.canPaste,
    partial: state.hasPartial,
  };
}
