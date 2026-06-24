import { toDecimal, toNumber } from "../simUtils.js";
import { updateDecimal } from "../state/decimal-sync.js";

export function debitMoney(game, amount) {
  const n = Number(amount) || 0;
  if (!game?.state || n <= 0) return;
  updateDecimal(game.state, "current_money", (d) => d.sub(toDecimal(n)));
}

export function creditMoney(game, amount) {
  const n = Number(amount) || 0;
  if (!game?.state || n <= 0) return;
  updateDecimal(game.state, "current_money", (d) => d.add(toDecimal(n)));
}

export function debitExoticParticles(game, amount) {
  const n = Number(amount) || 0;
  if (!game?.state || n <= 0) return;
  updateDecimal(game.state, "current_exotic_particles", (d) => d.sub(toDecimal(n)));
}

export function tryDebitMoney(game, amount) {
  const n = Number(amount) || 0;
  if (!game?.state || n <= 0) {
    return { ok: true, balanceAfter: toNumber(game?.state?.current_money) };
  }
  const d0 = toDecimal(game.state.current_money);
  if (!d0.gte(n)) {
    return { ok: false, balanceAfter: toNumber(game.state.current_money) };
  }
  debitMoney(game, n);
  return { ok: true, balanceAfter: toNumber(game.state.current_money) };
}

export function applyTransactionDeltas(game, moneyDelta = 0, epDelta = 0) {
  if (!game?.state) {
    return { ok: true, balanceAfter: 0, epAfter: 0 };
  }
  const mDelta = Number(moneyDelta) || 0;
  const eDelta = Number(epDelta) || 0;
  const m0 = toDecimal(game.state.current_money);
  const e0 = toDecimal(game.state.total_exotic_particles);
  const mOk = mDelta >= 0 || m0.gte(Math.abs(mDelta));
  const eOk = eDelta >= 0 || e0.gte(Math.abs(eDelta));
  const ok = mOk && eOk;
  if (ok) {
    if (mDelta !== 0) updateDecimal(game.state, "current_money", (d) => d.add(mDelta));
    if (eDelta !== 0) updateDecimal(game.state, "total_exotic_particles", (d) => d.add(eDelta));
  }
  return {
    ok,
    balanceAfter: toNumber(game.state.current_money),
    epAfter: toNumber(game.state.total_exotic_particles),
  };
}

export function creditMoneyWithPrestige(game, amount) {
  if (!game?.state) return;
  const multiplier = typeof game.getPrestigeMultiplier === "function" ? game.getPrestigeMultiplier() : 1;
  const delta = toDecimal(amount).mul(multiplier);
  if (delta.lte(0)) return;
  updateDecimal(game.state, "current_money", (d) => d.add(delta));
}

export function recordSessionPowerSold(game, amount) {
  const n = toDecimal(amount);
  if (!game?.state || n.lte(0)) return;
  updateDecimal(game.state, "session_power_sold", (d) => d.add(n));
}

export function recordSessionHeatDissipated(game, amount) {
  const n = toDecimal(amount);
  if (!game?.state || n.lte(0)) return;
  updateDecimal(game.state, "session_heat_dissipated", (d) => d.add(n));
}

export function recordSessionPowerProduced(game, amount) {
  const n = toDecimal(amount);
  if (!game?.state || n.lte(0)) return;
  updateDecimal(game.state, "session_power_produced", (d) => d.add(n));
}

export function enqueueDebitMoney(game, amount) {
  if (!game?.state) return;
  game.state.intent_queue.push({
    action: "DEBIT_MONEY",
    timestamp: Date.now(),
    payload: { amount },
  });
  game.engine?._processIntentQueue?.();
}

export function enqueueCreditMoney(game, amount) {
  if (!game?.state) return;
  game.state.intent_queue.push({
    action: "CREDIT_MONEY",
    timestamp: Date.now(),
    payload: { amount },
  });
  game.engine?._processIntentQueue?.();
}

export function enqueueDebitLayoutCost(game, { money = 0, ep = 0 } = {}) {
  if (!game?.state) return;
  if (money <= 0 && ep <= 0) return;
  game.state.intent_queue.push({
    action: "DEBIT_LAYOUT_COST",
    timestamp: Date.now(),
    payload: { money, ep },
  });
  game.engine?._processIntentQueue?.();
}
