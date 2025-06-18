import { numFormat as fmt } from "../js/util.js";

const objective_list_data = [
  {
    title: "Place your first component in the reactor by clicking 'Parts'",
    reward: 10,
    checkId: "firstComponent",
    check: function (game) {
      return game.tileset.active_tiles_list.some(
        (tile) => tile && tile.part && tile.activated
      );
    },
  },
  {
    title: "Sell all your power by clicking 'Power'",
    reward: 10,
    checkId: "sellPower",
    check: function (game) {
      return game.sold_power;
    },
  },
  {
    title: "Reduce your Current Heat to 0 by clicking 'Heat'",
    reward: 10,
    checkId: "reduceHeat",
    check: function (game) {
      return game.sold_heat;
    },
  },
  {
    title: "Put a Heat Vent next to a power Cell by clicking 'Parts'",
    reward: 50,
    checkId: "ventNextToCell",
    check: function (game) {
      return game.tileset.active_tiles_list.some((tile) => {
        if (
          tile &&
          tile.part &&
          tile.activated &&
          tile.part.category === "cell" &&
          tile.ticks > 0
        ) {
          for (const neighbor_tile of game.tileset.getTilesInRange(tile, 1)) {
            if (
              neighbor_tile.part &&
              neighbor_tile.activated &&
              neighbor_tile.part.category === "vent"
            ) {
              return true;
            }
          }
        }
        return false;
      });
    },
  },
  {
    title: "Purchase an Upgrade",
    reward: 100,
    checkId: "purchaseUpgrade",
    check: function (game) {
      return game.upgradeset
        .getAllUpgrades()
        .some((upgrade) => upgrade.level > 0);
    },
  },
  {
    title: "Purchase a Dual power Cell",
    reward: 25,
    checkId: "purchaseDualCell",
    check: function (game) {
      return game.tileset.tiles_list.some(
        (tile) =>
          tile.part &&
          tile.activated &&
          tile.part.category === "cell" &&
          tile.part.cell_count === 2
      );
    },
  },
  {
    title: "Have at least 10 active power Cells in your reactor",
    reward: 200,
    checkId: "tenActiveCells",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part &&
            tile.activated &&
            tile.part.category === "cell" &&
            tile.ticks > 0
        ).length >= 10
      );
    },
  },
  {
    title: "Purchase a Perpetual power Cell upgrade for Uranium",
    reward: 1000,
    checkId: "perpetualUranium",
    check: function (game) {
      const uraniumPerpetualUpgrade = game.upgradeset.getUpgrade(
        "uranium1_cell_perpetual"
      );
      return uraniumPerpetualUpgrade && uraniumPerpetualUpgrade.level > 0;
    },
  },
  {
    title: "Increase your max power with a Capacitor",
    reward: 100,
    checkId: "increaseMaxPower",
    check: function (game) {
      return game.tileset.tiles_list.some(
        (tile) =>
          tile.part && tile.activated && tile.part.category === "capacitor"
      );
    },
  },
  {
    title: "Generate at least 200 power per tick",
    reward: 1000,
    checkId: "powerPerTick200",
    check: function (game) {
      return game.reactor.stats_power >= 200 && !game.paused;
    },
  },
  {
    title: "Purchase one Improved Chronometers upgrade",
    reward: 5000,
    checkId: "improvedChronometers",
    check: function (game) {
      return game.upgradeset.getUpgrade("chronometer")?.level > 0;
    },
  },
  {
    title: "Have 5 different kinds of components in your reactor",
    reward: 2000,
    checkId: "fiveComponentKinds",
    check: function (game) {
      const found_categories = new Set();
      game.tileset.tiles_list.forEach((tile) => {
        if (tile.part && tile.activated) {
          found_categories.add(tile.part.category);
        }
      });
      return found_categories.size >= 5;
    },
  },
  {
    title: "Have at least 10 Capacitors in your reactor",
    reward: 5000,
    checkId: "tenCapacitors",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part && tile.activated && tile.part.category === "capacitor"
        ).length >= 10
      );
    },
  },
  {
    title: "Generate at least 500 power per tick",
    reward: 5000,
    checkId: "powerPerTick500",
    check: function (game) {
      return game.reactor.stats_power >= 500 && !game.paused;
    },
  },
  {
    title: "Upgrade Potent Uranium Cell to level 3 or higher",
    reward: 25000,
    checkId: "potentUranium3",
    check: function (game) {
      const uraniumPowerUpgrade = game.upgradeset.getUpgrade(
        "uranium1_cell_power"
      );
      return uraniumPowerUpgrade && uraniumPowerUpgrade.level >= 3;
    },
  },
  {
    title: "Auto-sell at least 500 power per tick",
    reward: 40000,
    checkId: "autoSell500",
    check: function (game) {
      return game.reactor.stats_cash >= 500;
    },
  },
  {
    title: "Have at least 5 active Quad Plutonium Cells in your reactor",
    reward: 1000000,
    checkId: "fiveQuadPlutonium",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part &&
            tile.activated &&
            tile.ticks > 0 &&
            tile.part.id === "plutonium3"
        ).length >= 5
      );
    },
  },
  {
    title: "Expand your reactor 4 times in either direction",
    reward: 100000000,
    checkId: "expandReactor4",
    check: function (game) {
      return (
        game.upgradeset.getUpgrade("expand_reactor_rows")?.level >= 4 ||
        game.upgradeset.getUpgrade("expand_reactor_cols")?.level >= 4
      );
    },
  },
  {
    title: "Have at least 5 active Quad Thorium Cells in your reactor",
    reward: 100000000,
    checkId: "fiveQuadThorium",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part &&
            tile.activated &&
            tile.ticks > 0 &&
            tile.part.id === "thorium3"
        ).length >= 5
      );
    },
  },
  {
    title: () => `Have at least $${fmt(10000000000)} total`,
    reward: 10000000000,
    checkId: "money10B",
    check: function (game) {
      return game.current_money >= 10000000000;
    },
  },
  {
    title: "Have at least 5 active Quad Seaborgium Cells in your reactor",
    reward: 100000000000,
    checkId: "fiveQuadSeaborgium",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part &&
            tile.activated &&
            tile.ticks > 0 &&
            tile.part.id === "seaborgium3"
        ).length >= 5
      );
    },
  },
  {
    title: "Generate 10 Exotic Particles with Particle Accelerators",
    reward: 10000000000000,
    checkId: "ep10",
    check: function (game) {
      return game.exotic_particles >= 10;
    },
  },
  {
    title: "Generate 51 Exotic Particles with Particle Accelerators",
    ep_reward: 50,
    checkId: "ep51",
    check: function (game) {
      return game.exotic_particles >= 51;
    },
  },
  {
    title: "Reboot your reactor in the Experiments tab",
    ep_reward: 50,
    checkId: "reboot",
    check: function (game) {
      return (
        game.total_exotic_particles > 0 &&
        game.current_money < game.base_money * 2 &&
        game.exotic_particles === 0
      );
    },
  },
  {
    title: "Purchase an Experimental Upgrade",
    ep_reward: 50,
    checkId: "experimentalUpgrade",
    check: function (game) {
      return game.upgradeset
        .getAllUpgrades()
        .some(
          (upg) =>
            upg.upgrade.id !== "laboratory" &&
            upg.upgrade.ecost > 0 &&
            upg.level > 0
        );
    },
  },
  {
    title: "Have at least 5 active Quad Dolorium Cells in your reactor",
    reward: 1000000000000000,
    checkId: "fiveQuadDolorium",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part &&
            tile.activated &&
            tile.ticks > 0 &&
            tile.part.id === "dolorium3"
        ).length >= 5
      );
    },
  },
  {
    title: () =>
      `Generate ${fmt(1000)} Exotic Particles with Particle Accelerators`,
    ep_reward: 1000,
    checkId: "ep1000",
    check: function (game) {
      return game.exotic_particles >= 1000;
    },
  },
  {
    title: "Have at least 5 active Quad Nefastium Cells in your reactor",
    reward: 100000000000000000,
    checkId: "fiveQuadNefastium",
    check: function (game) {
      return (
        game.tileset.tiles_list.filter(
          (tile) =>
            tile.part &&
            tile.activated &&
            tile.ticks > 0 &&
            tile.part.id === "nefastium3"
        ).length >= 5
      );
    },
  },
  {
    title: "Place an experimental part in your reactor.",
    ep_reward: 10000,
    checkId: "placeExperimentalPart",
    check: function (game) {
      return game.tileset.tiles_list.some(
        (tile) => tile.part && tile.activated && tile.part.experimental === true
      );
    },
  },
  {
    title: "All objectives completed!",
    reward: 0,
    checkId: "allObjectives",
    check: function (game) {
      return false;
    },
  },
];

export default objective_list_data;
