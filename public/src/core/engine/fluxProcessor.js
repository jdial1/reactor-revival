import { toDecimal } from "../../utils/decimal.js";
import { updateDecimal } from "../store.js";
import {
  FLUX_ACCUMULATOR_POWER_RATIO_MIN,
  FLUX_ACCUMULATOR_EP_RATE,
  REALITY_FLUX_RATE_PROTIUM,
  REALITY_FLUX_RATE_NEFASTIUM,
  REALITY_FLUX_RATE_BLACK_HOLE,
} from "../constants.js";

export function processFluxAccumulators(engine, multiplier) {
  const reactor = engine.game.reactor;
  const game = engine.game;

  let fluxLevel = reactor.flux_accumulator_level;
  if (!fluxLevel && engine.game.upgradeset) {
    const upg = engine.game.upgradeset.getUpgrade("flux_accumulators");
    if (upg) fluxLevel = upg.level;
  }
  if (fluxLevel <= 0 || !reactor.max_power.gt(0)) return;

  const powerRatio = reactor.current_power.div(reactor.max_power).toNumber();
  if (powerRatio < FLUX_ACCUMULATOR_POWER_RATIO_MIN) return;

  let activeCaps = 0;
  for (let j = 0; j < engine.active_vessels.length; j++) {
    const t = engine.active_vessels[j];
    if (t.part?.category === 'capacitor') {
      const capLevel = t.part.level || 1;
      activeCaps += capLevel;
    }
  }

  const epGain = FLUX_ACCUMULATOR_EP_RATE * fluxLevel * activeCaps * multiplier;
  if (epGain > 0) {
    game.exoticParticleManager.exotic_particles = game.exoticParticleManager.exotic_particles.add(epGain);
    updateDecimal(game.state, "total_exotic_particles", (d) => d.add(epGain));
    updateDecimal(game.state, "current_exotic_particles", (d) => d.add(epGain));
  }
}

export function processRealityFlux(engine, multiplier) {
  const game = engine.game;
  const activeTiles = game.tileset?.active_tiles_list;
  if (!activeTiles?.length) return;

  let realityFluxGain = 0;
  for (let i = 0; i < activeTiles.length; i++) {
    const part = activeTiles[i].part;
    if (!part) continue;
    if (part.type === "protium") realityFluxGain += REALITY_FLUX_RATE_PROTIUM;
    else if (part.type === "nefastium") realityFluxGain += REALITY_FLUX_RATE_NEFASTIUM;
    else if (part.id === "particle_accelerator6") realityFluxGain += REALITY_FLUX_RATE_BLACK_HOLE;
  }
  realityFluxGain *= multiplier;
  if (realityFluxGain > 0) {
    const add = toDecimal(realityFluxGain);
    updateDecimal(game.state, "reality_flux", (d) => d.add(add));
  }
}
