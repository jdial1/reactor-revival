import { createGameSession } from "reactor-core-lib";

export async function setupSessionOnly(opts = {}) {
  const session = await createGameSession({ gameId: opts.gameId ?? "reactor_revival" });
  if (opts.money != null && typeof session.creditMoney === "function") {
    session.creditMoney(opts.money);
  }
  if (opts.paused != null) session.setPaused(!!opts.paused);
  else session.setPaused(false);
  if (opts.clearGrace !== false) {
    session.systems?.failure?.setGracePeriodTicks?.(0);
  }
  return session;
}

export function tileHeatAt(session, row, col) {
  const snap = session.getSnapshot();
  const idx = row * snap.grid.cols + col;
  return Number(snap.grid.tileHeat?.heat?.[idx] ?? 0);
}

export function setSessionTileHeat(session, row, col, heat) {
  session.grid.setTileHeat(row, col, Number(heat));
}

export function reactorHeat(session) {
  return Number(session.grid.currentHeat ?? 0);
}

export function reactorMaxHeat(session) {
  return Number(session.grid.maxHeat ?? 0);
}

export function setSessionReactorHeat(session, heat) {
  session.grid.currentHeat = Number(heat);
}

export function hasMeltedDown(session) {
  return !!session.getSnapshot().hasMeltedDown;
}

export function setSessionGraceTicks(session, ticks) {
  session.systems?.failure?.setGracePeriodTicks?.(Math.max(0, Math.floor(Number(ticks) || 0)));
}

export function sessionGraceTicks(session) {
  return Number(session.getSnapshot().gracePeriodTicks ?? 0);
}

export function displayRatesAt(session, row, col) {
  const inst = session.grid.getComponentAt(row, col);
  if (!inst || typeof session.resolveDisplayRates !== "function") return null;
  return session.resolveDisplayRates(inst);
}

export function transferRateAt(session, row, col) {
  return Number(displayRatesAt(session, row, col)?.transfer ?? 0);
}

export function ventRateAt(session, row, col) {
  return Number(displayRatesAt(session, row, col)?.vent ?? 0);
}

export function containmentAt(session, row, col) {
  return Number(displayRatesAt(session, row, col)?.containment ?? 0);
}

export function setSessionToggle(session, toggleName, value) {
  return session.runCommand({
    type: "SET_TOGGLE",
    payload: { toggleName, value: !!value },
  });
}

export function purchaseSessionUpgrade(session, id) {
  if (typeof session.purchaseUpgrade === "function") {
    return session.purchaseUpgrade(id);
  }
  return session.runCommand({ type: "PURCHASE_UPGRADE", payload: { id } });
}

export function heatSegmentAt(session, row, col) {
  return session.getHeatSegmentAt?.(row, col) ?? null;
}

export function componentTicksAt(session, row, col) {
  return Number(session.grid.getComponentAt(row, col)?.ticks ?? 0);
}

export function sessionEconomy(session) {
  return session.getSnapshot().economy ?? {};
}

export function sessionEp(session) {
  const e = sessionEconomy(session);
  return {
    current: Number(e.currentExoticParticles ?? 0),
    total: Number(e.totalExoticParticles ?? 0),
    sessionPower: Number(e.sessionPowerProduced ?? 0),
    sessionHeat: Number(e.sessionHeatDissipated ?? 0),
    money: Number(e.money ?? 0),
  };
}

export function setSessionEconomy(session, patch = {}) {
  const prev = session.systems?.economy?.serialize?.() ?? {};
  session.systems?.economy?.deserialize?.({
    ...prev,
    ...patch,
  });
}
