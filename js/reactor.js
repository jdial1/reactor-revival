import { addProperty } from './util.js';

export class Reactor {
    constructor(game) {
        this.game = game;
        this.current_heat = 0;
        this.current_power = 0;
        this.max_heat = 0;
        this.max_power = 0;
        this.heat_power_multiplier = 0;
        this.heat_controlled = false;
        this.heat_outlet_controlled = false;
        this.manual_heat_reduce = 1;
        this.auto_sell_multiplier = 0;
        this.transfer_plating_multiplier = 0;
        this.transfer_capacitor_multiplier = 0;
        this.vent_plating_multiplier = 0;
        this.vent_capacitor_multiplier = 0;
        this.altered_max_power = 100;
        this.altered_max_heat = 1000;
        this.stats_power = 0;
        this.stats_heat_generation = 0;
        this.stats_vent = 0;
        this.stats_inlet = 0;
        this.stats_outlet = 0;
        this.has_melted_down = false;
        this.sold_power = false;
        this.sold_heat = false;
        this.base_max_heat = 1000;
        this.base_max_power = 100;
    }

    setDefaults() {
        this.current_heat = 0;
        this.current_power = 0;
        this.max_heat = this.base_max_heat;
        this.altered_max_heat = this.base_max_heat;
        this.max_power = this.base_max_power;
        this.altered_max_power = this.base_max_power;
        this.auto_sell_multiplier = 0;
        this.heat_power_multiplier = 0;
        this.heat_controlled = false;
        this.heat_outlet_controlled = false;
        this.vent_capacitor_multiplier = 0;
        this.vent_plating_multiplier = 0;
        this.transfer_capacitor_multiplier = 0;
        this.transfer_plating_multiplier = 0;
        this.has_melted_down = false;
        this.sold_power = false;
        this.sold_heat = false;
    }

    updateStats(tileset,eventHandler) {
        this._resetStats();
        let current_max_power = this.altered_max_power;
        let current_max_heat = this.altered_max_heat;
        let temp_transfer_multiplier = 0;
        let temp_vent_multiplier = 0;
        if(!tileset) return;

        tileset.active_tiles_list.forEach(tile => {
            if (tile.activated && tile.part) {
                this._resetTileStats(tile);
                this._gatherNeighbors(tileset,tile);
                if (tile.part.category === 'cell' && tile.ticks > 0) {
                    this._applyReflectorEffects(tile);
                    this.stats_power += tile.power;
                    this.stats_heat_generation += tile.heat;
                }
                if (tile.part.reactor_power) {
                    if (isNaN(tile.part.reactor_power)) console.log('tile.part.reactor_power is NaN', tile.part, tile.part.reactor_power);
                    current_max_power += tile.part.reactor_power;
                }

                if (tile.part.reactor_heat) {
                    if (isNaN(tile.part.reactor_heat)) console.log('tile.part.reactor_heat is NaN', tile.part, tile.part.reactor_heat);
                    current_max_heat += tile.part.reactor_heat;
                }

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
        this.vent_multiplier_eff = temp_vent_multiplier;
        this.transfer_multiplier_eff = temp_transfer_multiplier;

        tileset.active_tiles_list.forEach(tile => {
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

        this.max_power = Number(current_max_power);
        this.max_heat = Number(current_max_heat);

        // Fallback if they are still NaN
        if (isNaN(this.max_power)) {
            this.max_power = this.game.base_max_power || 0;
        }
        if (isNaN(this.max_heat)) {
            this.max_heat = this.game.base_max_heat || 0;
        }

        eventHandler.setVar('max_power', this.max_power);
        eventHandler.setVar('max_heat', this.max_heat);
        eventHandler.setVar('stats_power', this.stats_power);
        eventHandler.setVar('total_heat', this.stats_heat_generation);
        eventHandler.setVar('stats_vent', this.stats_vent);
        eventHandler.setVar('stats_inlet', this.stats_inlet);
        eventHandler.setVar('stats_outlet', this.stats_outlet);
        this.stats_cash = Math.ceil(this.max_power * this.auto_sell_multiplier);
        eventHandler.setVar('stats_cash', this.stats_cash);


        if (tileset.active_tiles_list.every(t => !t.part) 
            && this.current_power + eventHandler.getVar('current_money') < eventHandler.getVar('base_money')) {
            eventHandler.setVar('current_money', eventHandler.getVar('base_money') - this.current_power);
        }
    }

    _resetStats() {
        this.stats_power = 0;
        this.stats_heat_generation = 0;
        this.stats_vent = 0;
        this.stats_inlet = 0;
        this.stats_outlet = 0;
    }

    _resetTileStats(tile) {
        tile.power = 0;
        tile.heat = 0;
        tile.display_power = 0;
        tile.display_heat = 0;
        tile.containments = [];
        tile.cells = [];
        tile.reflectors = [];
    }

    _gatherNeighbors(tileset,tile) {
        const p = tile.part;
        const neighbors = Array.from(tileset.getTilesInRange(tile, p.range || 1));
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

    _applyReflectorEffects(tile) {
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

    manualReduceHeat() {
        if (this.current_heat > 0) {
            this.current_heat -= this.manual_heat_reduce;
            if (this.current_heat < 0) this.current_heat = 0;
            if (this.current_heat === 0) this.sold_heat = true;
            this.game.ui.say('var', 'current_heat', this.current_heat);
        }
    }

    sellPower() {
        if (this.current_power > 0) {
            this.game.current_money += this.current_power;
            this.current_power = 0;
            this.game.ui.say('var', 'current_money', this.game.current_money);
            this.game.ui.say('var', 'current_power', this.current_power);
            this.sold_power = true;
        }
    }

    checkMeltdown(tileset) {
        if (this.current_heat > this.max_heat * 2) {
            this.has_melted_down = true;
            tileset.active_tiles_list.forEach(tile => {
                if (tile.part) {
                    if(tile.$el) tile.$el.classList.add('exploding');
                    this.game.remove_part_from_tile(tile, true, false);
                }
            });
            this.current_heat = this.max_heat * 2 + 1;
    
            this.game.ui.eventHandlers.setVar('melting_down', true,true);
            return true;
        }
        return false;
    }
}

Reactor.prototype.addProperty = addProperty; 