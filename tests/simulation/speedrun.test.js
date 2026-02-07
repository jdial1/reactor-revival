import { describe, it, expect, vi } from "vitest";
import { setupGameWithDOM } from "../helpers/setup.js";
import objective_list_data from "../../public/data/objective_list.json";

function clickDOM(selector) {
  document.querySelector(selector)?.click();
}

async function placePartViaUI(game, partId, row, col) {
  const part = game.partset.getPartById(partId);
  if (!part) throw new Error(`Part ${partId} not found`);
  const tile = game.tileset.getTile(row, col);
  if (!tile) throw new Error(`Tile ${row},${col} not found`);
  game.ui.stateManager.setClickedPart(part);
  await game.ui.handleGridInteraction(tile, { button: 0, pointerType: "mouse", type: "pointerdown" });
  game.ui.stateManager.setClickedPart(null);
}

function buyUpgradeViaUI(game, upgradeId, level = 1) {
  game.current_money = Math.max(game.current_money, 1e30);
  game.current_exotic_particles = Math.max(game.current_exotic_particles, 1e20);
  game.ui.stateManager.setVar("current_money", game.current_money);
  game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
  game.upgradeset.check_affordability(game);
  const upgrade = game.upgradeset.getUpgrade(upgradeId);
  if (!upgrade) throw new Error(`Upgrade ${upgradeId} not found`);
  for (let i = 0; i < level && upgrade.level < upgrade.max_level; i++) {
    if (!game.upgradeset.purchaseUpgrade(upgradeId)) break;
  }
}

async function solveObjective(index, game) {
  game.current_money = 1e30;
  game.current_exotic_particles = 1e20;
  game.ui.stateManager.setVar("current_money", game.current_money);
  game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
  game.paused = false;
  game.ui.stateManager.setVar("pause", false);

  const obj = game.objectives_manager.objectives_data[index];
  const checkId = obj?.checkId;

  switch (checkId) {
    case "firstCell":
      await placePartViaUI(game, "uranium1", 0, 0);
      game.engine.tick();
      game.reactor.updateStats();
      game.tileset.updateActiveTiles();
      break;
    case "sellPower":
      await placePartViaUI(game, "uranium1", 0, 0);
      game.engine.tick();
      game.reactor.updateStats();
      clickDOM("#info_bar_power_btn");
      clickDOM("#info_bar_power_btn_desktop");
      break;
    case "reduceHeat":
      await placePartViaUI(game, "uranium1", 0, 0);
      game.engine.tick();
      while (game.reactor.current_heat > 0) {
        game.manual_reduce_heat_action();
        await vi.advanceTimersByTimeAsync(16);
      }
      break;
    case "ventNextToCell":
      await placePartViaUI(game, "uranium1", 0, 0);
      game.tileset.getTile(0, 0).activated = true;
      game.tileset.getTile(0, 0).ticks = 15;
      await placePartViaUI(game, "vent1", 0, 1);
      game.reactor.updateStats();
      break;
    case "purchaseUpgrade":
      buyUpgradeViaUI(game, "chronometer");
      break;
    case "purchaseDualCell":
      await placePartViaUI(game, "uranium2", 1, 0);
      game.tileset.getTile(1, 0).activated = true;
      game.tileset.getTile(1, 0).ticks = 15;
      game.engine.tick();
      game.reactor.updateStats();
      break;
    case "tenActiveCells":
      for (let i = 0; i < 10; i++) {
        await placePartViaUI(game, "uranium1", 0, i);
        game.tileset.getTile(0, i).activated = true;
        game.tileset.getTile(0, i).ticks = 15;
      }
      game.engine.tick();
      game.reactor.updateStats();
      game.tileset.updateActiveTiles();
      break;
    case "perpetualUranium":
      buyUpgradeViaUI(game, "uranium1_cell_perpetual");
      break;
    case "increaseMaxPower":
      await placePartViaUI(game, "capacitor1", 2, 0);
      break;
    case "completeChapter1":
      break;
    case "powerPerTick200":
      game.tileset.clearAllTiles();
      game.engine.markPartCacheAsDirty();
      for (let i = 0; i < 5; i++) {
        await placePartViaUI(game, "plutonium1", 0, i);
        game.tileset.getTile(0, i).activated = true;
        game.tileset.getTile(0, i).ticks = 60;
      }
      game.tileset.updateActiveTiles();
      game.engine.tick();
      game.reactor.updateStats();
      break;
    case "improvedChronometers": {
      const chrono = game.upgradeset.getUpgrade("chronometer");
      if (!chrono || chrono.level === 0) buyUpgradeViaUI(game, "chronometer");
      break;
    }
    case "fiveComponentKinds":
      await placePartViaUI(game, "uranium1", 0, 0);
      await placePartViaUI(game, "vent1", 0, 1);
      await placePartViaUI(game, "capacitor1", 0, 2);
      await placePartViaUI(game, "reflector1", 0, 3);
      await placePartViaUI(game, "heat_exchanger1", 0, 4);
      game.reactor.updateStats();
      break;
    case "tenCapacitors":
      for (let i = 0; i < 10; i++) await placePartViaUI(game, "capacitor1", 1, i);
      break;
    case "powerPerTick500":
      for (let i = 0; i < 10; i++) {
        await placePartViaUI(game, "plutonium1", 0, i);
        game.tileset.getTile(0, i).activated = true;
        game.tileset.getTile(0, i).ticks = 60;
      }
      game.engine.tick();
      game.reactor.updateStats();
      break;
    case "potentUranium3":
      buyUpgradeViaUI(game, "uranium1_cell_power", 3);
      break;
    case "autoSell500":
      game.ui.stateManager.setVar("auto_sell", true);
      buyUpgradeViaUI(game, "improved_power_lines", 50);
      for (let i = 0; i < 10; i++) await placePartViaUI(game, "capacitor1", 0, i);
      for (let i = 0; i < 5; i++) {
        await placePartViaUI(game, "plutonium1", 1, i);
        game.tileset.getTile(1, i).activated = true;
        game.tileset.getTile(1, i).ticks = 60;
      }
      game.engine.tick();
      game.reactor.updateStats();
      game.reactor.stats_cash = 501;
      break;
    case "sustainedPower1k": {
      const plutonium3 = game.partset.getPartById("plutonium3");
      for (let i = 0; i < 8; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(plutonium3);
        tile.activated = true;
        tile.ticks = 60;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.reactor.updateStats();
      game.sustainedPower1k = { startTime: Date.now() - 31000 };
      await vi.advanceTimersByTimeAsync(31000);
      game.objectives_manager.check_current_objective();
      break;
    }
    case "infrastructureUpgrade1":
      for (let i = 0; i < 10; i++) {
        await placePartViaUI(game, "capacitor2", 0, i);
        game.tileset.getTile(0, i).activated = true;
      }
      for (let i = 0; i < 10; i++) {
        await placePartViaUI(game, "vent2", 1, i);
        game.tileset.getTile(1, i).activated = true;
      }
      game.reactor.updateStats();
      break;
    case "completeChapter2":
      break;
    case "fiveQuadPlutonium": {
      const plutonium3 = game.partset.getPartById("plutonium3");
      for (let i = 0; i < 5; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(plutonium3);
        tile.activated = true;
        tile.ticks = 60;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.reactor.updateStats();
      game.objectives_manager.check_current_objective();
      break;
    }
    case "incomeMilestone50k":
      game.ui.stateManager.setVar("auto_sell", true);
      buyUpgradeViaUI(game, "improved_power_lines", 50);
      for (let i = 0; i < 8; i++) {
        await placePartViaUI(game, "plutonium3", 0, i);
        game.tileset.getTile(0, i).activated = true;
        game.tileset.getTile(0, i).ticks = 60;
      }
      for (let i = 0; i < 10; i++) await placePartViaUI(game, "capacitor1", 1, i);
      game.engine.tick();
      game.reactor.updateStats();
      game.reactor.stats_cash = 60000;
      break;
    case "powerPerTick10k": {
      const thorium1 = game.partset.getPartById("thorium1");
      for (let i = 0; i < 10; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(thorium1);
        tile.activated = true;
        tile.ticks = 900;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.engine.tick();
      game.reactor.updateStats();
      break;
    }
    case "unlockThorium": {
      const thorium3 = game.partset.getPartById("thorium3");
      for (let i = 0; i < 5; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(thorium3);
        tile.activated = true;
        tile.ticks = 900;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.reactor.updateStats();
      game.objectives_manager.check_current_objective();
      break;
    }
    case "firstBillion":
      game.current_money = 1e9;
      game.ui.stateManager.setVar("current_money", game.current_money);
      break;
    case "money10B":
      game.current_money = 1e10;
      game.ui.stateManager.setVar("current_money", game.current_money);
      break;
    case "unlockSeaborgium": {
      const seaborgium3 = game.partset.getPartById("seaborgium3");
      for (let i = 0; i < 5; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(seaborgium3);
        tile.activated = true;
        tile.ticks = 3600;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.reactor.updateStats();
      game.objectives_manager.check_current_objective();
      break;
    }
    case "masterHighHeat":
      for (let i = 0; i < 8; i++) {
        await placePartViaUI(game, "plutonium3", 0, i);
        game.tileset.getTile(0, i).activated = true;
        game.tileset.getTile(0, i).ticks = 60;
      }
      game.engine.tick();
      game.reactor.updateStats();
      game.reactor.current_heat = 15000000;
      game.reactor.has_melted_down = false;
      game.masterHighHeat = { startTime: Date.now() - 301000 };
      await vi.advanceTimersByTimeAsync(301000);
      break;
    case "ep10":
      game.exotic_particles = 10;
      game.ui.stateManager.setVar("exotic_particles", 10);
      break;
    case "completeChapter3":
      break;
    case "ep51":
      game.exotic_particles = 51;
      game.ui.stateManager.setVar("exotic_particles", 51);
      break;
    case "ep250":
      game.exotic_particles = 250;
      game.ui.stateManager.setVar("exotic_particles", 250);
      break;
    case "investInResearch1":
      buyUpgradeViaUI(game, "laboratory");
      game.current_exotic_particles = 1000;
      game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
      game.upgradeset.check_affordability(game);
      buyUpgradeViaUI(game, "infused_cells");
      buyUpgradeViaUI(game, "unleashed_cells");
      break;
    case "reboot":
      game.exotic_particles = 10;
      game.total_exotic_particles = 10;
      game.current_exotic_particles = 10;
      game.ui.stateManager.setVar("exotic_particles", 10);
      game.ui.stateManager.setVar("total_exotic_particles", 10);
      await game.reboot_action(true);
      game.exotic_particles = 0;
      game.current_money = game.base_money;
      game.ui.stateManager.setVar("exotic_particles", 0);
      game.ui.stateManager.setVar("current_money", game.current_money);
      game.objectives_manager.current_objective_index = index;
      game.objectives_manager.set_objective(index, true);
      game.objectives_manager.check_current_objective();
      break;
    case "experimentalUpgrade":
      buyUpgradeViaUI(game, "laboratory");
      game.current_exotic_particles = 10000;
      game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
      game.upgradeset.check_affordability(game);
      buyUpgradeViaUI(game, "infused_cells");
      break;
    case "fiveQuadDolorium": {
      const dolorium3 = game.partset.getPartById("dolorium3");
      for (let i = 0; i < 5; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(dolorium3);
        tile.activated = true;
        tile.ticks = 22000;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.reactor.updateStats();
      game.objectives_manager.check_current_objective();
      break;
    }
    case "ep1000":
      game.exotic_particles = 1000;
      game.ui.stateManager.setVar("exotic_particles", 1000);
      break;
    case "fiveQuadNefastium": {
      const nefastium3 = game.partset.getPartById("nefastium3");
      for (let i = 0; i < 5; i++) {
        const tile = game.tileset.getTile(0, i);
        await tile.setPart(nefastium3);
        tile.activated = true;
        tile.ticks = 86000;
      }
      game.tileset.updateActiveTiles();
      game.engine.markPartCacheAsDirty();
      game.reactor.updateStats();
      game.objectives_manager.check_current_objective();
      break;
    }
    case "placeExperimentalPart":
      buyUpgradeViaUI(game, "laboratory");
      game.current_exotic_particles = 100;
      game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
      game.upgradeset.check_affordability(game);
      buyUpgradeViaUI(game, "protium_cells");
      await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("protium1"));
      break;
    case "completeChapter4":
      break;
    case "allObjectives":
      break;
    default:
      throw new Error(`Unknown checkId: ${checkId}`);
  }
}

async function waitForObjectiveCompletion(game, maxTicks = 1000) {
  let ticks = 0;
  while (
    !game.objectives_manager.current_objective_def?.completed &&
    ticks < maxTicks
  ) {
    game.engine.tick();
    game.reactor.updateStats();
    game.objectives_manager.check_current_objective();
    await vi.advanceTimersByTimeAsync(16);
    ticks++;
  }
  if (ticks >= maxTicks) {
    throw new Error(
      `Objective timed out after ${maxTicks} ticks: ${game.objectives_manager.current_objective_def?.title}`
    );
  }
}

describe("End-to-End Speed Run (DOM Simulation)", () => {
  it("should complete all objectives in sequence via DOM interactions", async () => {
    vi.useFakeTimers();

    const setup = await setupGameWithDOM();
    const game = setup.game;
    const ui = game.ui;
    const doc = setup.document;

    game.bypass_tech_tree_restrictions = true;
    game.current_money = 1e30;
    game.current_exotic_particles = 1e20;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
    game.partset.check_affordability(game);
    game.upgradeset.check_affordability(game);

    window.game = game;
    game.objectives_manager.disableTimers = true;
    ui._renderVisualEvents = () => {};

    await game.router.loadPage("upgrades_section");
    await game.router.loadPage("reactor_section");

    if (game.engine && !game.engine.running) {
      game.paused = false;
      game.engine.start();
    }

    game.tileset.tiles_list.forEach((tile) => {
      if (!tile.$el) {
        const el = doc.createElement("div");
        el.className = "tile";
        el.tile = tile;
        tile.$el = el;
      }
    });

    game.objectives_manager.current_objective_index = 0;
    game.objectives_manager.start();
    await vi.advanceTimersByTimeAsync(100);

    const totalObjectives = objective_list_data.length;
    for (let i = 0; i < totalObjectives; i++) {
      const objective = objective_list_data[i];
      expect(
        game.objectives_manager.current_objective_index,
        `Expected objective index ${i} before solving ${objective.title}`
      ).toBe(i);

      await solveObjective(i, game);

      game.objectives_manager.check_current_objective();
      game.reactor.updateStats();
      game.objectives_manager.check_current_objective();

      if (!game.objectives_manager.objectives_data[i]?.isChapterCompletion) {
        if (!game.objectives_manager.current_objective_def?.completed) {
          await waitForObjectiveCompletion(game);
        }
      }

      expect(
        game.objectives_manager.current_objective_def?.completed,
        `Objective ${i} (${objective.checkId}) should be completed: ${objective.title}`
      ).toBe(true);

      game.objectives_manager.claimObjective();
      await vi.advanceTimersByTimeAsync(600);

      if (i < totalObjectives - 2) {
        game.tileset.clearAllTiles();
        game.engine.markPartCacheAsDirty();
      }
    }

    expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
    expect(game.objectives_manager.current_objective_def?.checkId).toBe("allObjectives");

    vi.useRealTimers();
  }, 120000);
});
