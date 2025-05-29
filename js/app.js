import { Game } from './game/game_class.js';
import { initializeParts } from './part/part_class.js';
import { initializeUpgrades, purchaseUpgrade as purchaseUpgradeAction } from './upgrade/upgrade_class.js';
import { ObjectiveManager } from './objective/objective_class.js';
import { create_reactor_tiles } from './tile/tile_class.js';
import { TooltipManager } from './tooltip/tooltip_class.js';
import { numFormat, timeFormat, on } from './util.js';

window.fmt = numFormat;
window.timeFormat = timeFormat;
if (typeof window.check_affordability !== 'function') {
    window.check_affordability = () => {};
}
if (typeof window.check_upgrades_affordability !== 'function') {
    window.check_upgrades_affordability = () => {};
}

document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const ui = window.ui;
    if (!ui) {
        console.error("UI object not found. Ensure app.ui.js is loaded and initialized correctly.");
        return;
    }
    const game = new Game(ui);
    ui.init(game);
    create_reactor_tiles(game);
    initializeParts(game);
    game.objectives_manager = new ObjectiveManager(game);
    game.tooltip_manager = new TooltipManager('#main', '#tooltip');

    // --- DOM Element Caching ---
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
        cell_tick: document.getElementById('cell_tick_upgrades'),
        cell_power: document.getElementById('cell_power_upgrades'),
        cell_perpetual: document.getElementById('cell_perpetual_upgrades'),
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
    initializeUpgrades(game, upgrade_locations_dom_map);
    game.set_defaults();
    game.save_manager.load((saved_data_string) => game.loads(saved_data_string));
    game.objectives_manager.start();
    if (game.debug && $main) {
        $main.classList.add('debug');
    }
    ui.say('var', 'max_heat', game.max_heat);
    ui.say('var', 'max_power', game.max_power);

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
                tooltipElements.cost.textContent = numFormat(obj.cost !== undefined ? obj.cost : obj.current_cost);
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
    if ($reactor) setupTooltipEvents($reactor, '.tile.enabled', (el) => el.tile && el.tile.part);
    if ($all_parts) setupTooltipEvents($all_parts, '.part', (el) => el._part);
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
                    result = purchaseUpgradeAction(upgrade_obj, game);
                } while (event.shiftKey && result && upgrade_obj.level < upgrade_obj.max_level);
                if (game.tooltip_manager.tooltip_showing) {
                    show_tooltip_for_object(upgrade_obj, null);
                }
            }
        });
        if (game.debug) {
            on($all_upgrades, '.upgrade', 'mousedown', function(event) {
                if (event.which === 3 || event.button === 2) {
                    event.preventDefault();
                    const upgrade_obj = this.upgrade_object;
                    if (upgrade_obj && upgrade_obj.level > 0) {
                        if (upgrade_obj.upgrade.ecost > 0) {
                            game.current_exotic_particles += upgrade_obj.current_ecost;
                        } else {
                            game.current_money += upgrade_obj.current_cost;
                        }
                        upgrade_obj.setLevel(upgrade_obj.level - 1);
                        ui.say('var', 'current_exotic_particles', game.current_exotic_particles);
                        ui.say('var', 'current_money', game.current_money);
                        if (game.tooltip_manager.tooltip_showing) {
                            show_tooltip_for_object(upgrade_obj, null);
                        }
                    }
                }
            });
        }
    }
    let clicked_part = null;
    let tile_queue = [];
    if ($all_parts) {
        on($all_parts, '.part', 'click', function() {
            const part_obj_from_dom = this._part;
            if (!part_obj_from_dom) {
                console.warn("Clicked element does not have _part object attached.", this);
                return;
            }

            if (clicked_part === part_obj_from_dom) {
                clicked_part = null;
                this.classList.remove('part_active');
                if ($main) $main.classList.remove('part_active');
                game.tooltip_manager.hide();
            } else {
                if (clicked_part && clicked_part.$el) {
                    clicked_part.$el.classList.remove('part_active');
                }
                clicked_part = part_obj_from_dom;
                this.classList.add('part_active');
                if ($main) $main.classList.add('part_active');
                show_tooltip_for_object(clicked_part, null);
            }
        });
    }

    // Tile click handler for placing parts
    if ($reactor) {
        on($reactor, '.tile.enabled', 'click', function(event) {
            const tile = this.tile;
            if (!tile || !tile.enabled) return;

            if (clicked_part) {
                const part_to_place = clicked_part;

                if (game.current_money >= part_to_place.cost) {
                    game.current_money -= part_to_place.cost;
                    ui.say('var', 'current_money', game.current_money);
                    
                    tile.setPart(part_to_place);
                    game.update_reactor_stats();
                    ui.check_affordability_parts(); 
                } else {
                    console.log("Not enough money to place part:", part_to_place.part ? part_to_place.part.title : part_to_place.title);
                }
            } else if (tile.part) {
                game.remove_part_from_tile(tile, false, true);
            }
        });

        on($reactor, '.tile.enabled', 'contextmenu', function(event) {
            event.preventDefault(); 
            const tile = this.tile;
            if (tile && tile.part) {
                game.remove_part_from_tile(tile, false, true);
            }
        });
    }

    // --- Game Loop ---
    let loop_timeout;
    let was_melting_down = false;
    let heat_add_next_loop = 0; // Heat to be added in the next iteration from certain effects
    let dtime = 0; // Delta time for tick catch-up
    let last_tick_time = 0;
    
    const game_stat_prediction = { // For offline ticks, not fully implemented here
        heat_add: 0, heat_add_next_loop: 0, heat_remove: 0, reduce_heat: 0,
        power_add: 0, sell_amount: 0, ep_chance_add: 0, no_change_ticks: Infinity
    };

    function _game_loop() {
        let loop_start_time = performance.now();
        if (game.paused) return;

        let power_add_this_tick = 0;
        let heat_add_this_tick = heat_add_next_loop; // Carry over heat
        heat_add_next_loop = 0;
        let heat_remove_this_tick = 0;
        let heat_passively_reduced_this_tick = 0;
        let money_from_auto_sell_this_tick = 0;
        let ep_chance_this_tick = 0;
        let meltdown_imminent = false;
        let needs_reactor_stats_update = false;

        const active_inlets_list = [];
        const active_exchangers_list = [];
        const active_outlets_list = [];
        const active_extreme_capacitors_list = [];
        
        let min_ticks_remaining = Infinity;

        // Phase 1: Process parts, generate power/heat, consume ticks
        game.active_tiles_list.forEach(tile => {
            if (tile.activated && tile.part) {
                const p = tile.part;
                if (p.category === 'cell' && tile.ticks > 0) {
                    power_add_this_tick += tile.power; // tile.power already considers reflectors
                    heat_add_this_tick += tile.heat;   // tile.heat already considers reflectors
                    tile.setTicks(tile.ticks - 1);
                    min_ticks_remaining = Math.min(min_ticks_remaining, tile.ticks);

                    // Reflectors lose ticks when adjacent cells pulse
                    tile.reflectors.forEach(r_tile => {
                        if (r_tile.ticks > 0) {
                            r_tile.setTicks(r_tile.ticks - 1);
                            if (r_tile.ticks === 0) { // Reflector depleted
                                if (!game.auto_buy_disabled && r_tile.part.perpetual && game.current_money >= r_tile.part.cost) {
                                    game.current_money -= r_tile.part.cost;
                                    ui.say('var', 'current_money', game.current_money);
                                    r_tile.setTicks(r_tile.part.ticks);
                                } else {
                                    if(r_tile.$el) r_tile.$el.classList.add('exploding');
                                    game.remove_part_from_tile(r_tile, true, false); // Don't sell, just remove
                                    needs_reactor_stats_update = true;
                                }
                            }
                        }
                    });

                    if (tile.ticks === 0) { // Cell depleted
                        if (p.part.type === 'protium') {
                            game.protium_particles += p.cell_count;
                            game.update_cell_power(); // This will also update reactor stats
                        }
                        if (!game.auto_buy_disabled && p.perpetual && game.current_money >= p.cost * 1.5) {
                            game.current_money -= p.cost * 1.5;
                            ui.say('var', 'current_money', game.current_money);
                            tile.setTicks(p.ticks);
                        } else {
                            if(tile.$el) tile.$el.classList.add('spent');
                            needs_reactor_stats_update = true; // Part is spent, stats might change if it stops contributing
                        }
                    }
                } // End cell processing

                if (p.containment) { // Parts that contain heat
                    // Heat from cells is added to global reactor heat first, then distributed.
                    // Coolant Cell 6 (Thermionic) converts heat added to it into power
                    if (p.id === 'coolant_cell6') {
                        // This logic is tricky. Heat is added to it via exchangers/outlets.
                        // The conversion should happen when heat *enters* coolant_cell6.
                    }
                }
                
                if (p.category === 'particle_accelerator' && tile.heat_contained > 0) {
                    const ep_heat_cap = p.ep_heat;
                    const heat_for_ep = Math.min(tile.heat_contained, ep_heat_cap);
                    const ep_chance_percent_of_cap = heat_for_ep / ep_heat_cap;
                    // Original formula: Math.log(heat) / 10^(5-level) * percent_of_cap
                    // Simplified: scale with log of heat and level, ensure it's a small fraction
                    const ep_chance_contrib = (Math.log10(heat_for_ep + 1) / (Math.pow(10, 4 - (p.part.level -1) ))) * ep_chance_percent_of_cap;
                    ep_chance_this_tick += ep_chance_contrib;
                    tile.display_chance = ep_chance_contrib * 100;
                    tile.display_chance_percent_of_total = ep_chance_percent_of_cap * 100;

                }

                if (p.transfer && tile.containments.length > 0) {
                    if (p.category === 'heat_inlet') active_inlets_list.push(tile);
                    else if (p.category === 'heat_exchanger') active_exchangers_list.push(tile);
                    else if (p.category === 'heat_outlet') active_outlets_list.push(tile);
                }
                if (p.id === 'capacitor6') active_extreme_capacitors_list.push(tile);
            }
        });
        game_stat_prediction.no_change_ticks = min_ticks_remaining;

        // Phase 2: Heat distribution - Inlets
        active_inlets_list.forEach(tile => {
            const transfer_per_containment = tile.getEffectiveTransferValue();
            tile.containments.forEach(cont_tile => {
                if (cont_tile.heat_contained > 0) {
                    const heat_to_transfer = Math.min(transfer_per_containment, cont_tile.heat_contained);
                    cont_tile.setHeat_contained(cont_tile.heat_contained - heat_to_transfer);
                    heat_add_this_tick += heat_to_transfer;
                }
            });
        });
        
        game.current_heat += heat_add_this_tick;
        ui.say('var', 'heat_add', heat_add_this_tick); // Heat generated by cells + inlets

        // Phase 3: Heat distribution - Exchangers & Outlets
        // Exchangers try to balance heat
        active_exchangers_list.forEach(tile => {
            const exchanger = tile.part;
            const effective_transfer = tile.getEffectiveTransferValue();
            
            // Logic for heat_exchanger6 (entire row)
            const neighbors_and_row = (exchanger.id === 'heat_exchanger6') ?
                Array.from(game.heat_exchanger6_range(tile)) :
                tile.containments;

            let total_heatsink_capacity = exchanger.containment;
            let total_current_heat_in_network = tile.heat_contained;

            neighbors_and_row.forEach(n_tile => {
                if (n_tile.part && n_tile.part.containment) {
                    total_heatsink_capacity += n_tile.part.containment;
                    total_current_heat_in_network += n_tile.heat_contained;
                }
            });

            if (total_heatsink_capacity === 0) return;
            const target_heat_percentage = total_current_heat_in_network / total_heatsink_capacity;

            // From exchanger to neighbors
            neighbors_and_row.forEach(n_tile => {
                if (n_tile.part && n_tile.part.containment) {
                    const current_n_perc = n_tile.heat_contained / n_tile.part.containment;
                    if (current_n_perc < target_heat_percentage && tile.heat_contained > 0) {
                        let heat_to_give = (target_heat_percentage - current_n_perc) * n_tile.part.containment;
                        heat_to_give = Math.min(heat_to_give, effective_transfer, tile.heat_contained);
                        if (heat_to_give > 0) {
                            tile.setHeat_contained(tile.heat_contained - heat_to_give);
                            if (n_tile.part.id === 'coolant_cell6') {
                                n_tile.setHeat_contained(n_tile.heat_contained + heat_to_give / 2);
                                power_add_this_tick += heat_to_give / 2;
                            } else {
                                n_tile.setHeat_contained(n_tile.heat_contained + heat_to_give);
                            }
                        }
                    }
                }
            });
            // From neighbors to exchanger
            neighbors_and_row.forEach(n_tile => {
                 if (n_tile.part && n_tile.part.containment) {
                    const current_n_perc = n_tile.heat_contained / n_tile.part.containment;
                    if (current_n_perc > target_heat_percentage && tile.heat_contained < exchanger.containment) {
                        let heat_to_take = (current_n_perc - target_heat_percentage) * n_tile.part.containment;
                        heat_to_take = Math.min(heat_to_take, effective_transfer, n_tile.heat_contained);
                         if (heat_to_take > 0) {
                            n_tile.setHeat_contained(n_tile.heat_contained - heat_to_take);
                            tile.setHeat_contained(tile.heat_contained + heat_to_take);
                        }
                    }
                }
            });
        });

        // Outlets move heat from reactor to components
        if (game.stats_outlet > 0) { // Only if outlets exist
            let max_heat_per_outlet_path = game.current_heat / game.stats_outlet; 
            if (game.heat_controlled && game.upgrade_objects['heat_control_operator'] && game.upgrade_objects['heat_control_operator'].level > 0) {
                 if (game.current_heat > game.max_heat) {
                    max_heat_per_outlet_path = (game.current_heat - game.max_heat) / game.stats_outlet;
                 } else {
                    max_heat_per_outlet_path = 0; // Don't outlet if below max heat and controller is on
                 }
            }

            active_outlets_list.forEach(tile => {
                const transfer_cap = tile.getEffectiveTransferValue();
                tile.containments.forEach(cont_tile => {
                    if (cont_tile.part && cont_tile.part.containment && game.current_heat > 0) {
                        let heat_to_transfer = Math.min(transfer_cap, max_heat_per_outlet_path * transfer_cap, game.current_heat);
                        
                        if (game.heat_outlet_controlled && cont_tile.part.vent) { // Better Heat Control Operator
                            const vent_capacity_remaining = cont_tile.getEffectiveVentValue() - cont_tile.heat_contained;
                            heat_to_transfer = Math.min(heat_to_transfer, Math.max(0, vent_capacity_remaining));
                        }
                        
                        if (heat_to_transfer > 0) {
                            game.current_heat -= heat_to_transfer;
                            heat_remove_this_tick += heat_to_transfer; // Track heat removed by outlets
                             if (cont_tile.part.id === 'coolant_cell6') {
                                cont_tile.setHeat_contained(cont_tile.heat_contained + heat_to_transfer / 2);
                                power_add_this_tick += heat_to_transfer / 2;
                            } else {
                                cont_tile.setHeat_contained(cont_tile.heat_contained + heat_to_transfer);
                            }
                        }
                    }
                });
            });
        }
        // ui.say('var', 'heat_remove', heat_remove_this_tick); // Heat removed by outlets

        // Phase 4: Passive heat reduction and component-specific heat effects (vents)
        if (game.current_heat > 0) {
            if (game.current_heat <= game.max_heat && (!game.heat_controlled || !game.upgrade_objects['heat_control_operator'] || !game.upgrade_objects['heat_control_operator'].level > 0)) {
                heat_passively_reduced_this_tick = game.max_heat / 10000; // Tiny passive reduction
            } else if (game.current_heat > game.max_heat) { // Overheating
                heat_passively_reduced_this_tick = (game.current_heat - game.max_heat) / 20;
                if (heat_passively_reduced_this_tick < game.max_heat / 10000) {
                    heat_passively_reduced_this_tick = game.max_heat / 10000;
                }
                // Distribute some of this excess heat back into components (original logic)
                const num_active_containment_tiles = game.active_tiles_list.filter(t => t.activated && t.part && t.part.containment).length;
                if (num_active_containment_tiles > 0) {
                    const heat_to_distribute_per_tile = heat_passively_reduced_this_tick / num_active_containment_tiles;
                    game.active_tiles_list.forEach(t => {
                        if (t.activated && t.part && t.part.containment) {
                             if (t.part.id === 'coolant_cell6') {
                                t.setHeat_contained(t.heat_contained + heat_to_distribute_per_tile / 2);
                                power_add_this_tick += heat_to_distribute_per_tile / 2;
                            } else {
                                t.setHeat_contained(t.heat_contained + heat_to_distribute_per_tile);
                            }
                        }
                    });
                }
            }
            game.current_heat -= heat_passively_reduced_this_tick;
            ui.say('var', 'auto_heat_reduce', heat_passively_reduced_this_tick);
        }
        
        // Process Vents and other specialized parts
        game.active_tiles_list.forEach(tile => {
            if (tile.activated && tile.part && tile.heat_contained > 0) {
                if (tile.part.vent) { // Is a vent
                    let vent_amount = tile.getEffectiveVentValue();
                    if (tile.part.id === 'vent6') { // Extreme Vent consumes power
                        const power_to_consume = Math.min(vent_amount, tile.heat_contained, game.current_power);
                        vent_amount = power_to_consume; // Can only vent as much as power allows
                        game.current_power -= power_to_consume;
                    }
                    const actual_vented = Math.min(vent_amount, tile.heat_contained);
                    tile.setHeat_contained(tile.heat_contained - actual_vented);
                }
                // Black Hole Particle Accelerator
                if (tile.part.id === 'particle_accelerator6') {
                    const transfer_amount = tile.getEffectiveTransferValue();
                    const heat_and_power_to_pull = Math.min(transfer_amount, game.current_power, game.current_heat);
                    if (heat_and_power_to_pull > 0) {
                        game.current_power -= heat_and_power_to_pull;
                        game.current_heat -= heat_and_power_to_pull;
                        tile.setHeat_contained(tile.heat_contained + heat_and_power_to_pull);
                    }
                }
            }
        });

        // Phase 5: Apply power multipliers, update totals
        if (game.heat_power_multiplier > 0 && game.current_heat > 1000) {
            // Power bonus: 1% per level per log1000(current_heat)
            const heat_factor = Math.log(game.current_heat) / Math.log(1000); // How many "1000s" of heat in log scale
            power_add_this_tick *= (1 + (game.heat_power_multiplier * heat_factor / 100));
        }
        game.current_power += power_add_this_tick;
        ui.say('var', 'power_add', power_add_this_tick);

        // Phase 6: Check for component failure (overheating)
        game.active_tiles_list.forEach(tile => {
            if (tile.activated && tile.part && tile.part.containment && tile.heat_contained > tile.part.containment) {
                // Perpetual capacitor check
                if (!game.auto_buy_disabled && tile.heat <= 0 && // Assuming tile.heat refers to heat generation by this part
                    tile.part.category === 'capacitor' &&
                    game.upgrade_objects['perpetual_capacitors'] && game.upgrade_objects['perpetual_capacitors'].level > 0 &&
                    game.current_money >= tile.part.cost * 10) {
                    
                    game.current_money -= tile.part.cost * 10;
                    ui.say('var', 'current_money', game.current_money);
                    heat_add_next_loop += tile.heat_contained; // Vent its heat to reactor
                    tile.setHeat_contained(0); // "Repaired"
                } else { // Explode
                    if (tile.part.category === 'particle_accelerator') meltdown_imminent = true;
                    if(tile.$el) tile.$el.classList.add('exploding');
                    needs_reactor_stats_update = true;
                    game.remove_part_from_tile(tile, true, false); // Remove without selling
                }
            }
        });
        
        // Phase 7: Auto-buy queued parts
        if (tile_queue.length > 0) {
            let processed_count = 0;
            for (let i = 0; i < tile_queue.length; i++) {
                const queued_tile = tile_queue[i];
                if (!queued_tile.part || queued_tile.activated) { // Already handled or no part
                    processed_count++;
                    continue;
                }
                if (game.current_money >= queued_tile.part.cost) {
                    game.current_money -= queued_tile.part.cost;
                    ui.say('var', 'current_money', game.current_money);
                    queued_tile.activated = true;
                    if(queued_tile.$el) queued_tile.$el.classList.remove('disabled');
                    needs_reactor_stats_update = true;
                    processed_count++;
                } else {
                    break; // Stop if can't afford the current one
                }
            }
            if (processed_count > 0) tile_queue.splice(0, processed_count);
        }

        // Phase 8: Auto-sell power
        if (!game.auto_sell_disabled && game.auto_sell_multiplier > 0) {
            money_from_auto_sell_this_tick = Math.min(game.current_power, Math.ceil(game.max_power * game.auto_sell_multiplier));
            if (money_from_auto_sell_this_tick > 0) {
                game.current_power -= money_from_auto_sell_this_tick;
                game.current_money += money_from_auto_sell_this_tick;
                ui.say('var', 'money_add', money_from_auto_sell_this_tick);
                ui.say('var', 'current_money', game.current_money);
                
                // Extreme capacitor effect
                const heat_per_extreme_cap = (money_from_auto_sell_this_tick * 0.5) / (active_extreme_capacitors_list.length || 1);
                active_extreme_capacitors_list.forEach(tile => {
                    tile.setHeat_contained(tile.heat_contained + heat_per_extreme_cap);
                });
            }
        }

        // Phase 9: Cap power, ensure heat is not negative
        if (game.current_power > game.max_power) game.current_power = game.max_power;
        if (game.current_heat < 0) game.current_heat = 0;

        // Phase 10: Exotic Particle generation
        if (ep_chance_this_tick > 0) {
            let ep_gained_this_tick = 0;
            if (ep_chance_this_tick >= 1) {
                ep_gained_this_tick = Math.floor(ep_chance_this_tick);
                ep_chance_this_tick -= ep_gained_this_tick;
            }
            if (Math.random() < ep_chance_this_tick) {
                ep_gained_this_tick++;
            }
            if (ep_gained_this_tick > 0) {
                game.exotic_particles += ep_gained_this_tick;
                ui.say('var', 'exotic_particles', game.exotic_particles);
            }
        }

        // Phase 11: Meltdown check
        if (meltdown_imminent || game.current_heat > game.max_heat * 2) {
            was_melting_down = true; // Use was_melting_down to show message only once
            game.has_melted_down = true;
            game.active_tiles_list.forEach(tile => {
                if (tile.part) {
                    if(tile.$el) tile.$el.classList.add('exploding');
                    game.remove_part_from_tile(tile, true, false);
                }
            });
            game.current_heat = game.max_heat * 2 + 1; // Ensure it stays critical
            needs_reactor_stats_update = true;
            game.save_manager.active_saver.save(game.saves()); // Save on meltdown
            ui.say('var', 'melting_down', true);
        } else if (was_melting_down) { // Recovered from meltdown state display
            was_melting_down = false;
            ui.say('var', 'melting_down', false);
        }

        if (needs_reactor_stats_update) {
            game.update_reactor_stats();
        }

        // Update UI for primary stats
        ui.say('var', 'current_money', game.current_money);
        ui.say('var', 'current_power', game.current_power);
        ui.say('var', 'max_power', game.max_power);
        ui.say('var', 'current_heat', game.current_heat);
        ui.say('var', 'max_heat', game.max_heat);
        game.tooltip_manager.request_update(); // Update tooltip if open
        
        // Store prediction for offline ticks (simplified)
        game_stat_prediction.heat_add = heat_add_this_tick;
        game_stat_prediction.heat_remove = heat_remove_this_tick;
        game_stat_prediction.reduce_heat = heat_passively_reduced_this_tick;
        game_stat_prediction.power_add = power_add_this_tick;
        game_stat_prediction.sell_amount = money_from_auto_sell_this_tick;
        game_stat_prediction.ep_chance_add = ep_chance_this_tick; // Store the chance itself

        // console.log("Loop time:", performance.now() - loop_start_time, "ms");
    }

    function game_loop() {
        if (!last_tick_time) last_tick_time = performance.now();
        
        const now = performance.now();
        let effective_loop_wait = game.loop_wait; // Base loop wait

        dtime += (now - last_tick_time);
        last_tick_time = now;

        let ticks_to_process = Math.floor(dtime / effective_loop_wait);

        if (ticks_to_process > 0) {
            if (ticks_to_process > 100 && game.offline_tick) { // Cap offline simulation to avoid freezing
                console.warn(`Attempting to process ${ticks_to_process} offline ticks. Capping to 100.`);
                ticks_to_process = 100; 
            }

            for (let i = 0; i < ticks_to_process; i++) {
                _game_loop();
                if (game.paused || was_melting_down) break; // Stop processing if paused or meltdown
            }
            dtime -= ticks_to_process * effective_loop_wait;
        }
        
        ui.say('var', 'flux_tick_time', dtime); // Show remaining dtime for flux display

        if (!game.paused) {
            clearTimeout(loop_timeout);
            // Adjust next timeout if flux is enabled and significant dTime remains
            let next_timeout_delay = (game.time_flux && dtime > effective_loop_wait / 2) ? 10 : effective_loop_wait;
            loop_timeout = setTimeout(game_loop, next_timeout_delay);
        }
    }
    
    // --- Global Window Functions for UI buttons ---
    window.pause_game = function() { game.paused = true; clearTimeout(loop_timeout); last_tick_time = 0; dtime = 0; ui.say('evt', 'paused'); };
    window.unpause_game = function() { if (!game.paused) return; game.paused = false; last_tick_time = performance.now(); dtime = 0; game_loop(); ui.say('evt', 'unpaused'); };
    window.disable_auto_sell = () => { game.auto_sell_disabled = true; ui.say('evt', 'auto_sell_disabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_auto_sell = () => { game.auto_sell_disabled = false; ui.say('evt', 'auto_sell_enabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.disable_auto_buy = () => { game.auto_buy_disabled = true; ui.say('evt', 'auto_buy_disabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_auto_buy = () => { game.auto_buy_disabled = false; ui.say('evt', 'auto_buy_enabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.disable_heat_control = () => { game.heat_controlled = false; ui.say('evt', 'heat_control_disabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_heat_control = () => { game.heat_controlled = true; ui.say('evt', 'heat_control_enabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.disable_time_flux = () => { game.time_flux = false; ui.say('evt', 'time_flux_disabled'); _updateAllToggleBtnStatesForAppJs(); };
    window.enable_time_flux = () => { game.time_flux = true; ui.say('evt', 'time_flux_enabled'); _updateAllToggleBtnStatesForAppJs(); };

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
            }, 120); // Repeat every 120ms
        }, 350); // Initial delay before repeat
    }
    function stopCoolRepeat() {
        if (coolBtnTimeout) clearTimeout(coolBtnTimeout);
        if (coolBtnInterval) clearInterval(coolBtnInterval);
        coolBtnTimeout = null;
        coolBtnInterval = null;
    }
    if (coolBtn) {
        coolBtn.addEventListener('mousedown', startCoolRepeat);
        coolBtn.addEventListener('touchstart', startCoolRepeat);
        coolBtn.addEventListener('mouseup', stopCoolRepeat);
        coolBtn.addEventListener('mouseleave', stopCoolRepeat);
        coolBtn.addEventListener('touchend', stopCoolRepeat);
        coolBtn.addEventListener('touchcancel', stopCoolRepeat);
    }

    // Helper in app.js to update button states if they are not fully managed by app.ui.js yet
    function _updateAllToggleBtnStatesForAppJs() {
        if (ui && typeof ui._updateAllToggleBtnStates === 'function') {
            ui._updateAllToggleBtnStates();
        } else if (ui && game) {
            ui.say('var', 'auto_sell_disabled_state_change', game.auto_sell_disabled);
        }
    }

    // Start the game loop
    game_loop();
    ui.say('evt', 'game_inited'); // Notify UI that game essentials are set up
});
