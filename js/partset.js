import { Part } from './part.js';
import part_list_data from '../data/part_list_data.js';

export class PartSet {
    constructor() {
        console.log('PartSet constructor');
        this.parts = new Map(); 
        this.partsArray = []; 
    }

    initialize() {
        part_list_data.forEach(part_def_template => {
            if (part_def_template.levels) {
                for (let i = 0; i < part_def_template.levels; i++) {
                    const level = i + 1;
                    const final_part_def = this.generatePartDefinition(part_def_template, level);
                    const part_obj = new Part(final_part_def, this.game);
                    this.parts.set(part_obj.id, part_obj);
                    this.partsArray.push(part_obj);
                }
            } else {
                const final_part_def = { ...part_def_template };
                if (!final_part_def.level) final_part_def.level = 1;
                if (final_part_def.experimental && final_part_def.level === 6) {
                    final_part_def.title = `Extreme ${part_def_template.title}`;
                }
                const part_obj = new Part(final_part_def, this.game);
                this.parts.set(part_obj.id, part_obj);
                this.partsArray.push(part_obj);
            }
        });
        return this.partsArray;
    }

    generatePartDefinition(template, level) {
        const part_def = { ...template, level };
        part_def.base_cost = template.base_cost * Math.pow(template.cost_multi || 1, level - 1);

        if (part_def.category === 'cell') {
            part_def.category = 'cell';
            part_def.id = `${template.type}${level}`;
            part_def.title = `${this.getCellTitlePrefix(level)}${template.title}`;
            part_def.base_description = level > 1 ? this.MULTI_CELL_DESC_TPL : this.SINGLE_CELL_DESC_TPL;
            part_def.base_power = template.base_power * (this.CELL_POWER_MULTIPLIERS[level - 1] || 1);
            part_def.base_heat = template.base_heat * (this.CELL_HEAT_MULTIPLIERS[level - 1] || 1);
            part_def.cell_count = this.CELL_COUNTS[level - 1] || 1;
        } else {
            part_def.id = `${template.category}${level}`;
            part_def.title = template.experimental 
                ? `Extreme ${template.title}`
                : `${this.getPartTitlePrefix(level)}${template.title}`;
            if (template.base_ticks && template.ticks_multiplier) part_def.base_ticks = template.base_ticks * Math.pow(template.ticks_multiplier, level - 1);
            if (template.base_containment && template.containment_multi) part_def.base_containment = template.base_containment * Math.pow(template.containment_multi, level - 1);
            if (template.base_reactor_power && template.reactor_power_multi) part_def.base_reactor_power = template.base_reactor_power * Math.pow(template.reactor_power_multi, level - 1);
            if (template.base_reactor_heat && template.reactor_heat_multiplier) part_def.base_reactor_heat = template.base_reactor_heat * Math.pow(template.reactor_heat_multiplier, level - 1);
            if (template.base_transfer && template.transfer_multiplier) part_def.base_transfer = template.base_transfer * Math.pow(template.transfer_multiplier, level - 1);
            if (template.base_vent && template.vent_multiplier) part_def.base_vent = template.base_vent * Math.pow(template.vent_multiplier, level - 1);
            if (template.base_ep_heat && template.ep_heat_multiplier) part_def.base_ep_heat = template.base_ep_heat * Math.pow(template.ep_heat_multiplier, level - 1);
            if (template.base_power_increase && template.power_increase_add) part_def.base_power_increase = template.base_power_increase + (template.power_increase_add * (level - 1));
            if (template.base_heat_increase && template.heat_increase_add) part_def.base_heat_increase = template.base_heat_increase + (template.heat_increase_add * (level-1));
        }
 
        return part_def;
    }

    getCellTitlePrefix(level) {
        return ['', 'Dual ', 'Quad '][level - 1] || '';
    }

    getPartTitlePrefix(level) {
        return ['Basic ', 'Advanced ', 'Super ', 'Wonderous ', 'Ultimate ', 'Extreme '][level - 1] || 'Basic ';
    }

    updateCellPower(game) {
        const infused_level = game.upgrade_objects['infused_cells'] ? game.upgrade_objects['infused_cells'].level : 0;
        const unleashed_level = game.upgrade_objects['unleashed_cells'] ? game.upgrade_objects['unleashed_cells'].level : 0;
        const unstable_protium_level = game.upgrade_objects['unstable_protium'] ? game.upgrade_objects['unstable_protium'].level : 0;

        this.partsArray.forEach(part_obj => {
            if (part_obj.category === 'cell') {
                let base_power = part_obj.part.base_power;
                let base_heat = part_obj.part.base_heat;
                let base_ticks = part_obj.part.base_ticks;

                base_power *= (1 + infused_level);
                base_power *= Math.pow(2, unleashed_level);
                base_heat *= Math.pow(2, unleashed_level);
                
                if (part_obj.part.type === 'protium') {
                    base_power *= (1 + (game.protium_particles * 0.1)); 
                    base_power *= Math.pow(2, unstable_protium_level);
                    base_heat *= Math.pow(2, unstable_protium_level);
                    base_ticks = Math.ceil(part_obj.part.base_ticks / Math.pow(2, unstable_protium_level));
                }
                
                const cell_power_multipliers = [1, 4, 12]; 
                const cell_heat_multipliers = [1, 8, 36];
                const level_idx = part_obj.part.level - 1;

                part_obj.power = base_power * (cell_power_multipliers[level_idx] || 1);
                part_obj.heat = base_heat * (cell_heat_multipliers[level_idx] || 1);
                part_obj.ticks = base_ticks; 

                part_obj.power *= game.power_multiplier;
                part_obj.heat *= game.heat_multiplier;

                part_obj.updateDescription();
            }
        });
        
    }

    check_affordability(game) {
        if(!game) return;
        this.partsArray.forEach(part => {
            let affordable = false;
            if (part.erequires) {
                const required_upgrade = game.upgrade_objects[part.erequires];
                if (required_upgrade && required_upgrade.level > 0 && this.game.current_exotic_particles >= part.cost) {
                    affordable = true;
                }
            } else {
                if (game.current_money && game.current_money >= part.cost) {
                    affordable = true;
                }
            }
            part.setAffordable(affordable);
            if (part.$el) {
                part.$el.classList.toggle('unaffordable', !affordable);
            }
        });
    }

    getPartById(id) {
        return this.parts.get(id);
    }

    getAllParts() {
        return this.partsArray;
    }

    getPartsByCategory(category) {
        return this.partsArray.filter(part => part.category === category);
    }
}

// Constants
PartSet.prototype.SINGLE_CELL_DESC_TPL = 'Produces %power power and %heat heat per tick. Lasts for %ticks ticks.';
PartSet.prototype.MULTI_CELL_DESC_TPL = 'Acts as %count %type cells. Produces %power power and %heat heat per tick.';
PartSet.prototype.CELL_POWER_MULTIPLIERS = [1, 2, 4];
PartSet.prototype.CELL_HEAT_MULTIPLIERS = [1, 2, 4];
PartSet.prototype.CELL_COUNTS = [1, 2, 4];
