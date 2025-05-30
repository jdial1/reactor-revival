import { numFormat as fmt } from '../js/util.js';

const objective_list_data = [
    {
        title: 'Place your first component in the reactor',
        reward: 10,
        check: function(game) {
            return game.tileset.active_tiles_list.some(tile => tile && tile.part && tile.activated);
        }
    },
    {
        title: 'Sell all your power by clicking "Sell"',
        reward: 10,
        check: function(game) {
            return game.sold_power;
        }
    },
    {
        title: 'Reduce your Current Heat to 0',
        reward: 10,
        check: function(game) {
            return game.sold_heat;
        }
    },
    {
        title: 'Put a Heat Vent next to a power Cell',
        reward: 50,
        check: function(game) {
            return game.tileset.active_tiles_list.some(tile => {
                if (tile && tile.part && tile.activated && tile.part.category === 'cell' && tile.ticks > 0) {
                    for (const neighbor_tile of game.tileset.getTilesInRange(tile, 1)) {
                        if (neighbor_tile.part && neighbor_tile.activated && neighbor_tile.part.category === 'vent') {
                            return true;
                        }
                    }
                }
                return false;
            });
        }
    },
    {
        title: 'Purchase an Upgrade',
        reward: 100,
        check: function(game) {
            return game.upgrade_objects_array.some(upgrade => upgrade.level > 0);
        }
    },
    {
        title: 'Purchase a Dual power Cell',
        reward: 25,
        check: function(game) {
            return game.tiles_list.some(tile => tile.part && tile.activated && tile.part.category === 'cell' && tile.part.part.cell_count === 2);
        }
    },
    {
        title: 'Have at least 10 active power Cells in your reactor',
        reward: 200,
        check: function(game) {
            let count = 0;
            game.tiles_list.forEach(tile => {
                if (tile.part && tile.activated && tile.part.category === 'cell' && tile.ticks > 0) {
                    count++;
                }
            });
            return count >= 10;
        }
    },
    {
        title: 'Purchase a Perpetual power Cell upgrade for Uranium', // Example specific target
        reward: 1000,
        check: function(game) {
            const uraniumPerpetualUpgrade = Object.values(game.upgrade_objects).find(upg => upg.upgrade.id.includes('uranium') && upg.upgrade.type === 'cell_perpetual');
            return uraniumPerpetualUpgrade && uraniumPerpetualUpgrade.level > 0;
        }
    },
    {
        title: 'Increase your max power with a Capacitor',
        reward: 100,
        check: function(game) {
            return game.tiles_list.some(tile => tile.part && tile.activated && tile.part.category === 'capacitor');
        }
    },
    {
        title: 'Generate at least 200 power per tick',
        reward: 1000,
        check: function(game) {
            return game.stats_power >= 200 && !game.paused;
        }
    },
    {
        title: 'Purchase one Improved Chronometers upgrade',
        reward: 5000,
        check: function(game) {
            return game.upgrade_objects['chronometer'] && game.upgrade_objects['chronometer'].level > 0;
        }
    },
    {
        title: 'Have 5 different kinds of components in your reactor',
        reward: 2000,
        check: function(game) {
            const found_categories = new Set();
            game.tiles_list.forEach(tile => {
                if (tile.part && tile.activated) {
                    found_categories.add(tile.part.category);
                }
            });
            return found_categories.size >= 5;
        }
    },
    {
        title: 'Have at least 10 Capacitors in your reactor',
        reward: 5000,
        check: function(game) {
            let count = 0;
            game.tiles_list.forEach(tile => {
                if (tile.part && tile.activated && tile.part.category === 'capacitor') {
                    count++;
                }
            });
            return count >= 10;
        }
    },
    {
        title: 'Generate at least 500 power per tick',
        reward: 5000,
        check: function(game) {
            return game.stats_power >= 500 && !game.paused;
        }
    },
    {
        title: 'Upgrade Potent Uranium Cell to level 3 or higher',
        reward: 25000,
        check: function(game) {
            const uraniumPowerUpgrade = Object.values(game.upgrade_objects).find(upg => upg.upgrade.id.startsWith('uranium') && upg.upgrade.type === 'cell_power');
            return uraniumPowerUpgrade && uraniumPowerUpgrade.level >= 3;
        }
    },
    {
        title: 'Auto-sell at least 500 power per tick',
        reward: 40000,
        check: function(game) {
            return game.stats_cash >= 500;
        }
    },
    {
        title: 'Have at least 5 active Quad Plutonium Cells in your reactor',
        reward: 1000000,
        check: function(game) {
            return game.tiles_list.filter(tile => tile.part && tile.activated && tile.ticks > 0 && tile.part.id === 'plutonium3').length >= 5;
        }
    },
    {
        title: 'Expand your reactor 4 times in either direction',
        reward: 100000000,
        check: function(game) {
            return (game.upgrade_objects['expand_reactor_rows'] && game.upgrade_objects['expand_reactor_rows'].level >= 4) ||
                   (game.upgrade_objects['expand_reactor_cols'] && game.upgrade_objects['expand_reactor_cols'].level >= 4);
        }
    },
    {
        title: 'Have at least 5 active Quad Thorium Cells in your reactor',
        reward: 100000000,
        check: function(game) {
            return game.tiles_list.filter(tile => tile.part && tile.activated && tile.ticks > 0 && tile.part.id === 'thorium3').length >= 5;
        }
    },
    {
        title: () => `Have at least $${fmt(10000000000)} total`,
        reward: 10000000000,
        check: function(game) {
            return game.current_money >= 10000000000;
        }
    },
    {
        title: 'Have at least 5 active Quad Seaborgium Cells in your reactor',
        reward: 100000000000,
        check: function(game) {
            return game.tiles_list.filter(tile => tile.part && tile.activated && tile.ticks > 0 && tile.part.id === 'seaborgium3').length >= 5;
        }
    },
    {
        title: 'Generate 10 Exotic Particles with Particle Accelerators',
        reward: 10000000000000,
        check: function(game) {
            return game.exotic_particles >= 10;
        }
    },
    {
        title: 'Generate 51 Exotic Particles with Particle Accelerators',
        ep_reward: 50,
        check: function(game) {
            return game.exotic_particles >= 51;
        }
    },
    {
        title: 'Reboot your reactor in the Experiments tab',
        ep_reward: 50,
        check: function(game) {
            // Check if total_exotic_particles increased (meaning a reboot happened)
            // and money is low (typical post-reboot state)
            return game.total_exotic_particles > 0 && game.current_money < game.base_money * 2 && game.exotic_particles === 0;
        }
    },
    {
        title: 'Purchase an Experimental Upgrade',
        ep_reward: 50,
        check: function(game) {
            return game.upgrade_objects_array.some(upg => upg.upgrade.id !== 'laboratory' && upg.upgrade.ecost > 0 && upg.level > 0);
        }
    },
    {
        title: 'Have at least 5 active Quad Dolorium Cells in your reactor',
        reward: 1000000000000000,
        check: function(game) {
            return game.tiles_list.filter(tile => tile.part && tile.activated && tile.ticks > 0 && tile.part.id === 'dolorium3').length >= 5;
        }
    },
    {
        title: () => `Generate ${fmt(1000)} Exotic Particles with Particle Accelerators`,
        ep_reward: 1000,
        check: function(game) {
            return game.exotic_particles >= 1000;
        }
    },
    {
        title: 'Have at least 5 active Quad Nefastium Cells in your reactor',
        reward: 100000000000000000,
        check: function(game) {
            return game.tiles_list.filter(tile => tile.part && tile.activated && tile.ticks > 0 && tile.part.id === 'nefastium3').length >= 5;
        }
    },
    {
        title: 'Place an experimental part in your reactor.',
        ep_reward: 10000,
        check: function(game) {
            return game.tiles_list.some(tile => tile.part && tile.activated && tile.part.part.experimental === true);
        }
    },
    {
        title: 'All objectives completed!',
        reward: 0, // No reward for the final placeholder
        check: function(game) {
            return false; // This objective is never "completed"
        }
    }
];

export default objective_list_data;
