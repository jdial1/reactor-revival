import { toNumber } from "../utils/decimal.js";

export function getCurrentMoney(game) {
  return game?.economyManager?.getCurrentMoney?.() ?? game?.state?.current_money ?? 0;
}

export function getCurrentHeat(game) {
  const reactor = game?.reactor;
  if (!reactor) return 0;
  const heat = reactor.current_heat;
  return heat != null && typeof heat.toNumber === "function" ? heat.toNumber() : Number(heat ?? 0);
}

export function getCurrentPower(game) {
  const reactor = game?.reactor;
  if (!reactor) return 0;
  const power = reactor.current_power;
  return power != null && typeof power.toNumber === "function" ? power.toNumber() : Number(power ?? 0);
}

export function getMaxHeat(game) {
  const reactor = game?.reactor;
  if (!reactor) return 0;
  const heat = reactor.max_heat;
  return heat != null && typeof heat.toNumber === "function" ? heat.toNumber() : Number(heat ?? 0);
}

export function getMaxPower(game) {
  const reactor = game?.reactor;
  if (!reactor) return 0;
  const power = reactor.max_power;
  return power != null && typeof power.toNumber === "function" ? power.toNumber() : Number(power ?? 0);
}

export function getExoticParticles(game) {
  return toNumber(game?.exoticParticleManager?.exotic_particles) ?? 0;
}

export function getCurrentExoticParticles(game) {
  return toNumber(game?.state?.current_exotic_particles) ?? 0;
}

export function getAffordableUpgrades(game) {
  if (!game?.upgradeset) return [];
  return game.upgradeset.getAllUpgrades?.()?.filter((u) => u.affordable) ?? [];
}
