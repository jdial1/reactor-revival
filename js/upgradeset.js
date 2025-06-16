import { Upgrade } from './upgrade.js';
import getUpgrades from '../data/upgrade_list.js';

export class UpgradeSet {
    constructor(game) {
        this.game = game;
        this.upgrades = {};
        this.upgradesArray = [];
    }

    initialize(upgrade_locations_dom_map) {
        this.upgrades = {};
        this.upgradesArray = [];

        this.initializeUpgrades(this.game, upgrade_locations_dom_map);
        return this.upgradesArray;
    }

    reset() {
        this.upgradesArray.forEach(upgrade => {
            upgrade.setLevel(this.game,0);
        });
    }

    getUpgrade(id) {
        return this.upgrades[id];
    }

    getAllUpgrades() {
        return this.upgradesArray;
    }

    getUpgradesByType(type) {
        return this.upgradesArray.filter(upgrade => upgrade.type === type);
    }

    purchaseUpgrade(upgradeId) {
        const upgrade = this.getUpgrade(upgradeId);
        if (!upgrade) return false;

        if (upgrade.level >= upgrade.max_level) return false;
        
        if (upgrade.ecost) {
            if (this.game.current_exotic_particles < upgrade.current_ecost) return false;
            this.game.current_exotic_particles -= upgrade.current_ecost;
            this.game.ui.say('var', 'current_exotic_particles', this.game.current_exotic_particles);
        } else {
            if (this.game.current_money < upgrade.current_cost) return false;
            this.game.current_money -= upgrade.current_cost;
            this.game.ui.say('var', 'current_money', this.game.current_money);
        }
        
        upgrade.setLevel(this.game,upgrade.level + 1);
        return true;
    }

    check_affordability(game) {
        if(!game) return;
        this.upgradesArray.forEach(upgrade => {
            if (upgrade.level >= upgrade.max_level) {
                upgrade.affordable = false;
                return;
            }

            if (upgrade.ecost) {
                upgrade.affordable = game.current_exotic_particles >= upgrade.current_ecost;
            } else {
                upgrade.affordable = game.current_money >= upgrade.current_cost;
            }
        });
    }

    initialize() {
        console.log('Initializing upgrades');
        var upgrade_list = getUpgrades(this.game);
        upgrade_list.forEach(upgrade_def => {
            const upgrade_obj = new Upgrade(upgrade_def, this.game);
            this.upgrades[upgrade_obj.id] = upgrade_obj;
            this.upgradesArray.push(upgrade_obj);
        });
        return this.upgradesArray;
    }
}
