import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupGame } from "../helpers/setup.js";
import { Game } from "../../js/game.js";
import { UI } from "../../js/ui.js";

// Create a temporary game instance just to generate the list of tests.
// This is NOT the instance that will be used in the `it` blocks.
const mockUiForTestGen = new UI();
const testGenGame = new Game(mockUiForTestGen);
testGenGame.tileset.initialize();
testGenGame.partset.initialize();
testGenGame.upgradeset.initialize();
const allParts = testGenGame.partset.getAllParts();
const allUpgrades = testGenGame.upgradeset.getAllUpgrades();

describe("Full Part and Upgrade Coverage", () => {
  let game;
  beforeEach(async () => {
    // Use the proper async setup for each actual test to get a clean state
    game = await setupGame();
  });

  describe.each(allParts)(
    "Part Functionality Coverage: $title (ID: $id)",
    (partTemplate) => {
      it("should be purchasable and placeable on the grid", async () => {
        const part = game.partset.getPartById(partTemplate.id);
        expect(
          part,
          `Part ${partTemplate.id} not found in test game instance`
        ).toBeDefined();

        if (part.erequires) {
          game.upgradeset.purchaseUpgrade("laboratory");
          game.upgradeset.purchaseUpgrade(part.erequires);
          game.current_exotic_particles = part.cost;
        } else {
          game.current_money = part.cost;
        }

        game.partset.check_affordability(game);
        expect(part.affordable, `Part ${part.id} should be affordable`).toBe(
          true
        );

        const tile = game.tileset.getTile(5, 5);
        await tile.setPart(part);
        expect(tile.part).toBe(part);
      });

      it("should apply its primary stats/effects correctly", async () => {
        const part = game.partset.getPartById(partTemplate.id);
        expect(
          part,
          `Part ${partTemplate.id} not found in test game instance`
        ).toBeDefined();
        const tile = game.tileset.getTile(5, 5);
        await tile.setPart(part);
        game.reactor.updateStats();

        switch (part.category) {
          case "cell":
            expect(game.reactor.stats_power).toBeCloseTo(part.power);
            expect(game.reactor.stats_heat_generation).toBeCloseTo(part.heat);
            break;
          case "reflector":
            const cellPart = game.partset.getPartById("uranium1");
            await game.tileset.getTile(5, 6).setPart(cellPart);
            game.reactor.updateStats();
            const expectedReflectorPower =
              cellPart.power * (1 + part.power_increase / 100);
            const expectedReflectorHeat =
              cellPart.heat * (1 + part.heat_increase / 100);
            expect(game.reactor.stats_power).toBeCloseTo(
              expectedReflectorPower
            );
            expect(game.reactor.stats_heat_generation).toBeCloseTo(
              expectedReflectorHeat
            );
            break;
          case "capacitor":
            expect(game.reactor.max_power).toBe(
              game.reactor.base_max_power + part.reactor_power
            );
            break;
          case "reactor_plating":
            expect(game.reactor.max_heat).toBe(
              game.reactor.base_max_heat + part.reactor_heat
            );
            if (part.id === "reactor_plating6") {
              expect(game.reactor.max_power).toBe(
                game.reactor.base_max_power + part.reactor_heat
              );
            }
            break;
          case "vent":
            // Reset all upgrades to ensure a clean state
            game.upgradeset.getAllUpgrades().forEach((upgrade) => {
              upgrade.level = 0;
            });

            // Setup the test state
            tile.heat_contained = 80;
            const ventValue = tile.getEffectiveVentValue();

            if (part.id === "vent6") {
              game.reactor.current_power = ventValue;
            }

            // Ensure tile is in active tiles list for vent processing
            tile.enable();
            // Update reactor stats to ensure tileset.active_tiles_list is populated
            game.reactor.updateStats();

            // Run the actual game logic for all vent parts
            game.engine.tick();

            // --- CORRECTED EXPECTATION LOGIC ---
            let expectedVentHeat;
            if (80 <= ventValue) {
              expectedVentHeat = 0;
            } else {
              expectedVentHeat = 80 - ventValue;
            }

            // Account for component depletion
            if (expectedVentHeat > part.containment) {
              expectedVentHeat = 0;
            }
            // --- END CORRECTION ---

            expect(tile.heat_contained).toBeCloseTo(expectedVentHeat);

            if (part.id === "vent6") {
              expect(game.reactor.current_power).toBe(0);
            }
            break;
          case "coolant_cell":
            tile.heat_contained = 100;
            game.engine.tick();
            expect(tile.heat_contained).toBe(100);
            expect(tile.part.containment).toBe(part.containment);
            break;
          case "heat_exchanger":
            const neighborTile = game.tileset.getTile(5, 6);
            await neighborTile.setPart(
              game.partset.getPartById("coolant_cell1")
            );
            tile.heat_contained = 100;
            neighborTile.heat_contained = 0;
            game.reactor.updateStats();
            game.engine.tick();
            expect(tile.heat_contained).toBeLessThan(100);
            expect(neighborTile.heat_contained).toBeGreaterThan(0);
            expect(
              tile.heat_contained + neighborTile.heat_contained
            ).toBeCloseTo(100, 0);
            break;
          case "heat_inlet":
            const sourceTile = game.tileset.getTile(5, 6);
            await sourceTile.setPart(game.partset.getPartById("coolant_cell1"));
            sourceTile.heat_contained = 100;
            game.reactor.current_heat = 0;
            game.reactor.updateStats();
            game.engine.tick();
            const transferIn = Math.min(tile.getEffectiveTransferValue(), 100);
            expect(sourceTile.heat_contained).toBeCloseTo(100 - transferIn, 0);
            expect(game.reactor.current_heat).toBeCloseTo(transferIn, 0);
            break;
          case "heat_outlet":
            const sinkTile = game.tileset.getTile(5, 6);
            await sinkTile.setPart(game.partset.getPartById("coolant_cell1"));
            game.reactor.current_heat = 100;
            game.reactor.updateStats();
            game.engine.tick();
            expect(sinkTile.heat_contained).toBeGreaterThan(0);
            expect(game.reactor.current_heat).toBeLessThan(100);
            expect(
              sinkTile.heat_contained + game.reactor.current_heat
            ).toBeCloseTo(100, 0);
            break;
          case "particle_accelerator":
            tile.heat_contained = part.ep_heat;
            game.engine.tick();
            expect(game.exotic_particles).toBeGreaterThan(0);
            break;
        }
      });
    }
  );

  describe.each(allUpgrades)(
    "Upgrade Functionality Coverage: $title (ID: $id)",
    (upgradeTemplate) => {
      it(`should correctly apply upgrade`, async () => {
        const upgrade = game.upgradeset.getUpgrade(upgradeTemplate.id);
        expect(
          upgrade,
          `Upgrade ${upgradeTemplate.id} not found in test game instance`
        ).toBeDefined();

        let preValue, postValue, part;
        const actionId = upgrade.actionId || upgrade.upgrade?.actionId;

        switch (actionId) {
          case "expand_reactor_rows":
            preValue = game.rows;
            break;
          case "expand_reactor_cols":
            preValue = game.cols;
            break;
          case "chronometer":
            preValue = game.loop_wait;
            break;
          case "improved_power_lines":
            preValue = game.reactor.auto_sell_multiplier;
            break;
          case "heat_control_operator":
            preValue = game.reactor.heat_controlled;
            break;
          case "perpetual_reflectors":
            part = game.partset.getPartById("reflector1");
            preValue = part.perpetual;
            break;
          case "cell_power":
          case "cell_tick":
          case "cell_perpetual":
            part = game.partset.getPartById(upgrade.upgrade.part.id);
            if (actionId.endsWith("power")) preValue = part.power;
            if (actionId.endsWith("tick")) preValue = part.ticks;
            if (actionId.endsWith("perpetual")) preValue = part.perpetual;
            break;
        }

        if (upgrade.base_ecost > 0) {
          // For exotic particle upgrades, ensure we have laboratory first
          if (upgrade.id !== "laboratory") {
            game.current_exotic_particles = 1;
            game.upgradeset.purchaseUpgrade("laboratory");
            if (upgrade.erequires && upgrade.erequires !== "laboratory") {
              game.upgradeset.purchaseUpgrade(upgrade.erequires);
            }
          }
          game.current_exotic_particles = upgrade.getEcost();
        } else {
          game.current_money = upgrade.getCost();
        }

        const purchased = game.upgradeset.purchaseUpgrade(upgrade.id);
        expect(purchased, `Failed to purchase ${upgrade.id}`).toBe(true);
        expect(upgrade.level).toBe(1);

        switch (actionId) {
          case "expand_reactor_rows":
            postValue = game.rows;
            expect(postValue).toBe(preValue + 1);
            break;
          case "expand_reactor_cols":
            postValue = game.cols;
            expect(postValue).toBe(preValue + 1);
            break;
          case "chronometer":
            postValue = game.loop_wait;
            expect(postValue).toBe(preValue / 2);
            break;
          case "improved_power_lines":
            postValue = game.reactor.auto_sell_multiplier;
            expect(postValue).toBe(preValue + 0.01);
            break;
          case "heat_control_operator":
            postValue = game.reactor.heat_controlled;
            expect(postValue).toBe(true);
            break;
          case "perpetual_reflectors":
            postValue = game.partset.getPartById("reflector1").perpetual;
            expect(postValue).toBe(true);
            break;
          case "cell_power":
            part = game.partset.getPartById(upgrade.upgrade.part.id);
            postValue = part.power;
            expect(postValue).toBeCloseTo(preValue * 2);
            break;
          case "cell_tick":
            part = game.partset.getPartById(upgrade.upgrade.part.id);
            postValue = part.ticks;
            expect(postValue).toBe(preValue * 2);
            break;
          case "cell_perpetual":
            part = game.partset.getPartById(upgrade.upgrade.part.id);
            postValue = part.perpetual;
            expect(postValue).toBe(true);
            break;
          default:
            // For upgrades with no specific pre/post value check, just ensure it was purchased
            expect(upgrade.level).toBe(1);
        }
      });
    }
  );
});
