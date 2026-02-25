export function resourceGte(a, b) {
  return a != null && typeof a.gte === "function" ? a.gte(b) : Number(a) >= b;
}

export function resourceSub(a, b) {
  return a != null && typeof a.sub === "function" ? a.sub(b) : a - b;
}

export function normalizeMoney(game, sellCredit) {
  let money = game.state.current_money;
  if (money != null && typeof money.add === "function") return sellCredit > 0 ? money.add(sellCredit) : money;
  return Number(money?.toNumber?.() ?? money ?? 0) + sellCredit;
}

export function normalizeEp(game) {
  const ep = game.state.current_exotic_particles ?? 0;
  if (ep && typeof ep.toNumber === "function") return ep.toNumber();
  return Number(ep ?? 0);
}

export function getNormalizedResources(game, sellCredit) {
  return { money: normalizeMoney(game, sellCredit), ep: normalizeEp(game) };
}

export function getPartCost(part, cell) {
  const cost = part.cost != null && part.cost.gte ? part.cost.mul(cell.lvl || 1) : (part.cost ?? 0) * (cell.lvl || 1);
  const costNum = typeof cost === "number" ? cost : (cost?.toNumber?.() ?? Number(cost));
  return { cost, costNum };
}

export function allocateIfAffordable(money, ep, part, cost, costNum, gte, sub) {
  if (part.erequires) {
    if (gte(ep, costNum)) return { newMoney: money, newEp: typeof ep === "number" ? ep - costNum : sub(ep, cost), allocated: true };
    return { newMoney: money, newEp: ep, allocated: false };
  }
  if (gte(money, costNum)) return { newMoney: typeof money === "number" ? money - costNum : sub(money, cost), newEp: ep, allocated: true };
  return { newMoney: money, newEp: ep, allocated: false };
}
