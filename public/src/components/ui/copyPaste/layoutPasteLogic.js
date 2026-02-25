import { getNormalizedResources, getPartCost, allocateIfAffordable, resourceGte, resourceSub } from "./resourceUtils.js";
import { calculateLayoutCostBreakdown } from "./layoutCostUtils.js";

const SELL_VALUE_MULTIPLIER = 0.5;

export function filterLayoutByCheckedTypes(layout, checkedTypes) {
  return layout.map(row => row.map(cell => (cell && checkedTypes[cell.id] !== false) ? cell : null));
}

export function clipToGrid(layout, rows, cols) {
  return layout.slice(0, rows).map(row => (row || []).slice(0, cols));
}

export function calculateCurrentSellValue(tileset) {
  if (!tileset?.tiles_list) return 0;
  let sellValue = 0;
  tileset.tiles_list.forEach(tile => {
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

export function calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum) {
  const netMoney = breakdown.money - sellCredit;
  const canAffordMoney = netMoney <= currentMoneyNum;
  const canAffordEp = breakdown.ep <= currentEpNum;
  const canPaste = (breakdown.money > 0 || breakdown.ep > 0) && canAffordMoney && canAffordEp;
  return { canAffordMoney, canAffordEp, canPaste };
}

export function buildPasteState(layout, checkedTypes, game, tileset, sellCheckboxChecked) {
  if (!layout) return { valid: false, invalidMessage: "Invalid layout data" };

  const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
  const breakdown = calculateLayoutCostBreakdown(game?.partset, filteredLayout);
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
  const affordableLayout = buildAffordableLayout(filteredLayout, sellCredit, game.rows, game.cols, game);
  const hasPartial = affordableLayout ? affordableLayout.some(row => row?.some(cell => cell != null)) : false;

  return {
    valid: true,
    filteredLayout,
    breakdown,
    ...finances,
    affordableLayout,
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

export function getCostBreakdown(layout, partset) {
  if (!layout || !partset) return { money: 0, ep: 0 };
  return layout.flatMap(row => row || []).filter(cell => cell?.id).reduce((out, cell) => {
    const part = partset.parts.get(cell.id);
    if (!part) return out;
    const n = (part.cost?.toNumber?.() ?? Number(part.cost ?? 0)) * (cell.lvl || 1);
    if (part.erequires) out.ep += n;
    else out.money += n;
    return out;
  }, { money: 0, ep: 0 });
}
