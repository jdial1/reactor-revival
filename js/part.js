import { addProperty, numFormat as fmt } from './util.js';
import part_list_data from '../data/part_list.js'; 

const SINGLE_CELL_DESC_TPL = 'Produces %power power and %heat heat per tick. Lasts for %ticks ticks.';
const MULTI_CELL_DESC_TPL = 'Acts as %count %type cells. Produces %power power and %heat heat per tick.';
const PART_TITLE_PREFIXES = ['Basic ', 'Advanced ', 'Super ', 'Wonderous ', 'Ultimate ', 'Extreme '];
const CELL_TITLE_PREFIXES = ['', 'Dual ', 'Quad '];
const CELL_POWER_MULTIPLIERS = [1, 2, 4];
const CELL_HEAT_MULTIPLIERS = [1, 2, 4];
const CELL_COUNTS = [1, 2, 4];

export class Part {
    constructor(part_definition) {
        this.part = part_definition; // Store the original definition

        // Assign properties from definition, with defaults
        this.id = part_definition.id;
        this.category = part_definition.category;
        this.type = part_definition.type;
        this.base_power = part_definition.base_power || 0;
        this.base_heat = part_definition.base_heat || 0;
        this.base_ticks = part_definition.base_ticks || 0;
        this.base_containment = part_definition.base_containment || 0;
        this.base_vent = part_definition.base_vent || 0;
        this.base_reactor_power = part_definition.base_reactor_power || 0;
        this.base_reactor_heat = part_definition.base_reactor_heat || 0;
        this.base_transfer = part_definition.base_transfer || 0;
        this.base_range = part_definition.base_range || 1;
        this.base_ep_heat = part_definition.base_ep_heat || 0;
        this.base_power_increase = part_definition.base_power_increase || 0;
        this.base_heat_increase = part_definition.base_heat_increase || 0;

        // Live properties that can be modified by upgrades etc.
        this.power = this.base_power;
        this.heat = this.base_heat;
        this.ticks = this.base_ticks;
        this.containment = this.base_containment;
        this.vent = this.base_vent;
        this.reactor_power = this.base_reactor_power;
        this.reactor_heat = this.base_reactor_heat;
        this.transfer = this.base_transfer;
        this.range = this.base_range;
        this.ep_heat = this.base_ep_heat;
        this.power_increase = this.base_power_increase;
        this.heat_increase = this.base_heat_increase;
        
        this.erequires = part_definition.erequires || null;
        this.cost = part_definition.base_cost; // Initial cost, can be current_cost if dynamic
        this.perpetual = false; // Can be set by upgrades
        this.description = '';

        // Cell specific (might be better in a Cell subclass if complexity grows)
        this.cell_count = part_definition.cell_count || 0;

        this.$el = null; // DOM element
        this.className = ''; // CSS class name for this part type
        this.addProperty('affordable', false); // For UI reactivity
        this.updateDescription();
    }

    updateDescription(tile_context = null) {
        let baseDescTpl = this.part.base_description;
        // Replace general templates first
        baseDescTpl = baseDescTpl
            .replace(/%single_cell_description/g, SINGLE_CELL_DESC_TPL)
            .replace(/%multi_cell_description/g, MULTI_CELL_DESC_TPL);

        // Determine effective transfer and vent values
        const effectiveTransfer = tile_context ? tile_context.getEffectiveTransferValue() : this.transfer;
        const effectiveVent = tile_context ? tile_context.getEffectiveVentValue() : this.vent;
        const cellLevelIndex = (this.part.level || 1) - 1;
        const cellCountForDesc = [1, 2, 4][cellLevelIndex] || this.cell_count || 1;

        let typeName = this.part.title;
        if (this.part.level > 1 && this.part.type) {
            var baseTypePart = part_list_data.filter(part => part.type === this.part.type && part.level === 1)[0];
            if (baseTypePart) {
                typeName = baseTypePart.title.replace(/Dual |Quad /i,'');
            } else {
                typeName = this.part.title.replace(/Dual |Quad /i,'');
            }
        }
        
        this.description = baseDescTpl
            .replace(/%power_increase/g, fmt(this.power_increase))
            .replace(/%heat_increase/g, fmt(this.heat_increase))
            .replace(/%reactor_power/g, fmt(this.reactor_power))
            .replace(/%reactor_heat/g, fmt(this.reactor_heat))
            .replace(/%ticks/g, fmt(this.ticks))
            .replace(/%containment/g, fmt(this.containment))
            .replace(/%ep_heat/g, fmt(this.ep_heat))
            .replace(/%range/g, fmt(this.range))
            .replace(/%count/g, cellCountForDesc)
            .replace(/%power/g, fmt(this.power))
            .replace(/%heat/g, fmt(this.heat))
            .replace(/%transfer/g, fmt(effectiveTransfer))
            .replace(/%vent/g, fmt(effectiveVent))
            .replace(/%type/g, typeName);
    }
}
Part.prototype.addProperty = addProperty;
