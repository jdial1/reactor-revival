import { Game } from './game.js';
import { ObjectiveManager } from './objective.js';
import { TooltipManager } from './tooltip.js';
import { numFormat, timeFormat, on, performance } from './util.js';
import { UI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const ui = new UI();
    if (!ui) {
        console.error("UI object not found.");
        return;
    }

    const game = new Game(ui);
    if (!ui.init(game)) {
        console.error("Failed to initialize UI. Aborting game initialization.");
        return;
    }

    var tiles = game.tileset.initialize();
    tiles.forEach(t => ui.eventHandlers.handleTileAdded(game,t));

    var parts = game.partset.initialize();
    parts.forEach(p => ui.eventHandlers.handlePartAdded(game,p));

    var upgrades = game.upgradeset.initialize();
    upgrades.forEach(u => ui.eventHandlers.handleUpgradeAdded(game,u));

    game.set_defaults();

    game.objectives_manager = new ObjectiveManager(game);
    game.tooltip_manager = new TooltipManager('#main', '#tooltip');

    game.initialize_new_game_state();

    const $main = document.querySelector('#main');
    const $reactor = document.querySelector('#reactor');
    const $all_parts = document.querySelector('#all_parts');
    const $all_upgrades = document.querySelector('#all_upgrades');
    
    const tooltipElements = {
        name: document.querySelector('#tooltip_name'),
        description: document.querySelector('#tooltip_description'),
        cost: document.querySelector('#tooltip_cost'),
        sellsWrapper: document.querySelector('#tooltip_sells_wrapper'),
        sells: document.querySelector('#tooltip_sells'),
        heatPer: document.querySelector('#tooltip_heat_per'),
        powerPer: document.querySelector('#tooltip_power_per'),
        heatPerWrapper: document.querySelector('#tooltip_heat_per_wrapper'),
        powerPerWrapper: document.querySelector('#tooltip_power_per_wrapper'),
        heatWrapper: document.querySelector('#tooltip_heat_wrapper'),
        heat: document.querySelector('#tooltip_heat'),
        maxHeat: document.querySelector('#tooltip_max_heat'),
        ticksWrapper: document.querySelector('#tooltip_ticks_wrapper'),
        ticks: document.querySelector('#tooltip_ticks'),
        maxTicks: document.querySelector('#tooltip_max_ticks'),
        chanceWrapper: document.querySelector('#tooltip_chance_wrapper'),
        chance: document.querySelector('#tooltip_chance'),
        chancePercentOfTotal: document.querySelector('#tooltip_chance_percent_of_total'),
    };

    
    const upgrade_locations_dom_map = {
        cell_tick_upgrades: document.getElementById('cell_tick_upgrades'),
        cell_power_upgrades: document.getElementById('cell_power_upgrades'),
        cell_perpetual_upgrades: document.getElementById('cell_perpetual_upgrades'),
        other: document.getElementById('other_upgrades'),
        vent: document.getElementById('vent_upgrades'),
        vents: document.getElementById('vent_upgrades'),
        exchanger: document.getElementById('exchanger_upgrades'),
        exchangers: document.getElementById('exchanger_upgrades'),
        experimental_laboratory: document.getElementById('experimental_laboratory'),
        experimental_boost: document.getElementById('experimental_boost'),
        experimental_particle_accelerators: document.getElementById('experimental_particle_accelerators'),
        experimental_cells: document.getElementById('experimental_cells'),
        experimental_cell_boost: document.getElementById('experimental_cell_boost'),
        experimental_cells_boost: document.getElementById('experimental_cell_boost'),
        experimental_parts: document.getElementById('experimental_parts'),
    };
  

    game.objectives_manager.start();
    if (game.debug && $main) {
        $main.classList.add('debug');
    }
    ui.eventHandlers.setVar('max_heat', game.reactor.max_heat,true);
    ui.eventHandlers.setVar('max_power', game.reactor.max_power,true);

    // --- Tooltip Logic ---
    function updateTooltipContent(obj, tile_context) {
        if (!obj || !tooltipElements.name) return;
        tooltipElements.name.textContent = obj.part ? obj.part.title : obj.upgrade.title;
        if (tile_context && obj.category && typeof obj.updateDescription === 'function') {
            obj.updateDescription(tile_context);
        }
        tooltipElements.description.textContent = obj.description || (obj.upgrade && obj.upgrade.description) || '';
        const costDisplayNeeded = obj.cost !== undefined || (obj.upgrade && obj.upgrade.current_cost !== undefined);
        tooltipElements.cost.style.display = costDisplayNeeded ? null : 'none';
        if (costDisplayNeeded) {
            if (obj.upgrade && obj.upgrade.ecost > 0) {
                tooltipElements.cost.textContent = `${obj.display_cost} EP`;
            } else if (obj.erequires && (!game.upgrade_objects[obj.erequires] || !game.upgrade_objects[obj.erequires].level)) {
                tooltipElements.cost.textContent = 'LOCKED';
            } else {
                tooltipElements.cost.textContent = numFormat(obj.cost !== undefined ? obj.cost : obj.current_cost, 3);
            }
        }
        const setTooltipField = (wrapper, valueEl, value, formatter = numFormat, suffix = '') => {
            if (value !== undefined && value !== null) {
                if(wrapper) wrapper.style.display = null;
                if(valueEl) valueEl.textContent = formatter(value) + suffix;
            } else {
                if(wrapper) wrapper.style.display = 'none';
            }
        };
        [
            tooltipElements.sellsWrapper, tooltipElements.heatPerWrapper, tooltipElements.powerPerWrapper,
            tooltipElements.ticksWrapper, tooltipElements.heatWrapper, tooltipElements.chanceWrapper
        ].forEach(el => el && (el.style.display = 'none'));
        if (tile_context && obj.category) {
            if (tile_context.activated) {
                if (obj.containment) {
                    setTooltipField(tooltipElements.heatWrapper, tooltipElements.heat, tile_context.heat_contained);
                    if(tooltipElements.maxHeat) tooltipElements.maxHeat.textContent = numFormat(obj.containment);
                }
                if (obj.ticks) {
                    setTooltipField(tooltipElements.ticksWrapper, tooltipElements.ticks, tile_context.ticks);
                    if(tooltipElements.maxTicks) tooltipElements.maxTicks.textContent = numFormat(obj.ticks);
                }
                if (obj.base_heat > 0) setTooltipField(tooltipElements.heatPerWrapper, tooltipElements.heatPer, tile_context.display_heat);
                if (obj.base_power > 0) setTooltipField(tooltipElements.powerPerWrapper, tooltipElements.powerPer, tile_context.display_power);
                if (obj.category !== 'cell') {
                    tooltipElements.sellsWrapper.style.display = null;
                    let sell_value = obj.cost;
                    if (obj.ticks > 0) {
                        sell_value = Math.ceil(tile_context.ticks / obj.ticks * obj.cost);
                    } else if (obj.containment > 0) {
                        sell_value = obj.cost - Math.ceil(tile_context.heat_contained / obj.containment * obj.cost);
                    }
                    tooltipElements.sells.textContent = numFormat(Math.max(0, sell_value));
                }
                if (obj.category === 'particle_accelerator') {
                    setTooltipField(tooltipElements.chanceWrapper, tooltipElements.chance, tile_context.display_chance, v => numFormat(v, 2), '%');
                    if(tooltipElements.chancePercentOfTotal) tooltipElements.chancePercentOfTotal.textContent = numFormat(tile_context.display_chance_percent_of_total, 2) + '% of max';
                }
            }
        }
    }
    function show_tooltip_for_object(obj, tile_context) {
        game.tooltip_manager.show(obj, tile_context, () => updateTooltipContent(obj, tile_context));
    }
    const setupTooltipEvents = (parentElement, itemSelector, getObject) => {
        if (!parentElement) return;
        on(parentElement, itemSelector, 'mouseover', function() {
            const obj = getObject(this);
            const tileContext = this.tile;
            if (obj) show_tooltip_for_object(obj, tileContext);
            else game.tooltip_manager.hide();
        });
        on(parentElement, itemSelector, 'mouseout', () => game.tooltip_manager.hide());
        on(parentElement, itemSelector, 'focus', function() {
            const obj = getObject(this);
            const tileContext = this.tile;
            if (obj) show_tooltip_for_object(obj, tileContext);
            else game.tooltip_manager.hide();
        });
        on(parentElement, itemSelector, 'blur', () => game.tooltip_manager.hide());
    };

    // Attach handlers to all part containers (all tabs)
    const partContainerIds = [
        'cells', 'reflectors', 'capacitors', 'vents', 'heatExchangers',
        'heatInlets', 'heatOutlets', 'coolantCells', 'reactorPlatings', 'particleAccelerators'
    ];
    partContainerIds.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            setupTooltipEvents(container, '.part', (el) => el._part);
            on(container, '.part', 'click', function() {
                const part_obj_from_dom = this._part;
                console.log('Selected part for placement:', part_obj_from_dom);
                if (!part_obj_from_dom) {
                    console.warn("Clicked element does not have _part object attached.", this);
                    return;
                }
                const current_clicked_part = ui.eventHandlers.getClickedPart();
                if (current_clicked_part === part_obj_from_dom) {
                    ui.eventHandlers.setClickedPart(null);
                    this.classList.remove('part_active');
                    if ($main) $main.classList.remove('part_active');
                    game.tooltip_manager.hide();
                } else {
                    if (current_clicked_part && current_clicked_part.$el) {
                        current_clicked_part.$el.classList.remove('part_active');
                    }
                    ui.eventHandlers.setClickedPart(part_obj_from_dom);
                    this.classList.add('part_active');
                    if ($main) $main.classList.add('part_active');
                    show_tooltip_for_object(part_obj_from_dom, null);
                }
            });
        }
    });

    // Enable tooltips for reactor tiles on hover
    if ($reactor) {
        setupTooltipEvents($reactor, '.tile', function(el) {
            return el.tile && el.tile.part ? el.tile.part : null;
        });
    }

    if ($all_upgrades) setupTooltipEvents($all_upgrades, '.upgrade', (el) => el.upgrade_object);

    window.manual_reduce_heat = () => game.manual_reduce_heat_action();
    window.sell = () => game.sell_action();
    window.reboot = (refund_ep = false) => game.reboot_action(refund_ep);
    if ($all_upgrades) {
        on($all_upgrades, '.upgrade', 'click', function(event) {
            const upgrade_obj = this.upgrade_object;
            if (upgrade_obj) {
                let result;
                do {
                    result = game.upgradeset.purchaseUpgrade(upgrade_obj.id);
                } while (event.shiftKey && result && upgrade_obj.level < upgrade_obj.max_level);
                if (game.tooltip_manager.tooltip_showing) {
                    show_tooltip_for_object(upgrade_obj, null);
                }
            }
        });
    }

    // --- Game Loop ---
    let lastTick = Date.now();
    function gameLoop() {
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;

        if (!game.paused) {
            game.tileset.active_tiles_list.forEach(tile => {
                if (tile.activated && tile.part) {
                    if (tile.part.category === 'cell' && tile.ticks > 0) {
                        tile.ticks--;
                        if (tile.ticks === 0) {
                            tile.part = null;
                            tile.activated = false;
                            game.update_cell_power();
                        }
                    }
                }
            });

            if (game.reactor.current_heat > 0) {
                game.reactor.current_heat -= game.reactor.stats_vent;
                if (game.reactor.current_heat < 0) game.reactor.current_heat = 0;
                game.ui.eventHandlers.setVar('current_heat', game.reactor.current_heat,true);
            }

            if (game.reactor.current_power > 0 && !game.auto_sell_disabled) {
                game.reactor.sellPower();
            }

            if (game.reactor.current_heat >= game.reactor.max_heat) {
                game.reactor.checkMeltdown(game.tileset);
            }

            game.reactor.updateStats(game.tileset,ui.eventHandlers);
        }

        setTimeout(gameLoop, game.loop_wait);
    }

    // Start the game loop
    gameLoop();


    function pause_game() {
        game.paused = true;
        clearTimeout(loop_timeout);
        last_tick_time = 0;
        dtime = 0;
        ui.eventHandlers.pause_game();
    }

    function unpause_game() {
        if (!game.paused) return;
        game.paused = false;
        last_tick_time = performance.now();
        dtime = 0;
        gameLoop();
        ui.eventHandlers.unpause_game();
    };
    
    window.disable_auto_sell = () => { game.auto_sell_disabled = true; ui.eventHandlers.disable_auto_sell(); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_auto_sell = () => { game.auto_sell_disabled = false; ui.eventHandlers.enable_auto_sell(); _updateAllToggleBtnStatesForAppJs(); };
    window.disable_auto_buy = () => { game.auto_buy_disabled = true; ui.eventHandlers.disable_auto_buy(); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_auto_buy = () => { game.auto_buy_disabled = false; ui.eventHandlers.enable_auto_buy(); _updateAllToggleBtnStatesForAppJs(); };
    window.disable_heat_control = () => { game.heat_controlled = false; ui.eventHandlers.disable_heat_control(); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_heat_control = () => { game.heat_controlled = true; ui.eventHandlers.enable_heat_control(); _updateAllToggleBtnStatesForAppJs(); };
    window.disable_time_flux = () => { game.time_flux = false; ui.eventHandlers.disable_time_flux(); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_time_flux = () => { game.time_flux = true; ui.eventHandlers.enable_time_flux(); _updateAllToggleBtnStatesForAppJs(); };

    // --- Cool Button Hold-to-Repeat ---
    const coolBtn = document.getElementById('reduceHeatBtnInfoBar');
    let coolBtnInterval = null;
    let coolBtnTimeout = null;
    function startCoolRepeat() {
        if (coolBtnInterval) return;
        game.manual_reduce_heat_action();
        coolBtnTimeout = setTimeout(() => {
            coolBtnInterval = setInterval(() => {
                game.manual_reduce_heat_action();
            }, 120);
        }, 350);
    }
    function stopCoolRepeat() {
        if (coolBtnTimeout) clearTimeout(coolBtnTimeout);
        if (coolBtnInterval) clearInterval(coolBtnInterval);
        coolBtnTimeout = null;
        coolBtnInterval = null;
    }
    if (coolBtn) {
        coolBtn.addEventListener('mousedown', startCoolRepeat);
        coolBtn.addEventListener('touchstart', startCoolRepeat, { passive: true });
        coolBtn.addEventListener('mouseup', stopCoolRepeat);
        coolBtn.addEventListener('mouseleave', stopCoolRepeat);
        coolBtn.addEventListener('touchend', stopCoolRepeat, { passive: true });
        coolBtn.addEventListener('touchcancel', stopCoolRepeat, { passive: true });
    }

    // Helper in app.js to update button states if they are not fully managed by app.ui.js yet
    function _updateAllToggleBtnStatesForAppJs() {
        if (ui && typeof ui._updateAllToggleBtnStates === 'function') {
            ui._updateAllToggleBtnStates();
        } else if (ui && game) {
            ui.eventHandlers.setVar('auto_sell_disabled_state_change', game.auto_sell_disabled,true);
        }
    }
});
