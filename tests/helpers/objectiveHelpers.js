export async function satisfyObjective(game, idx) {

    switch (idx) {
        case 0:
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
            game.engine?.tick?.();
            game.reactor.updateStats();
            game.tileset.updateActiveTiles();
            break;

        case 1:
            game.reactor.current_power = 10;
            game.sell_action();
            break;

        case 2:
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
            game.engine.tick();
            while (game.reactor.current_heat > 0) {
                game.manual_reduce_heat_action();
            }
            break;

        case 3:
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
            game.tileset.getTile(0, 0).activated = true;
            await game.tileset.getTile(0, 1).setPart(game.partset.getPartById("vent1"));
            break;

        case 4: {
            // Pick a reliable upgrade
            let upgradeToBuy = game.upgradeset.getUpgrade("chronometer");
            if (!upgradeToBuy) {
                upgradeToBuy = game.upgradeset.getAllUpgrades().find(u => u.base_cost && u.id !== 'expand_reactor_rows');
            }
            
            if (upgradeToBuy) {
                // Ensure sufficient money
                const cost = upgradeToBuy.getCost();
                game.current_money = Math.max(game.current_money, cost * 2 + 10000);
                game.ui.stateManager.setVar("current_money", game.current_money);
                game.upgradeset.check_affordability(game);
                const purchased = game.upgradeset.purchaseUpgrade(upgradeToBuy.id);
                // Verify purchase succeeded - ensure level is actually set
                if (!purchased || upgradeToBuy.level === 0) {
                    // Force set level if purchase failed (for test purposes)
                    upgradeToBuy.setLevel(1);
                }
                // Verify the upgrade level is actually > 0 for the objective check
                // Also ensure it's in the upgradeset's list
                const verifyUpgrade = game.upgradeset.getUpgrade(upgradeToBuy.id);
                if (verifyUpgrade && verifyUpgrade.level === 0) {
                    verifyUpgrade.setLevel(1);
                }
            }
            break;
        }

        case 5:
            game.current_money = game.partset.getPartById("uranium2").cost;
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium2"));
            break;

        case 6:
            game.current_money = game.partset.getPartById("uranium1").cost * 10;
            for (let i = 1; i < 11; i++) {
                await game.tileset.getTile(0, i).setPart(game.partset.getPartById("uranium1"));
            }
            game.engine?.tick?.();
            game.reactor.updateStats();
            break;

        case 7: {
            const perpetualUpgrade = game.upgradeset.getUpgrade("uranium1_cell_perpetual");
            perpetualUpgrade?.setLevel(1);
            break;
        }

        case 8:
            game.current_money = game.partset.getPartById("capacitor1").cost;
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("capacitor1"));
            break;

        case 9:
            break;

        case 10:
            for (let i = 0; i < 5; i++) {
                await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium1"));
            }
            game.reactor.updateStats();
            break;

        case 11: {
            const chronometerUpgrade = game.upgradeset.getUpgrade("chronometer");
            chronometerUpgrade?.setLevel(1);
            break;
        }

        case 12:
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
            await game.tileset.getTile(0, 1).setPart(game.partset.getPartById("vent1"));
            await game.tileset.getTile(0, 2).setPart(game.partset.getPartById("capacitor1"));
            await game.tileset.getTile(0, 3).setPart(game.partset.getPartById("reflector1"));
            await game.tileset.getTile(0, 4).setPart(game.partset.getPartById("heat_exchanger1"));
            break;

        case 13:
            for (let i = 0; i < 10; i++) {
                await game.tileset.getTile(0, i).setPart(game.partset.getPartById("capacitor1"));
            }
            break;

        case 14:
            for (let i = 0; i < 10; i++) {
                await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium1"));
            }
            game.reactor.updateStats();
            break;

        case 15: {
            const powerUpgrade = game.upgradeset.getUpgrade("uranium1_cell_power");
            powerUpgrade?.setLevel(3);
            break;
        }

        case 16: {
            const improvedPowerLinesUpgrade = game.upgradeset.getUpgrade("improved_power_lines");
            improvedPowerLinesUpgrade.setLevel(50);
            game.ui.stateManager.setVar("auto_sell", true);
            for (let i = 0; i < 10; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("capacitor1"));
            for (let i = 0; i < 5; i++) await game.tileset.getTile(1, i).setPart(game.partset.getPartById("plutonium1"));
            game.reactor.updateStats();
            game.reactor.stats_cash = 501;
            break;
        }

        case 17:
            for (let i = 0; i < 8; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            game.reactor.updateStats();
            game.sustainedPower1k = { startTime: Date.now() - 180000 };
            break;

        case 18:
            for (let i = 0; i < 10; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("capacitor2"));
            for (let i = 0; i < 10; i++) await game.tileset.getTile(1, i).setPart(game.partset.getPartById("vent2"));
            break;

        case 20:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            break;

        case 21:
            for (let i = 0; i < 8; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            for (let i = 0; i < 10; i++) await game.tileset.getTile(1, i).setPart(game.partset.getPartById("capacitor1"));
            game.ui.stateManager.setVar("auto_sell", true);
            game.upgradeset.getUpgrade("improved_power_lines").setLevel(50);
            game.reactor.updateStats();
            game.reactor.stats_cash = 60000;
            break;

        case 22:
            game.reactor.stats_power = 10000;
            game.paused = false;
            break;

        case 23:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("thorium3"));
            break;

        case 24:
            game.current_money = 1000000000;
            game.ui.stateManager.setVar("current_money", game.current_money);
            break;

        case 25:
            game.current_money = 10000000000;
            game.ui.stateManager.setVar("current_money", game.current_money);
            break;

        case 26:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("seaborgium3"));
            break;

        case 27:
            for (let i = 0; i < 8; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            game.reactor.updateStats();
            game.reactor.current_heat = 15000000;
            game.masterHighHeat = { startTime: Date.now() - 350000 };
            break;

        case 28:
            game.exotic_particles = 10;
            game.ui.stateManager.setVar("exotic_particles", 10);
            break;

        case 30:
            game.exotic_particles = 51;
            break;

        case 31:
            game.exotic_particles = 250;
            break;

        case 32:
            game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
            game.upgradeset.getUpgrade("infused_cells")?.setLevel(1);
            game.upgradeset.getUpgrade("unleashed_cells")?.setLevel(1);
            break;

        case 33: {
            game.exotic_particles = 10;
            game.total_exotic_particles = 10;
            game.current_exotic_particles = 10;
            await game.reboot_action(true);
            // After reboot with keep_exotic_particles=true:
            // - total_exotic_particles is restored (should be > 0)
            // - exotic_particles is reset to 0 (which is what we need)
            // - current_money is reset to base_money (which is < base_money * 2)
            // But we need to ensure exotic_particles is 0 (it should already be)
            game.exotic_particles = 0;
            // Ensure money is low enough (should already be base_money after reboot)
            game.current_money = game.base_money;
            // Update state manager to reflect the values
            game.ui.stateManager.setVar("exotic_particles", 0);
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);
            game.ui.stateManager.setVar("current_money", game.current_money);
            game.objectives_manager.current_objective_index = idx;
            game.objectives_manager.set_objective(idx, true);
            // Check the objective after setting up the state
            game.objectives_manager.check_current_objective();
            break;
        }

        case 34:
            game.exotic_particles = 100;
            game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
            game.upgradeset.getUpgrade("infused_cells")?.setLevel(1);
            break;

        case 35:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("dolorium3"));
            break;

        case 36:
            game.exotic_particles = 1000;
            break;

        case 37:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("nefastium3"));
            break;

        case 38:
            game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
            game.upgradeset.getUpgrade("protium_cells")?.setLevel(1);
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("protium1"));
            break;

        default:
            break;
    }
}

