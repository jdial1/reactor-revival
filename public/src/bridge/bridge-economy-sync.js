import { toNumber } from "../simUtils.js";
import { assertNotTickInFlight } from "./tick-commit.js";

export function hydrateEconomyFromHost(bridge) {
  assertNotTickInFlight(bridge, "hydrateEconomyFromHost");
  if (!bridge.session?.loadEconomyState || !bridge.game) return;
  const game = bridge.game;
  bridge.session.loadEconomyState({
    money: toNumber(game.state?.current_money ?? game.current_money),
    currentExoticParticles: toNumber(
      game.current_exotic_particles ?? game.state?.current_exotic_particles,
    ),
    totalExoticParticles: toNumber(game.state?.total_exotic_particles),
    sessionPowerProduced: toNumber(game.state?.session_power_produced),
    sessionPowerSold: toNumber(game.state?.session_power_sold),
    sessionHeatDissipated: toNumber(game.state?.session_heat_dissipated),
    soldHeat: game.sold_heat,
    protiumParticles: toNumber(game.protium_particles ?? 0),
  });
}
