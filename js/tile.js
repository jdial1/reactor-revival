import { addProperty } from './util.js';

export class Tile {
    constructor(row, col) {
        this.part = null;
        
        // Properties related to a part's effect on/by this tile instance
        this.heatOutput = 0;
        this.powerOutput = 0;

        // Display values for UI
        this.display_power = 0; 
        this.display_heat = 0;

        // Dynamic lists of neighboring tiles
        this.containmentNeighborTiles = [];
        this.cellNeighborTiles = [];
        this.reflectorNeighborTiles = [];

        this.activated = false;
        this.row = row;
        this.col = col;
        this.enabled = false;
        this.updated = false;

        // Particle accelerator specific
        this.display_chance = 0;
        this.display_chance_percent_of_total = 0;

        this.$el = null;
        this.$percent = null;

        this.addProperty('heat_contained', 0);
        this.addProperty('ticks', 0);
    }

    getEffectiveVentValue() {
        if (this.part && this.part.vent) {
            const ventMultiplier = (this.game && this.game.vent_multiplier_eff !== undefined) ? this.game.vent_multiplier_eff : 0;
            return this.part.vent * (1 + (ventMultiplier / 100));
        }
        return 0;
    }

    getEffectiveTransferValue() {
        if (this.part && this.part.transfer) {
            const transferMultiplier = (this.game && this.game.transfer_multiplier_eff !== undefined) ? this.game.transfer_multiplier_eff : 0;
            return this.part.transfer * (1 + (transferMultiplier / 100));
        }
        return 0;
    }

    disable() {
        if (this.enabled) {
            this.enabled = false;
            if (this.$el) this.$el.classList.remove('enabled');
        }
    }

    enable() {
        if (!this.enabled) {
            this.enabled = true;
            if (this.$el) this.$el.classList.add('enabled');
        }
    }

    setPart(partInstance) {
        this.clearPart(false);
        this.part = partInstance;
        if (this.part) {
            this.activated = true;
            this.setTicks(this.part.ticks);
            this.setHeat_contained(0);
            if (this.$el) {
                this.$el.classList.add('part_' + this.part.id, 'category_' + this.part.category);
                this.$el.classList.remove('disabled', 'spent');
                if (this.part.ticks > 0 && this.$percent) {
                    this.$percent.style.width = '100%';
                    this.$percent.style.backgroundColor = '#0f0';
                } else if (this.part.containment > 0 && this.$percent) {
                    this.$percent.style.width = '0%';
                    this.$percent.style.backgroundColor = '#f00';
                }
            }
        }
        this.updated = true;
    }

    clearPart(refund = true) {
        if (this.part && refund && this.activated) {
            let sell_value = this.part.cost;
            if (this.part.ticks > 0) {
                sell_value = Math.ceil(this.ticks / this.part.ticks * this.part.cost);
            } else if (this.part.containment > 0) {
                sell_value = this.part.cost - Math.ceil(this.heat_contained / this.part.containment * this.part.cost);
            }
            this.game.current_money += Math.max(0, sell_value);
            this.game.ui.say('var', 'current_money', this.game.current_money);
        }

        this.part = null;
        this.setTicks(0);
        this.setHeat_contained(0);
        this.activated = false;
        this.heatOutput = 0;
        this.powerOutput = 0;
        this.display_power = 0;
        this.display_heat = 0;
        this.containmentNeighborTiles = [];
        this.cellNeighborTiles = [];
        this.reflectorNeighborTiles = [];
        this.updated = true;

        if (this.$el) {
            const baseClasses = ['tile'];
            if (this.enabled) baseClasses.push('enabled');
            const classesToRemove = [];
            this.$el.classList.forEach(cls => {
                if (!baseClasses.includes(cls)) {
                    classesToRemove.push(cls);
                }
            });
            this.$el.classList.remove(...classesToRemove);
            if (this.$percent) this.$percent.style.width = '0%';
        }
    }
}

Tile.prototype.addProperty = addProperty;
