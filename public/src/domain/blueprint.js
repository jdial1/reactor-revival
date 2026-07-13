import { debitMoney, debitExoticParticles, enqueueDebitLayoutCost } from "./economy-intents.js";
import { BlueprintSchema, LegacyGridSchema } from "../store.js";
import { isLayoutShareCode, shareCodeToLayoutGrid } from "../core/layoutShareCodec.js";
import { clipToGrid } from "reactor-core";
export { clipToGrid };

export function getCostBreakdown(layout, partset) {
  if (!layout || !partset) return { money: 0, ep: 0 };
  return layout.flatMap((row) => row || []).filter((cell) => cell?.id).reduce(
    (out, cell) => {
      const part = partset.parts.get(cell.id);
      if (!part) return out;
      const n = (part.cost?.toNumber?.() ?? Number(part.cost ?? 0)) * (cell.lvl || 1);
      if (part.erequires) out.ep += n;
      else out.money += n;
      return out;
    },
    { money: 0, ep: 0 }
  );
}

function partCostForCell(part, cell, partset) {
  if (!part) return { money: 0, ep: 0 };
  const ecost = part.ecost;
  const usesEp = !!part.erequires;
  const base = usesEp && ecost?.gt?.(0)
    ? (ecost?.toNumber?.() ?? Number(ecost ?? 0))
    : (part.cost?.toNumber?.() ?? Number(part.cost ?? 0));
  const n = base * (cell.lvl || 1);
  if (usesEp) return { money: 0, ep: n };
  return { money: n, ep: 0 };
}

function cellsMatch(livePart, liveLvl, cell) {
  if (!cell?.id) return !livePart;
  if (!livePart) return false;
  return livePart.id === cell.id && (liveLvl || 1) === (cell.lvl || 1);
}

export function liveGridToLayout(game) {
  if (!game?.tileset) return null;
  const rows = game.rows;
  const cols = game.cols;
  const layout = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  game.tileset.tiles_list.forEach((tile) => {
    if (!tile.enabled || !tile.part) return;
    layout[tile.row][tile.col] = {
      id: tile.part.id,
      t: tile.part.type,
      lvl: tile.part.level || 1,
    };
  });
  return layout;
}

export function layoutFromPlannerSlots(game) {
  const slots = game.blueprintPlanner?.slots;
  if (!slots || typeof slots !== "object") return null;
  const rows = game.rows;
  const cols = game.cols;
  const layout = liveGridToLayout(game);
  if (!layout) return null;
  for (const key of Object.keys(slots)) {
    const partId = slots[key];
    if (!partId) continue;
    const [rs, cs] = key.split(",");
    const r = Number(rs);
    const c = Number(cs);
    if (!Number.isFinite(r) || !Number.isFinite(c) || r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const part = game.partset.getPartById(partId);
    if (!part) continue;
    layout[r][c] = { id: part.id, t: part.type, lvl: part.level || 1 };
  }
  return layout;
}

export function computeBlueprintDiff(game, targetLayout) {
  if (!game?.tileset || !targetLayout) {
    return { toRemove: [], toPlace: [], unchanged: [], breakdown: { money: 0, ep: 0 } };
  }
  const clipped = clipToGrid(targetLayout, game.rows, game.cols);
  const toRemove = [];
  const toPlace = [];
  const unchanged = [];
  const breakdown = { money: 0, ep: 0 };

  for (let r = 0; r < clipped.length; r++) {
    const row = clipped[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const tile = game.tileset.getTile(r, c);
      if (!tile?.enabled) continue;
      const livePart = tile.part;
      const liveLvl = livePart?.level || 1;
      if (cellsMatch(livePart, liveLvl, cell)) {
        unchanged.push({ r, c, cell });
        continue;
      }
      if (livePart) toRemove.push({ r, c, tile });
      if (cell?.id) {
        const part = game.partset.getPartById(cell.id);
        if (part) {
          toPlace.push({ r, c, cell, part, tile });
          const cost = partCostForCell(part, cell, game.partset);
          breakdown.money += cost.money;
          breakdown.ep += cost.ep;
        }
      }
    }
  }
  return { toRemove, toPlace, unchanged, breakdown };
}

export function applyBlueprintLayoutDiff(game, targetLayout, options = {}) {
  if (!game?.tileset || !game?.partset || !targetLayout) return { ok: false, reason: "invalid" };
  const diff = computeBlueprintDiff(game, targetLayout);
  let placements = diff.toPlace;
  if (options.partial) {
    placements = filterAffordablePlacements(game, placements, options.sellCredit ?? 0);
    if (placements.length === 0 && diff.toPlace.length > 0) {
      return { ok: false, reason: "deficit", breakdown: diff.breakdown };
    }
  } else if (!options.skipCostDeduction) {
    const deficit = checkAffordability(game, diff.breakdown, options.sellCredit ?? 0);
    if (deficit) return { ok: false, reason: "deficit", ...deficit, breakdown: diff.breakdown };
  }

  const placeKeys = new Set(placements.map((p) => `${p.r},${p.c}`));
  const clipped = clipToGrid(targetLayout, game.rows, game.cols);
  for (let i = 0; i < diff.toRemove.length; i++) {
    const { r, c, tile } = diff.toRemove[i];
    const key = `${r},${c}`;
    const targetCell = clipped[r]?.[c];
    const clearingToEmpty = !targetCell?.id;
    if (clearingToEmpty || placeKeys.has(key)) {
      if (tile.part) tile.clearPart();
    }
  }
  for (let i = 0; i < placements.length; i++) {
    const { tile, part } = placements[i];
    if (tile.part) tile.clearPart();
    tile.setPart(part);
  }

  if (!options.skipCostDeduction) {
    const placeBreakdown = placements.reduce(
      (out, { part, cell }) => {
        const cost = partCostForCell(part, cell, game.partset);
        out.money += cost.money;
        out.ep += cost.ep;
        return out;
      },
      { money: 0, ep: 0 }
    );
    if (placeBreakdown.money > 0 || placeBreakdown.ep > 0) {
      enqueueDebitLayoutCost(game, { money: placeBreakdown.money, ep: placeBreakdown.ep });
    }
  }

  return {
    ok: true,
    placed: placements.length,
    removed: diff.toRemove.length,
    partial: !!options.partial,
    breakdown: diff.breakdown,
  };
}

function toResourceNumber(value) {
  if (value != null && typeof value.toNumber === "function") return value.toNumber();
  return Number(value ?? 0);
}

function checkAffordability(game, breakdown, sellCredit = 0) {
  const netMoney = breakdown.money - sellCredit;
  const money = toResourceNumber(game.state.current_money);
  const ep = toResourceNumber(game.state.current_exotic_particles ?? 0);
  const moneyShort = netMoney > money ? netMoney - money : 0;
  const epShort = breakdown.ep > ep ? breakdown.ep - ep : 0;
  if (moneyShort > 0 || epShort > 0) return { moneyShort, epShort };
  return null;
}

function filterAffordablePlacements(game, placements, sellCredit = 0) {
  let money = toResourceNumber(game.state.current_money) + sellCredit;
  let ep = toResourceNumber(game.state.current_exotic_particles ?? 0);
  const affordable = [];
  for (let i = 0; i < placements.length; i++) {
    const entry = placements[i];
    const cost = partCostForCell(entry.part, entry.cell, game.partset);
    if (cost.ep > 0) {
      if (ep < cost.ep) continue;
      ep -= cost.ep;
    } else if (cost.money > 0) {
      if (money < cost.money) continue;
      money -= cost.money;
    }
    affordable.push(entry);
  }
  return affordable;
}

export function filterAffordablePlacementsForGame(game, placements, sellCredit = 0) {
  return filterAffordablePlacements(game, placements, sellCredit);
}

export function applyBlueprintLayout(game, layout, skipCostDeduction = false) {
  const result = applyBlueprintLayoutDiff(game, layout, { skipCostDeduction });
  if (!result.ok) return null;
  return clipToGrid(layout, game.rows, game.cols);
}

const SELL_VALUE_MULTIPLIER = 0.5;

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

function resourceSub(a, b) {
  return a != null && typeof a.sub === "function" ? a.sub(b) : a - b;
}

function normalizeMoney(game, sellCredit) {
  let money = game.state.current_money;
  if (money != null && typeof money.add === "function") return sellCredit > 0 ? money.add(sellCredit) : money;
  return Number(money?.toNumber?.() ?? money ?? 0) + sellCredit;
}

function normalizeEp(game) {
  const ep = game.state.current_exotic_particles ?? 0;
  if (ep && typeof ep.toNumber === "function") return ep.toNumber();
  return Number(ep ?? 0);
}

function getNormalizedResources(game, sellCredit) {
  return { money: normalizeMoney(game, sellCredit), ep: normalizeEp(game) };
}

function getPartCost(part, cell) {
  const cost = part.cost != null && part.cost.gte ? part.cost.mul(cell.lvl || 1) : (part.cost ?? 0) * (cell.lvl || 1);
  const costNum = typeof cost === "number" ? cost : (cost?.toNumber?.() ?? Number(cost));
  return { cost, costNum };
}

function allocateIfAffordable(money, ep, part, cost, costNum, gte, sub) {
  if (part.erequires) {
    if (gte(ep, costNum)) return { newMoney: money, newEp: typeof ep === "number" ? ep - costNum : sub(ep, cost), allocated: true };
    return { newMoney: money, newEp: ep, allocated: false };
  }
  if (gte(money, costNum)) return { newMoney: typeof money === "number" ? money - costNum : sub(money, cost), newEp: ep, allocated: true };
  return { newMoney: money, newEp: ep, allocated: false };
}

function getCellCostNumber(part, cell) {
  if (typeof part.cost === "undefined" || part.cost == null) return 0;
  const amount = part.cost.gte ? part.cost.mul(cell.lvl || 1) : part.cost * (cell.lvl || 1);
  return amount != null && amount.gte != null ? amount.toNumber?.() ?? Number(amount) : Number(amount);
}

function addCellCostToBreakdown(out, part, num) {
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
  return calculateLayoutCostBreakdown(partset, layout).money;
}

export function calculateLayoutCostFromData(entryData, partset, fmtFn) {
  try {
    const str = typeof entryData === "string" ? entryData : JSON.stringify(entryData);
    const layout2D = deserializeReactor(str);
    if (!layout2D || !partset) return "-";
    const cost = layout2D.flatMap((row) => row || []).filter((cell) => cell?.id).reduce((sum, cell) => {
      const part = partset.parts.get(cell.id);
      if (!part) return sum;
      const c = part.cost?.toNumber?.() ?? Number(part.cost ?? 0);
      return sum + c * (cell.lvl || 1);
    }, 0);
    return cost > 0 ? fmtFn(cost) : "-";
  } catch {
    return "-";
  }
}

export function calculateLayoutDiffBreakdown(game, layout) {
  if (!game) return { money: 0, ep: 0 };
  const clipped = clipToGrid(layout, game.rows, game.cols);
  return computeBlueprintDiff(game, clipped).breakdown;
}

export function filterLayoutByCheckedTypes(layout, checkedTypes) {
  return layout.map((row) => row.map((cell) => (cell && checkedTypes[cell.id] !== false) ? cell : null));
}

export function calculateCurrentSellValue(tileset) {
  if (!tileset?.tiles_list) return 0;
  let sellValue = 0;
  tileset.tiles_list.forEach((tile) => {
    if (tile.enabled && tile.part) {
      sellValue += (tile.part.cost * (tile.part.level || 1)) * SELL_VALUE_MULTIPLIER;
    }
  });
  return Math.floor(sellValue);
}

export function buildAffordableLayout(filteredLayout, sellCredit, gameRows, gameCols, game) {
  if (!filteredLayout || !game?.partset) return null;
  let { money, ep } = getNormalizedResources(game, sellCredit);
  const rows = Math.min(gameRows, filteredLayout.length);
  const cols = Math.min(gameCols, filteredLayout[0]?.length ?? 0);
  const result = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  const cellsInOrder = filteredLayout.flatMap((row, r) =>
    (row || []).map((cell, c) => (cell && cell.id ? { r, c, cell } : null)).filter(Boolean)
  );
  cellsInOrder.forEach(({ r, c, cell }) => {
    const part = game.partset.getPartById(cell.id);
    if (!part) return;
    const { cost, costNum } = getPartCost(part, cell);
    const { newMoney, newEp, allocated } = allocateIfAffordable(money, ep, part, cost, costNum, resourceGte, resourceSub);
    money = newMoney;
    ep = newEp;
    if (allocated) result[r][c] = cell;
  });
  return result;
}

function calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum) {
  const netMoney = breakdown.money - sellCredit;
  const canAffordMoney = netMoney <= currentMoneyNum;
  const canAffordEp = breakdown.ep <= currentEpNum;
  const canPaste = (breakdown.money > 0 || breakdown.ep > 0) && canAffordMoney && canAffordEp;
  return { canAffordMoney, canAffordEp, canPaste };
}

export function buildPasteState(layout, checkedTypes, game, tileset, sellCheckboxChecked) {
  if (!layout) return { valid: false, invalidMessage: "Invalid layout data" };

  const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
  const breakdown = game
    ? calculateLayoutDiffBreakdown(game, filteredLayout)
    : calculateLayoutCostBreakdown(game?.partset, filteredLayout);
  const sellCredit = sellCheckboxChecked ? calculateCurrentSellValue(tileset) : 0;

  const currentMoney = game.state.current_money;
  const currentEp = game.state.current_exotic_particles;
  const currentMoneyNum = typeof currentMoney?.toNumber === "function"
    ? currentMoney.toNumber()
    : Number(currentMoney ?? 0);
  const currentEpNum = typeof currentEp?.toNumber === "function"
    ? currentEp.toNumber()
    : Number(currentEp ?? 0);

  const finances = calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum);
  const diff = game ? computeBlueprintDiff(game, filteredLayout) : { toPlace: [] };
  const affordablePlacements = game
    ? filterAffordablePlacementsForGame(game, diff.toPlace, sellCredit)
    : [];
  const hasPartial = !finances.canPaste && affordablePlacements.length > 0;

  return {
    valid: true,
    filteredLayout,
    breakdown,
    ...finances,
    affordablePlacements,
    currentMoneyNum,
    currentEpNum,
    hasPartial,
  };
}

export function validatePasteResources(breakdown, sellCredit, currentMoney, currentEp) {
  const netMoney = breakdown.money - sellCredit;
  if (breakdown.money <= 0 && breakdown.ep <= 0) return { valid: false, reason: "no_parts" };
  if (!resourceGte(currentMoney, netMoney) || !resourceGte(currentEp, breakdown.ep)) return { valid: false, reason: "insufficient_resources" };
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
