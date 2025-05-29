import { addProperty } from '../util.js'; // Corrected import path

export class Game {
    constructor(ui_instance) {
        this.ui = ui_instance;
        this.version = '1.3.2';
        this.base_cols = 14;
        this.base_rows = 11;
        this.max_cols = 35;
        this.max_rows = 32;
        this.debug = false;
        this.save_debug = false; // For debugging save/load
        this.offline_tick = true;
        this.base_loop_wait = 1000;
        this.base_power_multiplier = 1;
        this.base_heat_multiplier = 4;
        this.base_manual_heat_reduce = 1;
        this.upgrade_max_level = 32; // Used by Upgrade class
        this.base_max_heat = 1000;
        this.base_max_power = 100;
        this.base_money = 10;
        this.save_interval = 60000; // 1 minute

        // Game State Variables
        this.current_power = 0;
        this.current_heat = 0;
        this.current_money = 0;
        this.max_heat = 0;
        this.max_power = 0;
        this.power_multiplier = 1;
        this.heat_multiplier = 1;
        this.protium_particles = 0;
        this.total_exotic_particles = 0; // Total ever earned before reboot
        this.exotic_particles = 0;       // Total earnable on current run
        this.current_exotic_particles = 0; // Spendable EP

        this._rows = this.base_rows; // Internal, use getter/setter
        this._cols = this.base_cols; // Internal, use getter/setter

        this.tiles = []; // 2D array [row][col]
        this.tiles_list = []; // Flat list of all tile objects

        this.active_tiles = []; // Filtered 2D array based on current rows/cols
        this.active_tiles_list = []; // Filtered flat list

        this.loop_wait = this.base_loop_wait;
        this.heat_power_multiplier = 0;
        this.heat_controlled = false;
        this.heat_outlet_controlled = false;
        this.manual_heat_reduce = this.base_manual_heat_reduce;
        this.auto_sell_multiplier = 0;
        this.transfer_plating_multiplier = 0;
        this.transfer_capacitor_multiplier = 0;
        this.vent_plating_multiplier = 0;
        this.vent_capacitor_multiplier = 0;
        this.altered_max_power = this.base_max_power;
        this.altered_max_heat = this.base_max_heat;

        this.stats_power = 0; // Calculated per tick
        this.stats_heat_generation = 0; // Calculated per tick
        this.stats_cash = 0;  // Calculated auto-sell per tick
        this.stats_vent = 0;
        this.stats_inlet = 0;
        this.stats_outlet = 0;

        this.paused = false;
        this.auto_sell_disabled = false;
        this.auto_buy_disabled = false;
        this.time_flux = true;
        this.has_melted_down = false;
        this.sold_power = false;
        this.sold_heat = false;

        this.part_objects_array = [];
        this.part_objects = {};
        this.upgrade_objects_array = [];
        this.upgrade_objects = {};

        this.save_manager = new window.SaveManager(this); // Initialize SaveManager
    }

    set_defaults() {
        this.current_heat = 0;
        this.current_power = 0;
        this.current_money = this.base_money;
        this.rows = this.base_rows; // Uses setter
        this.cols = this.base_cols; // Uses setter
        this.max_heat = this.base_max_heat;
        this.altered_max_heat = this.base_max_heat;
        this.max_power = this.base_max_power;
        this.altered_max_power = this.base_max_power;
        this.auto_sell_multiplier = 0;
        this.loop_wait = this.base_loop_wait;
        this.power_multiplier = this.base_power_multiplier;
        this.heat_multiplier = this.base_heat_multiplier;
        this.manual_heat_reduce = this.base_manual_heat_reduce;
        this.vent_capacitor_multiplier = 0;
        this.vent_plating_multiplier = 0;
        this.transfer_capacitor_multiplier = 0;
        this.transfer_plating_multiplier = 0;
        this.heat_power_multiplier = 0;
        this.heat_controlled = false;
        this.heat_outlet_controlled = false;
        this.time_flux = true;
        this.protium_particles = 0;
        this.exotic_particles = 0;
        this.current_exotic_particles = 0;
        this.total_exotic_particles = 0;
        this.has_melted_down = false;
        this.sold_power = false;
        this.sold_heat = false;

        // Reset parts and upgrades levels (their definitions remain)
        this.part_objects_array.forEach(p => p.setAffordable(false)); // affordability check will run
        this.upgrade_objects_array.forEach(u => u.setLevel(0));

        // Clear reactor tiles
        this.tiles_list.forEach(tile => {
            if (tile.part) {
                // Simulate removing part without refund for a full reset
                tile.part = null;
                tile.setTicks(0);
                tile.setHeat_contained(0);
                tile.activated = false;
                tile.updated = true; // Mark for UI update
                if (tile.$el) {
                     tile.$el.className = 'tile'; // Reset classes
                     if (tile.enabled) tile.$el.classList.add('enabled');
                }
            }
        });
        this.update_reactor_stats(); // Recalculate all stats
        this.ui.say('evt', 'game_reset'); // Notify UI
    }

    // Called after set_defaults or after loading minimal save data
    initialize_new_game_state() {
        // This ensures UI reflects the reset/new state
        this.ui.say('var', 'current_money', this.current_money);
        this.ui.say('var', 'current_power', this.current_power);
        this.ui.say('var', 'current_heat', this.current_heat);
        this.ui.say('var', 'max_power', this.max_power);
        this.ui.say('var', 'max_heat', this.max_heat);
        this.ui.say('var', 'exotic_particles', this.exotic_particles);
        this.ui.say('var', 'current_exotic_particles', this.current_exotic_particles);

        this.update_active_tiles_display(); // Ensure correct tiles are shown/hidden
        this.update_reactor_stats();
    }

    update_active_tiles_display() {
        for (let r = 0; r < this.max_rows; r++) {
            for (let c = 0; c < this.max_cols; c++) {
                const tile = this.tiles[r] && this.tiles[r][c];
                if (tile) {
                    if (r < this._rows && c < this._cols) {
                        if (!tile.enabled) tile.enable();
                    } else {
                        if (tile.enabled) tile.disable();
                    }
                }
            }
        }
        // Rebuild active_tiles and active_tiles_list
        this.active_tiles = [];
        this.active_tiles_list = [];
        for (let r = 0; r < this._rows; r++) {
            const row_array = [];
            for (let c = 0; c < this._cols; c++) {
                const tile = this.tiles[r][c];
                row_array.push(tile);
                this.active_tiles_list.push(tile);
            }
            this.active_tiles.push(row_array);
        }
    }

    get rows() { return this._rows; }
    set rows(length) {
        const old_rows = this._rows;
        this._rows = Math.min(length, this.max_rows);
        if (this._rows > old_rows || this.tiles.length > 0) { // Update if rows increased or tiles exist
             this.update_active_tiles_display();
        }
    }

    get cols() { return this._cols; }
    set cols(length) {
        const old_cols = this._cols;
        this._cols = Math.min(length, this.max_cols);
        if (this._cols !== old_cols || (this.tiles[0] && this.tiles[0].length > 0) ) { // Check if value actually changed
            this.update_active_tiles_display();
            if (this.ui && typeof this.ui.updateReactorGridColumns === 'function') {
                this.ui.updateReactorGridColumns();
            }
        }
    }

    // Update cell power based on protium particles and upgrades
    update_cell_power() {
        const infused_level = this.upgrade_objects['infused_cells'] ? this.upgrade_objects['infused_cells'].level : 0;
        const unleashed_level = this.upgrade_objects['unleashed_cells'] ? this.upgrade_objects['unleashed_cells'].level : 0;
        const unstable_protium_level = this.upgrade_objects['unstable_protium'] ? this.upgrade_objects['unstable_protium'].level : 0;

        this.part_objects_array.forEach(part_obj => {
            if (part_obj.category === 'cell') {
                let base_power = part_obj.part.base_power;
                let base_heat = part_obj.part.base_heat;
                let base_ticks = part_obj.part.base_ticks;

                // Apply Infused Cells
                base_power *= (1 + infused_level);

                // Apply Unleashed Cells
                base_power *= Math.pow(2, unleashed_level);
                base_heat *= Math.pow(2, unleashed_level);
                
                // Apply Protium specific logic
                if (part_obj.part.type === 'protium') {
                    base_power *= (1 + (this.protium_particles * 0.1)); // 10% per depleted protium cell
                     // Apply Unstable Protium
                    base_power *= Math.pow(2, unstable_protium_level);
                    base_heat *= Math.pow(2, unstable_protium_level);
                    base_ticks = Math.ceil(part_obj.part.base_ticks / Math.pow(2, unstable_protium_level));
                }
                
                // Apply cell level multipliers (dual, quad)
                const cell_power_multipliers = [1, 4, 12]; // Assuming these are fixed or configurable elsewhere
                const cell_heat_multipliers = [1, 8, 36];
                const level_idx = part_obj.part.level -1;

                part_obj.power = base_power * (cell_power_multipliers[level_idx] || 1);
                part_obj.heat = base_heat * (cell_heat_multipliers[level_idx] || 1);
                part_obj.ticks = base_ticks; // Ticks might also be affected by upgrades

                // Apply general power/heat multipliers from game state
                part_obj.power *= this.power_multiplier;
                part_obj.heat *= this.heat_multiplier;

                part_obj.updateDescription();
            }
        });
        this.update_reactor_stats(); // Recalculate overall reactor stats
    }

    // Central place for stats recalculation, similar to original update_tiles
    update_reactor_stats() {
        this._reset_stats();
        let current_max_power = this.altered_max_power;
        let current_max_heat = this.altered_max_heat;
        let temp_transfer_multiplier = 0;
        let temp_vent_multiplier = 0;
        this.active_tiles_list.forEach(tile => {
            if (tile.activated && tile.part) {
                this._reset_tile_stats(tile);
                this._gather_neighbors(tile);
                if (tile.part.category === 'cell' && tile.ticks > 0) {
                    this._apply_reflector_effects(tile);
                    this.stats_power += tile.power;
                    this.stats_heat_generation += tile.heat;
                }
                if (tile.part.reactor_power) current_max_power += tile.part.reactor_power;
                if (tile.part.reactor_heat) current_max_heat += tile.part.reactor_heat;
                if (tile.part.id === 'reactor_plating6') current_max_power += tile.part.reactor_heat;
                if (tile.part.category === 'capacitor') {
                    temp_transfer_multiplier += (tile.part.level || 1) * this.transfer_capacitor_multiplier;
                    temp_vent_multiplier += (tile.part.level || 1) * this.vent_capacitor_multiplier;
                } else if (tile.part.category === 'reactor_plating') {
                    temp_transfer_multiplier += (tile.part.level || 1) * this.transfer_plating_multiplier;
                    temp_vent_multiplier += (tile.part.level || 1) * this.vent_plating_multiplier;
                }
            }
        });
        this.stats_vent = 0;
        this.stats_inlet = 0;
        this.stats_outlet = 0;
        window.vent_multiplier_eff = temp_vent_multiplier;
        window.transfer_multiplier_eff = temp_transfer_multiplier;
        this.active_tiles_list.forEach(tile => {
            if (tile.activated && tile.part) {
                if (tile.part.vent) {
                    this.stats_vent += tile.getEffectiveVentValue();
                }
                if (tile.part.category === 'heat_inlet') {
                    this.stats_inlet += tile.getEffectiveTransferValue() * tile.containments.length;
                }
                if (tile.part.category === 'heat_outlet') {
                    this.stats_outlet += tile.getEffectiveTransferValue() * tile.containments.length;
                }
                tile.display_power = tile.power;
                tile.display_heat = tile.heat;
            }
        });
        this.max_power = current_max_power;
        this.max_heat = current_max_heat;
        this.ui.say('var', 'max_power', this.max_power);
        this.ui.say('var', 'max_heat', this.max_heat);
        this.ui.say('var', 'stats_power', this.stats_power);
        this.ui.say('var', 'total_heat', this.stats_heat_generation);
        this.ui.say('var', 'stats_vent', this.stats_vent);
        this.ui.say('var', 'stats_inlet', this.stats_inlet);
        this.ui.say('var', 'stats_outlet', this.stats_outlet);
        this.stats_cash = Math.ceil(this.max_power * this.auto_sell_multiplier);
        this.ui.say('var', 'stats_cash', this.stats_cash);
        if (this.active_tiles_list.every(t => !t.part) && this.current_power + this.current_money < this.base_money) {
            this.current_money = this.base_money - this.current_power;
            this.ui.say('var', 'current_money', this.current_money);
        }
    }
    _reset_stats() {
        this.stats_power = 0;
        this.stats_heat_generation = 0;
        this.stats_vent = 0;
        this.stats_inlet = 0;
        this.stats_outlet = 0;
    }
    _reset_tile_stats(tile) {
        tile.power = 0;
        tile.heat = 0;
        tile.display_power = 0;
        tile.display_heat = 0;
        tile.containments = [];
        tile.cells = [];
        tile.reflectors = [];
    }
    _gather_neighbors(tile) {
        const p = tile.part;
        const neighbors = Array.from(this.get_tile_in_range(tile, p.range || 1));
        for (const neighbor_tile of neighbors) {
            if (neighbor_tile.part && neighbor_tile.activated) {
                if (neighbor_tile.part.containment) tile.containments.push(neighbor_tile);
                if (neighbor_tile.part.category === 'cell' && neighbor_tile.ticks > 0) tile.cells.push(neighbor_tile);
                if (neighbor_tile.part.category === 'reflector') tile.reflectors.push(neighbor_tile);
            }
        }
        if (p.category === 'cell' && tile.ticks > 0) {
            tile.power = p.power;
            tile.heat = p.heat;
        }
    }
    _apply_reflector_effects(tile) {
        let reflector_power_bonus = 0;
        let reflector_heat_bonus = 0;
        tile.reflectors.forEach(r_tile => {
            if (r_tile.ticks > 0) {
                reflector_power_bonus += r_tile.part.power_increase || 0;
                reflector_heat_bonus += r_tile.part.heat_increase || 0;
            }
        });
        tile.power *= (1 + reflector_power_bonus / 100);
        tile.heat *= (1 + reflector_heat_bonus / 100);
    }

    *get_tile_in_range(center_tile, range) {
        if (!center_tile) return;
        for (let r_offset = -range; r_offset <= range; r_offset++) {
            for (let c_offset = -range; c_offset <= range; c_offset++) {
                if (r_offset === 0 && c_offset === 0) continue; // Skip center tile
                if (Math.abs(r_offset) + Math.abs(c_offset) > range) continue; // Manhattan distance for diamond shape

                const r = center_tile.row + r_offset;
                const c = center_tile.col + c_offset;

                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
                    if (this.tiles[r] && this.tiles[r][c]) {
                        yield this.tiles[r][c];
                    }
                }
            }
        }
    }
    
    *heat_exchanger6_range(center_tile) {
        if (!center_tile) return;
        // Adjacent cells (like range 1)
        if (center_tile.row > 0) yield this.tiles[center_tile.row - 1][center_tile.col];
        if (center_tile.row < this.rows - 1) yield this.tiles[center_tile.row + 1][center_tile.col];
        if (center_tile.col > 0) yield this.tiles[center_tile.row][center_tile.col - 1];
        if (center_tile.col < this.cols - 1) yield this.tiles[center_tile.row][center_tile.col + 1];

        // Rest of the row
        for (let c = 0; c < this.cols; c++) {
            if (c !== center_tile.col && !(Math.abs(c - center_tile.col) === 1 && center_tile.row === center_tile.row) ) { // Avoid double counting direct neighbors
                 if (this.tiles[center_tile.row][c]) yield this.tiles[center_tile.row][c];
            }
        }
    }

    // Save game state
    saves() {
        const state = {
            version: this.version,
            current_money: this.current_money,
            current_power: this.current_power,
            current_heat: this.current_heat,
            exotic_particles: this.exotic_particles,
            current_exotic_particles: this.current_exotic_particles,
            total_exotic_particles: this.total_exotic_particles,
            rows: this.rows,
            cols: this.cols,
            auto_sell_disabled: this.auto_sell_disabled,
            auto_buy_disabled: this.auto_buy_disabled,
            time_flux: this.time_flux,
            heat_controlled: this.heat_controlled,
            heat_outlet_controlled: this.heat_outlet_controlled,
            has_melted_down: this.has_melted_down,
            paused: this.paused,
            loop_wait: this.loop_wait,
            upgrades: this.upgrade_objects_array.map(upg => ({ id: upg.upgrade.id, level: upg.level })),
            reactor: this.tiles_list.map(t => t.part ? {
                part_id: t.part.id,
                row: t.row,
                col: t.col,
                ticks: t.ticks,
                heat_contained: t.heat_contained,
                activated: t.activated
            } : null).filter(t => t !== null),
            objective_current: this.objectives_manager ? this.objectives_manager.current_objective : 0,
            protium_particles: this.protium_particles,
        };
        if (this.save_debug) console.log("Game state to save:", state);
        return JSON.stringify(state);
    }

    // Load game state
    loads(json_string) {
        if (!json_string) {
            console.log("No save data provided, initializing defaults.");
            this.set_defaults();
            this.initialize_new_game_state();
            if(this.objectives_manager) this.objectives_manager.set_objective(0, true);
            this.update_reactor_stats();
            this.ui.say('evt', 'game_loaded');
            return;
        }
        try {
            const state = JSON.parse(json_string);
            if (this.save_debug) console.log("Loading game state:", state);
            if (state.version !== this.version) {
                console.warn(`Save game version ${state.version} does not match current version ${this.version}. Loading may be unstable.`);
            }
            this.set_defaults();
            this.current_money = state.current_money || this.base_money;
            this.current_power = state.current_power || 0;
            this.current_heat = state.current_heat || 0;
            this.exotic_particles = state.exotic_particles || 0;
            this.current_exotic_particles = state.current_exotic_particles || 0;
            this.total_exotic_particles = state.total_exotic_particles || 0;
            this.protium_particles = state.protium_particles || 0;
            this.rows = state.rows || this.base_rows;
            this.cols = state.cols || this.base_cols;
            this.auto_sell_disabled = state.auto_sell_disabled === true;
            this.auto_buy_disabled = state.auto_buy_disabled === true;
            this.time_flux = state.time_flux !== undefined ? state.time_flux : true;
            this.heat_controlled = state.heat_controlled === true;
            this.heat_outlet_controlled = state.heat_outlet_controlled === true;
            this.has_melted_down = state.has_melted_down === true;
            this.paused = state.paused === true;
            this.loop_wait = state.loop_wait || this.base_loop_wait;
            if (state.upgrades) {
                state.upgrades.forEach(saved_upg => {
                    const upg_obj = this.upgrade_objects[saved_upg.id];
                    if (upg_obj) {
                        upg_obj.setLevel(saved_upg.level);
                    }
                });
            }
            if (state.reactor) {
                state.reactor.forEach(saved_tile => {
                    if (saved_tile && this.tiles[saved_tile.row] && this.tiles[saved_tile.row][saved_tile.col]) {
                        const tile = this.tiles[saved_tile.row][saved_tile.col];
                        const part_obj = this.part_objects[saved_tile.part_id];
                        if (part_obj) {
                            tile.part = part_obj;
                            tile.setTicks(saved_tile.ticks);
                            tile.setHeat_contained(saved_tile.heat_contained);
                            tile.activated = saved_tile.activated;
                            if (tile.$el) {
                                tile.$el.className = 'tile';
                                if (tile.enabled) tile.$el.classList.add('enabled');
                                tile.$el.classList.add('part_' + part_obj.id, 'category_' + part_obj.category);
                                if (!tile.activated) tile.$el.classList.add('disabled');
                                if (part_obj.ticks && tile.ticks === 0) tile.$el.classList.add('spent');
                            }
                        }
                    }
                });
            }
            if (this.objectives_manager && typeof state.objective_current === 'number') {
                this.objectives_manager.current_objective = state.objective_current;
                this.objectives_manager.set_objective(state.objective_current, true);
            }
            this.update_cell_power();
            this.update_reactor_stats();
            this.initialize_new_game_state();
            this.ui.say('evt', 'game_loaded');
            console.log("Game loaded successfully.");
        } catch (e) {
            console.error("Failed to load game state:", e);
            this.set_defaults();
            this.initialize_new_game_state();
            if(this.objectives_manager) this.objectives_manager.set_objective(0, true);
        }
    }

    epart_onclick(purchased_upgrade) {
        // Called when an "experimental_parts" upgrade is purchased.
        // Recalculate the EP cost of other experimental parts.
        console.log(`${purchased_upgrade.upgrade.title} purchased. Updating EP costs for other experimental parts.`);
        this.upgrade_objects_array.forEach(upg => {
            if (upg.upgrade.type === 'experimental_parts' && upg.upgrade.id !== purchased_upgrade.upgrade.id) {
                upg.updateDisplayCost();
                if (this.ui && typeof this.ui.check_upgrades_affordability === 'function') {
                    this.ui.check_upgrades_affordability();
                }
            }
        });
    }

    manual_reduce_heat_action() {
        if (this.current_heat > 0) {
            this.current_heat -= this.manual_heat_reduce;
            if (this.current_heat < 0) this.current_heat = 0;
            if (this.current_heat === 0) this.sold_heat = true; // Objective flag
            this.ui.say('var', 'current_heat', this.current_heat);
        }
    }

    sell_action() {
        if (this.current_power > 0) {
            this.current_money += this.current_power;
            this.current_power = 0;
            this.ui.say('var', 'current_money', this.current_money);
            this.ui.say('var', 'current_power', this.current_power);
            this.sold_power = true; // Objective flag
        }
    }

    reboot_action(refund_ep = false) {
        if (refund_ep) {
            // Refund logic: reset all EP upgrades and restore all earned EP
            this.current_exotic_particles = this.total_exotic_particles;
            this.upgrade_objects_array.forEach(upg => {
                if (upg.upgrade.ecost) upg.setLevel(0);
            });
        }
        this.total_exotic_particles += this.exotic_particles;
        this.current_exotic_particles = this.total_exotic_particles;
        this.exotic_particles = 0;
        this.set_defaults();
        this.initialize_new_game_state();
        if (this.objectives_manager) this.objectives_manager.set_objective(0, true);
        this.ui.say('var', 'current_exotic_particles', this.current_exotic_particles);
        this.ui.say('var', 'exotic_particles', this.exotic_particles);
        if (this.save_manager && this.save_manager.active_saver) {
            this.save_manager.active_saver.save(this.saves());
        }
        console.log(`Game rebooted. Refund EP: ${refund_ep}`);
    }

    // Remove a part from a tile, handling refund, explosion, and UI updates
    remove_part_from_tile(tile, exploding = false, refund = true) {
        if (!tile || !tile.part) return;

        const partHeat = tile.heat_contained; // Capture heat before clearing

        if (refund && tile.activated) {
            let sell_value = tile.part.cost;
            if (tile.part.ticks > 0) { // Ensure part is supposed to have ticks
                sell_value = Math.ceil(tile.ticks / tile.part.ticks * tile.part.cost);
            } else if (tile.part.containment > 0) { // Ensure part is supposed to have containment
                sell_value = tile.part.cost - Math.ceil(tile.heat_contained / tile.part.containment * tile.part.cost);
            }
            this.current_money += Math.max(0, sell_value);
            this.ui.say('var', 'current_money', this.current_money);
        }

        tile.clearPart(); // Clear part data, refund is handled above or skipped

        if (exploding) {
            if (tile.$el) {
                tile.$el.classList.add('exploding');
                // Add heat from explosion to next loop's heat budget
                // This was 'heat_add_next_loop += partHeat;' in app.js, needs similar mechanism or direct handling
                // For now, let's assume this heat just vanishes or is part of a visual effect.
                // If it should affect game mechanics, game._game_loop needs access to heat_add_next_loop.
                // Simplest: game.current_heat += partHeat; // Add directly to current heat (can be dangerous)
                // Better: a buffer like heat_add_next_loop, accessible by game loop.
                // For now, this.addHeatToNextTick(partHeat); // Placeholder for a method
                
                setTimeout(() => {
                    if (tile.$el) tile.$el.classList.remove('exploding');
                    this.update_reactor_stats(); // Update stats after visual effect
                }, 600); // Match animation duration from CSS
            } else {
                this.update_reactor_stats();
            }
        } else {
            this.update_reactor_stats();
        }
    }

    // Helper for managing heat to be added in the next game tick
    // This would be used if heat_add_next_loop needs to be a Game property
    // addHeatToNextTick(amount) {
    //    this.pending_heat_next_tick = (this.pending_heat_next_tick || 0) + amount;
    // }
}
Game.prototype.addProperty = addProperty; // Attach the imported function
