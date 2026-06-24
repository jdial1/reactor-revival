import { updateDecimal } from "../state/decimal-sync.js";
import { toDecimal } from "../simUtils.js";

export function grantExoticParticles(game, amount) {
  if (!game || amount == null) return;
  const delta = toDecimal(amount);
  if (delta.lte(0)) return;
  game.exoticParticleManager.exotic_particles = game.exoticParticleManager.exotic_particles.add(delta);
  updateDecimal(game.state, "total_exotic_particles", (d) => d.add(delta));
  updateDecimal(game.state, "current_exotic_particles", (d) => d.add(delta));
  game.reactor?.updateStats?.();
}

export function grantMoneyFlat(game, amount) {
  if (!game || amount == null) return;
  const delta = toDecimal(amount);
  if (delta.lte(0)) return;
  updateDecimal(game.state, "current_money", (d) => d.add(delta));
}

export function grantReward(game, { money, ep } = {}) {
  if (money != null) grantMoneyFlat(game, money);
  else if (ep != null) grantExoticParticles(game, ep);
}

export function grantObjectiveReward(game, objectiveDef) {
  enqueueGrantReward(game, objectiveDef);
}

export function enqueueGrantReward(game, objectiveDef) {
  if (!game?.state || !objectiveDef) return;
  const payload = {};
  if (objectiveDef.reward) payload.money = objectiveDef.reward;
  else if (objectiveDef.ep_reward) payload.ep = objectiveDef.ep_reward;
  else return;
  game.state.intent_queue.push({
    action: "GRANT_REWARD",
    timestamp: Date.now(),
    payload,
  });
  game.engine?._processIntentQueue?.();
}
