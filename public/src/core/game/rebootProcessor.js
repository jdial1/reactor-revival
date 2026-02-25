import { toDecimal } from "../../utils/decimal.js";
import { setDecimal } from "../store.js";

function captureRebootState(game, keep_exotic_particles) {
  const savedTotalEp = game.state.total_exotic_particles;
  const savedCurrentEp = game.state.current_exotic_particles;
  const savedProtiumParticles = game.protium_particles;
  const preservedEpUpgrades = keep_exotic_particles
    ? game.upgradeset.getAllUpgrades()
        .filter((upg) => upg.base_ecost && upg.level > 0)
        .map((upg) => ({ id: upg.id, level: upg.level }))
    : [];
  return { savedTotalEp, savedCurrentEp, savedProtiumParticles, preservedEpUpgrades };
}

async function applyDefaults(game, savedProtiumParticles) {
  await game.set_defaults();
  game.protium_particles = savedProtiumParticles;
}

function clearState(game) {
  game.reactor.clearMeltdownState();
  game.emit?.("clearAnimations");
}

function restoreExoticParticles(game, keep_exotic_particles, savedTotalEp, savedCurrentEp, preservedEpUpgrades) {
  if (keep_exotic_particles) {
    setDecimal(game.state, "total_exotic_particles", savedTotalEp);
    setDecimal(game.state, "current_exotic_particles", savedCurrentEp);
  } else {
    setDecimal(game.state, "total_exotic_particles", toDecimal(0));
    setDecimal(game.state, "current_exotic_particles", toDecimal(0));
    setDecimal(game.state, "reality_flux", toDecimal(0));
  }
  if (keep_exotic_particles && preservedEpUpgrades.length > 0) {
    preservedEpUpgrades.forEach(({ id, level }) => {
      const upg = game.upgradeset.getUpgrade(id);
      if (upg) upg.setLevel(level);
    });
  }
}

function refreshUI(game) {
  const payload = {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    reality_flux: game.state.reality_flux
  };
  game.emit?.("exoticParticlesChanged", payload);
  game.reactor.updateStats();
  game.upgradeset.check_affordability(game);
  game.partset.check_affordability(game);
  game.emit?.("partsPanelRefresh");
}

function refreshObjective(game) {
  if (game.objectives_manager) game.objectives_manager.check_current_objective();
}

async function runRebootActionInternal(game, keep_exotic_particles) {
  game.debugHistory.add('game', 'Reboot action initiated', { keep_exotic_particles });
  if (game.audio) game.audio.play('reboot');
  const { savedTotalEp, savedCurrentEp, savedProtiumParticles, preservedEpUpgrades } = captureRebootState(game, keep_exotic_particles);
  await applyDefaults(game, savedProtiumParticles);
  clearState(game);
  restoreExoticParticles(game, keep_exotic_particles, savedTotalEp, savedCurrentEp, preservedEpUpgrades);
  refreshUI(game);
  refreshObjective(game);
}

export async function runRebootActionKeepEp(game) {
  await runRebootActionInternal(game, true);
}

export async function runRebootActionDiscardEp(game) {
  await runRebootActionInternal(game, false);
}

export async function runRebootAction(game, keep_exotic_particles = false) {
  await runRebootActionInternal(game, keep_exotic_particles);
}

export async function runFullReboot(game) {
  if (game.engine && game.engine.running) game.engine.stop();
  game.paused = false;
  setDecimal(game.state, "current_money", 0);
  game.tech_tree = null;
  game.exoticParticleManager.exotic_particles = toDecimal(0);
  setDecimal(game.state, "current_exotic_particles", 0);
  game.protium_particles = 0;
  setDecimal(game.state, "total_exotic_particles", 0);
  setDecimal(game.state, "reality_flux", 0);
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
  if (game._test_grid_size) {
    game.gridManager.setRows(game._test_grid_size.rows);
    game.gridManager.setCols(game._test_grid_size.cols);
  }
  if (game.reactor) {
    game.reactor.current_heat = 0;
    game.reactor.current_power = 0;
    game.reactor.has_melted_down = false;
    if (game.emit) game.emit("meltdownResolved", { hasMeltedDown: false });
    game.reactor.updateStats();
  }
  if (game.tileset) game.tileset.clearAllTiles();
  if (game.upgradeset) {
    game.upgradeset.upgradesArray.forEach((upgrade) => {
      if (!upgrade.upgrade.type.includes("experimental")) upgrade.level = 0;
    });
  }
  const payload = {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    reality_flux: game.state.reality_flux
  };
  game.emit?.("exoticParticlesChanged", payload);
}
