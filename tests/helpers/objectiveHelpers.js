import { syncGridState } from "./gameHelpers.js";
import { patchGameState } from "@app/state.js";

export function setCoreSustainedStart(game, key, startTick) {
  const objectives = game?.coreBridge?.session?.systems?.objectives;
  if (!objectives?.serialize || !objectives?.deserialize) return;
  const data = objectives.serialize();
  data.sustained = { ...(data.sustained || {}), [key]: startTick };
  objectives.deserialize(data);
}

export async function satisfyObjective(game, idx) {

    switch (idx) {
        case 0:
            await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
            game.engine?.tick?.();
            syncGridState(game, { activeTiles: true });
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
                patchGameState(game, { current_money: game.current_money });
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
            game.upgradeset.getUpgrade("auto_sell_operator")?.setLevel(1);
            game.reactor.auto_sell_multiplier = 1;
            const capCols = Math.min(10, game.cols);
            for (let i = 0; i < capCols; i++) {
                const t = game.tileset.getTile(0, i);
                if (t) await t.setPart(game.partset.getPartById("capacitor1"));
            }
            const puCols = Math.min(5, game.cols);
            for (let i = 0; i < puCols; i++) {
                const t = game.tileset.getTile(1, i);
                if (t) {
                    await t.setPart(game.partset.getPartById("plutonium1"));
                    t.activated = true;
                    t.ticks = 60;
                }
            }
            game.reactor.updateStats();
            game.reactor.altered_max_power = Math.max(
              Number(game.reactor.max_power) || 0,
              Number(game.reactor.altered_max_power) || 0,
              500,
            );
            game.onToggleStateChange?.("auto_sell", true);
            game.reactor.has_melted_down = false;
            if (game.state) game.state.melting_down = false;
            game.coreBridge?.session?.systems?.failure?.reset?.();
            if (game.coreBridge?.session?.engine?.meltdown) {
              game.coreBridge.session.engine.reset();
              game.coreBridge.syncGridFromGame();
            }
            game.reactor.current_power = Math.max(Number(game.reactor.max_power) || 0, 500);
            game.paused = false;
            game.onToggleStateChange?.("pause", false);
            game.engine?.stop?.();
            game.coreBridge?.session?.setPaused?.(false);
            game.coreBridge?.processTick?.(1);
            break;
        }

        case 17: {
            for (let i = 0; i < 8; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            game.reactor.updateStats();
            const tick = game.coreBridge?.session?.engine?.tickCount ?? game.engine.tick_count ?? 0;
            setCoreSustainedStart(game, "sustainedPower1k", tick - 30);
            break;
        }

        case 18:
            game.tileset.clearAllTiles();
            for (let i = 0; i < 10; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("capacitor2"));
            for (let i = 0; i < 10; i++) await game.tileset.getTile(1, i).setPart(game.partset.getPartById("vent2"));
            break;

        case 20:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            break;

        case 21:
            for (let i = 0; i < 8; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            for (let i = 0; i < 10; i++) await game.tileset.getTile(1, i).setPart(game.partset.getPartById("capacitor1"));
            game.upgradeset.getUpgrade("auto_sell_operator")?.setLevel(1);
            game.reactor.auto_sell_multiplier = 1;
            game.reactor.updateStats();
            game.reactor.altered_max_power = 60000;
            game.reactor.sell_price_multiplier = 1;
            game.onToggleStateChange?.("auto_sell", true);
            game.reactor.has_melted_down = false;
            if (game.state) game.state.melting_down = false;
            game.coreBridge?.session?.systems?.failure?.reset?.();
            if (game.coreBridge?.session?.engine?.meltdown) {
              game.coreBridge.session.engine.reset();
              game.coreBridge.syncGridFromGame();
            }
            game.reactor.altered_max_power = 60000;
            game.reactor.current_power = 60000;
            game.paused = false;
            game.onToggleStateChange?.("pause", false);
            game.engine?.stop?.();
            game.coreBridge?.session?.setPaused?.(false);
            game.coreBridge?.processTick?.(1);
            break;

        case 22: {
            const thorium1 = game.partset.getPartById("thorium1");
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(0, i);
                if (!tile || !thorium1) continue;
                await tile.setPart(thorium1);
                tile.activated = true;
                tile.ticks = 900;
            }
            game.tileset.updateActiveTiles();
            game.paused = false;
            game.onToggleStateChange?.("pause", false);
            game.engine?.tick?.();
            game.reactor.updateStats();
            break;
        }

        case 23:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("thorium3"));
            break;

        case 24:
            game.current_money = 1000000000;
            patchGameState(game, { current_money: game.current_money });
            break;

        case 25:
            game.current_money = 10000000000;
            patchGameState(game, { current_money: game.current_money });
            break;

        case 26:
            for (let i = 0; i < 5; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("seaborgium3"));
            break;

        case 27: {
            for (let i = 0; i < 8; i++) await game.tileset.getTile(0, i).setPart(game.partset.getPartById("plutonium3"));
            game.reactor.updateStats();
            game.reactor.max_heat = 50000000;
            game.reactor.current_heat = 15000000;
            game.reactor.has_melted_down = false;
            if (game.state) game.state.melting_down = false;
            game.paused = false;
            game.onToggleStateChange?.("pause", false);
            const tick = game.coreBridge?.session?.engine?.tickCount ?? game.engine.tick_count ?? 0;
            setCoreSustainedStart(game, "masterHighHeat", tick - 30);
            break;
        }

        case 28:
            game.current_exotic_particles = 10;
            game.exotic_particles = 10;
            patchGameState(game, { current_exotic_particles: 10, exotic_particles: 10 });
            break;

        case 30:
            game.current_exotic_particles = 51;
            game.exotic_particles = 51;
            patchGameState(game, { current_exotic_particles: 51, exotic_particles: 51 });
            break;

        case 31:
            game.current_exotic_particles = 250;
            game.exotic_particles = 250;
            patchGameState(game, { current_exotic_particles: 250, exotic_particles: 250 });
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
            await game.rebootActionKeepExoticParticles();
            game.exotic_particles = 0;
            game.current_exotic_particles = 0;
            game.current_money = game.base_money;
            patchGameState(game, {
              exotic_particles: 0,
              current_exotic_particles: 0,
              total_exotic_particles: game.total_exotic_particles,
              current_money: game.current_money,
            });
            game.objectives_manager.current_objective_index = idx;
            game.objectives_manager.set_objective(idx, true);
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
            game.current_exotic_particles = 1000;
            game.exotic_particles = 1000;
            patchGameState(game, { current_exotic_particles: 1000, exotic_particles: 1000 });
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

export function forceActiveObjective(game, index) {
    game.objectives_manager.current_objective_index = index;
    game.objectives_manager.set_objective(index, true);
    game.objectives_manager.check_current_objective();
}
