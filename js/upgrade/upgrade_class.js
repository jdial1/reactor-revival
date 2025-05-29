import { addProperty, numFormat as fmt } from '../util.js';
import upgrade_list_data from './upgrade_list_data.js';

let _upgrade_locations_dom = null;

class Upgrade {
    constructor(upgrade_definition, gameInstance) {
        this.game = gameInstance;
        this.upgrade = upgrade_definition;
        this.max_level = upgrade_definition.levels || this.game.upgrade_max_level;
        this.level = 0;
        this.cost = upgrade_definition.cost || 0;
        this.erequires = upgrade_definition.erequires || null;
        this.ecost = upgrade_definition.ecost || 0;
        this.$el = null;
        this.$levels = null;
        this.display_cost = '';
        this.addProperty('affordable', false);
        this.updateDisplayCost();
    }

    setLevel(new_level) {
        if (new_level < 0 || new_level > this.max_level) return;
        this.level = new_level;
        this.updateDisplayCost();

        if (this.$levels) {
            this.$levels.textContent = this.level >= this.max_level && this.max_level > 1 ? 'MAX' : this.level;
        }

        if (this.upgrade.onclick) {
            this.upgrade.onclick(this, this.game);
        }

        this.game.update_cell_power();
        this.game.update_reactor_stats();
        if (this.game.ui && typeof this.game.ui.check_upgrades_affordability === 'function') {
            this.game.ui.check_upgrades_affordability();
        }
        if (this.game.ui && typeof this.game.ui.check_affordability_parts === 'function') {
            this.game.ui.check_affordability_parts();
        }
    }

    updateDisplayCost() {
        if (this.level >= this.max_level) {
            this.display_cost = '--';
            this.current_cost = Infinity;
            this.current_ecost = Infinity;
        } else {
            if (this.upgrade.ecost) {
                this.current_ecost = this.upgrade.ecost * Math.pow(this.upgrade.multiplier || 1, this.level);
                if (this.upgrade.id === 'laboratory' && this.level > 0) this.current_ecost = Infinity;
                else if (this.upgrade.type === 'experimental_parts' && this.game) {
                    let eparts_count = 0;
                    this.game.upgrade_objects_array.forEach(upg => {
                        if (upg.upgrade.type === 'experimental_parts' && upg.level > 0 && upg.upgrade.id !== this.upgrade.id) {
                            eparts_count++;
                        }
                    });
                    this.current_ecost = this.upgrade.ecost * (eparts_count + 1);
                }
                this.display_cost = fmt(this.current_ecost);
            } else {
                this.current_cost = this.upgrade.cost * Math.pow(this.upgrade.multiplier || 1, this.level);
                this.display_cost = fmt(this.current_cost);
            }
        }
    }
}
Upgrade.prototype.addProperty = addProperty;

export function initializeUpgrades(gameInstance, upgrade_locations_dom_map) {
    _upgrade_locations_dom = upgrade_locations_dom_map;

    upgrade_list_data.forEach(upgrade_def => {
        const upgrade_obj = new Upgrade(upgrade_def, gameInstance);
        upgrade_obj.$el = document.createElement('button');
        upgrade_obj.$el.classList.add('upgrade');
        if (upgrade_def.classList) upgrade_obj.$el.classList.add(...upgrade_def.classList);
        upgrade_obj.$el.id = upgrade_def.id;
        upgrade_obj.$el.upgrade_object = upgrade_obj;

        const $image = document.createElement('div');
        $image.className = 'image';
        const uniqueImages = {
            'chronometer': 'upgrade_flux.gif',
            'expand_reactor_rows': 'upgrade_rows.gif',
            'expand_reactor_cols': 'upgrade_cols.gif',
            'heat_control_operator': 'upgrade_computer.gif',
            'heat_outlet_control_operator': 'upgrade_computer.gif',
        };
        let imgSrc = 'img/upgrades/default.gif';
        if (uniqueImages[upgrade_def.id]) {
            imgSrc = 'img/upgrades/' + uniqueImages[upgrade_def.id];
        } else if (upgrade_def.part && gameInstance.part_objects[upgrade_def.part]) {
            const partForImage = gameInstance.part_objects[upgrade_def.part];
            if (partForImage && partForImage.$el) {
                const imgTag = partForImage.$el.querySelector('img');
                if(imgTag) imgSrc = imgTag.src;
            }
        }
        const img = document.createElement('img');
        img.alt = upgrade_def.title;
        img.src = imgSrc;
        img.onerror = function() { this.src = 'img/upgrades/default.gif'; };
        $image.appendChild(img);

        upgrade_obj.$levels = document.createElement('span');
        upgrade_obj.$levels.className = 'levels';
        $image.appendChild(upgrade_obj.$levels);
        upgrade_obj.$el.appendChild($image);

        const target_container = _upgrade_locations_dom[upgrade_def.type];
        if (target_container) {
            target_container.appendChild(upgrade_obj.$el);
        } else {
            console.warn(`Upgrade container type '${upgrade_def.type}' not found for upgrade '${upgrade_def.title}'`);
            if (_upgrade_locations_dom['other']) {
                _upgrade_locations_dom['other'].appendChild(upgrade_obj.$el);
            }
        }
        gameInstance.upgrade_objects_array.push(upgrade_obj);
        gameInstance.upgrade_objects[upgrade_obj.upgrade.id] = upgrade_obj;
        upgrade_obj.setLevel(0);
    });
}

export function purchaseUpgrade(upgrade_obj, gameInstance) {
    if (upgrade_obj.level >= upgrade_obj.max_level) return false;
    let can_afford = false;
    if (upgrade_obj.upgrade.ecost) {
        if ((!upgrade_obj.erequires || (gameInstance.upgrade_objects[upgrade_obj.erequires] && gameInstance.upgrade_objects[upgrade_obj.erequires].level > 0)) &&
            gameInstance.current_exotic_particles >= upgrade_obj.current_ecost) {
            gameInstance.current_exotic_particles -= upgrade_obj.current_ecost;
            gameInstance.ui.say('var', 'current_exotic_particles', gameInstance.current_exotic_particles);
            can_afford = true;
        }
    } else {
        if (gameInstance.current_money >= upgrade_obj.current_cost) {
            gameInstance.current_money -= upgrade_obj.current_cost;
            gameInstance.ui.say('var', 'current_money', gameInstance.current_money);
            can_afford = true;
        }
    }
    if (can_afford) {
        upgrade_obj.setLevel(upgrade_obj.level + 1);
        return true;
    }
    return false;
}
