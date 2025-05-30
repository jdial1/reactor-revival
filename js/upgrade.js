import { addProperty, numFormat as fmt } from './util.js';
import getUpgrades from '../data/upgrade_list_data.js';

let _upgrade_locations_dom = null;

export class Upgrade {
    constructor(upgrade_definition) {
        this.upgrade = upgrade_definition;
        this.id = upgrade_definition.id;
        this.title = upgrade_definition.title;
        this.description = upgrade_definition.description;
        this.base_cost = upgrade_definition.base_cost;
        this.cost_multi = upgrade_definition.cost_multi || 1;
        this.max_level = upgrade_definition.max_level || 1;
        this.type = upgrade_definition.type;
        this.erequires = upgrade_definition.erequires;
        this.ecost = upgrade_definition.ecost;
        this.level = 0;
        this.current_cost = this.base_cost;
        this.current_ecost = this.ecost;
        this.$el = null;
        this.$levels = null;
        this.display_cost = '';
        this.addProperty('affordable', false);
        this.updateDisplayCost();
    }

    setLevel(game,reactor,level) {

        this.level = Math.min(level, this.max_level);

        this.updateDisplayCost();

        if (this.upgrade.onclick && level > 0) this.upgrade.onclick(this,game);

        if (game && this.type === 'cell_power') game.update_cell_power();

        if (this.$levels) {
            this.$levels.textContent = this.level >= this.max_level && this.max_level > 1 ? 'MAX' : this.level;
        }
        
        if(reactor) reactor.updateStats(game.tileset,game.ui.eventHandlers);

        if(game) game.ui.eventHandlers.check_affordability(game);
    }

    updateDisplayCost() {
        if (this.ecost) {
            this.current_ecost = this.ecost * Math.pow(this.cost_multi, this.level);
        } else {
            this.current_cost = this.base_cost * Math.pow(this.cost_multi, this.level);
        }
        if (this.level >= this.max_level) {
            this.display_cost = '--';
            this.current_cost = Infinity;
            this.current_ecost = Infinity;
        } else {
            this.display_cost = this.ecost 
                ? fmt(this.current_ecost)
                : fmt(this.current_cost);
        }
    }

    getPartObjects() {
        return this.upgrade.getPartObjects 
        ? this.upgrade.getPartObjects() 
        : [];
    }
}

Upgrade.prototype.addProperty = addProperty;


