// tests/game.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Game } from "../js/game.js";
import { UI } from "../js/ui.js";
import { setupGame } from "./helpers/setup.js";

describe("Reactor Game Integration Test Suite", () => {
  let game;

  beforeEach(async () => {
    // We get a fresh, fully initialized game instance for each test
    game = await setupGame();
  });

  describe("Core Gameplay Loop", () => {
    it("Uranium Cell should generate power and heat on tick", async () => {
      const cellPart = game.partset.getPartById("uranium1");
      const tile = game.tileset.getTile(0, 0);
      await tile.setPart(cellPart);

      const initialTicks = tile.ticks;

      // Run a single game tick
      game.engine.tick();

      expect(game.reactor.current_power).toBe(cellPart.power);
      // Heat has a small natural decay, so we use toBeCloseTo
      expect(game.reactor.current_heat).toBeCloseTo(
        cellPart.heat - game.reactor.max_heat / 10000
      );
      expect(tile.ticks).toBe(initialTicks - 1);
    });

    it("Component with 0 ticks should be removed", async () => {
      const cellPart = game.partset.getPartById("uranium1");
      const tile = game.tileset.getTile(0, 0);
      await tile.setPart(cellPart);
      tile.ticks = 1; // Set to 1 to be depleted after one tick

      game.engine.tick();

      expect(tile.part).toBeNull();
    });
  });

  describe("Part Interactions", () => {
    it("Neutron Reflector should increase adjacent cell power output", async () => {
      const cellPart = game.partset.getPartById("uranium1");
      const reflectorPart = game.partset.getPartById("reflector1");

      await game.tileset.getTile(0, 0).setPart(cellPart);
      await game.tileset.getTile(0, 1).setPart(reflectorPart);

      game.reactor.updateStats(); // Recalculate stats with new parts

      const expectedPower =
        cellPart.power * (1 + reflectorPart.power_increase / 100);
      expect(game.reactor.stats_power).toBeCloseTo(expectedPower);
    });

    it("Heat Exchanger should balance heat with an adjacent component", async () => {
      const exchangerPart = game.partset.getPartById("heat_exchanger1");
      const coolantPart = game.partset.getPartById("coolant_cell1");

      const exchangerTile = game.tileset.getTile(1, 1);
      const coolantTile = game.tileset.getTile(1, 0);
      await exchangerTile.setPart(exchangerPart);
      await coolantTile.setPart(coolantPart);

      // Setup initial heat conditions
      exchangerTile.heat_contained = 100;
      coolantTile.heat_contained = 0;

      game.reactor.updateStats(); // This populates neighbor lists
      game.engine.tick();

      const transferRate = exchangerTile.getEffectiveTransferValue();
      const heatToMove = Math.min(transferRate, (100 - 0) / 2);

      expect(exchangerTile.heat_contained).toBe(100 - heatToMove);
      expect(coolantTile.heat_contained).toBe(0 + heatToMove);
    });
  });

  describe("Upgrade and Part Interactions", () => {
    it('"Potent Uranium Cell" upgrade should double uranium cell power', () => {
      const cellPart = game.partset.getPartById("uranium1");
      const initialPower = cellPart.power;

      game.upgradeset.purchaseUpgrade("uranium1_cell_power");

      // The purchase action should trigger the necessary updates.
      // We re-fetch the part to ensure we have the updated instance.
      const upgradedPart = game.partset.getPartById("uranium1");

      expect(upgradedPart.power).toBe(initialPower * 2);
    });

    it('"Active Venting" should boost vents based on adjacent capacitors', async () => {
      const ventPart = game.partset.getPartById("vent1");
      const capacitorPart = game.partset.getPartById("capacitor1");

      const ventTile = game.tileset.getTile(1, 1);
      await ventTile.setPart(ventPart);
      await game.tileset.getTile(1, 0).setPart(capacitorPart); // Adjacent capacitor

      const initialVentValue = ventTile.getEffectiveVentValue();

      const upgrade = game.upgradeset.getUpgrade("active_venting");
      game.upgradeset.purchaseUpgrade(upgrade.id);

      game.reactor.updateStats(); // Update neighbors and multipliers

      const capacitorLevel = capacitorPart.part.level;
      const expectedVentRate =
        initialVentValue * (1 + (upgrade.level * capacitorLevel) / 100);

      expect(ventTile.getEffectiveVentValue()).toBeCloseTo(expectedVentRate);
    });

    it('Depleted perpetual parts should be auto-replaced if "Auto Buy" is on', async () => {
      // Set the auto_buy state to true
      game.ui.stateManager.setVar("auto_buy", true);

      // Get the parts and the perpetual upgrade
      const reflectorPart = game.partset.getPartById("reflector1");
      const cellPart = game.partset.getPartById("uranium1");
      game.upgradeset.purchaseUpgrade("perpetual_reflectors");

      // Set up the tile with the reflector
      const tile = game.tileset.getTile(0, 0);
      await tile.setPart(reflectorPart);

      // **** FIX: Place a cell next to the reflector to trigger its tick consumption ****
      const cellTile = game.tileset.getTile(0, 1);
      await cellTile.setPart(cellPart);
      game.reactor.updateStats(); // Ensure neighbors are calculated

      const moneyBefore = game.current_money;
      const initialTicks = tile.part.ticks; // Will be 100

      // Set the reflector's ticks to 1 so the next pulse depletes it
      tile.ticks = 1;

      // Run the game engine tick. The cell at (0,1) will pulse, consuming the reflector's last tick.
      game.engine.tick();

      // Assertions
      // The part should still be there because it was auto-replaced
      expect(tile.part).not.toBeNull();
      // The ticks should be reset to the part's initial value
      expect(tile.ticks).toBe(initialTicks);
      // The cost of replacement should be deducted from the player's money
      expect(game.current_money).toBe(moneyBefore - reflectorPart.cost * 1.5);
    });
  });
});
