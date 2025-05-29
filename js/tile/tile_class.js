import { addProperty } from '../util.js';

export class Tile {
    constructor(row, col, gameInstance) {
        this.game = gameInstance;
        this.part = null; // Instance of Part class
        
        // Properties related to a part's effect on/by this tile instance
        this.heatOutput = 0; // Calculated heat from this tile's part
        this.powerOutput = 0; // Calculated power from this tile's part

        // Display values for UI, potentially modified from raw heat/power output
        this.display_power = 0; 
        this.display_heat = 0;

        // Dynamic lists of neighboring tiles relevant to this tile's part
        this.containmentNeighborTiles = [];
        this.cellNeighborTiles = [];
        this.reflectorNeighborTiles = [];

        this.activated = false; // Is the part on this tile purchased and active?
        this.row = row;
        this.col = col;
        this.enabled = false; // Is the tile part of the current reactor grid size?
        
        // For UI updates, related to addProperty system
        this.updated = false; // Flag for UI to know if tile needs re-render (not standardly used here yet)

        // Particle accelerator specific
        this.display_chance = 0;
        this.display_chance_percent_of_total = 0;

        this.$el = null; // Reference to the DOM element
        this.$percent = null; // Reference to the progress bar element within the tile

        this.addProperty('heat_contained', 0); // Heat currently stored in this tile's part
        this.addProperty('ticks', 0);          // Remaining ticks for a part on this tile
    }

    // Renamed for clarity and consistent casing
    getEffectiveVentValue() {
        if (this.part && this.part.vent) {
            // vent_multiplier_eff is expected to be on game instance
            const ventMultiplier = (this.game && this.game.vent_multiplier_eff !== undefined) ? this.game.vent_multiplier_eff : 0;
            return this.part.vent * (1 + (ventMultiplier / 100));
        }
        return 0;
    }

    getEffectiveTransferValue() {
        if (this.part && this.part.transfer) {
            // transfer_multiplier_eff is expected to be on game instance
            const transferMultiplier = (this.game && this.game.transfer_multiplier_eff !== undefined) ? this.game.transfer_multiplier_eff : 0;
            return this.part.transfer * (1 + (transferMultiplier / 100));
        }
        return 0;
    }

    disable() { // Tile is outside current reactor grid
        if (this.enabled) {
            this.enabled = false;
            if (this.$el) this.$el.classList.remove('enabled');
            // Optionally, could also clear the part if it's disabled
            // if (this.part) this.clearPart(false); // false for no refund
        }
    }

    enable() { // Tile is inside current reactor grid
        if (!this.enabled) {
            this.enabled = true;
            if (this.$el) this.$el.classList.add('enabled');
        }
    }

    setPart(partInstance) {
        this.clearPart(false); // Clear existing part without refund before setting new one
        this.part = partInstance;
        if (this.part) {
            this.activated = true; // Assume part is activated when set (cost handled elsewhere)
            this.setTicks(this.part.ticks);
            this.setHeat_contained(0);
            if (this.$el) {
                this.$el.classList.add('part_' + this.part.id, 'category_' + this.part.category);
                this.$el.classList.remove('disabled', 'spent'); // Ensure it's not marked disabled or spent
                 // Update progress bar if applicable
                if (this.part.ticks > 0 && this.$percent) {
                    this.$percent.style.width = '100%'; // Full for new part
                    this.$percent.style.backgroundColor = '#0f0'; // Green for cells/reflectors
                } else if (this.part.containment > 0 && this.$percent) {
                    this.$percent.style.width = '0%'; // Empty for containment parts
                    this.$percent.style.backgroundColor = '#f00'; // Red for heat-related
                }
            }
        }
        this.updated = true;
    }

    clearPart(refund = true) { // Add refund parameter
        // Backward compatibility: if called with no argument, refund is true
        if (this.part && refund && this.activated) { // Only refund if it was an active part
            let sell_value = this.part.cost;
            if (this.part.ticks > 0) { // Check if part.ticks itself is positive
                sell_value = Math.ceil(this.ticks / this.part.ticks * this.part.cost);
            } else if (this.part.containment > 0) { // Check if part.containment is positive
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
            // Reset classes, keeping 'tile' and 'enabled' if applicable
            const baseClasses = ['tile'];
            if (this.enabled) baseClasses.push('enabled');
            // Remove all other classes that might have been added by parts or states
            const classesToRemove = [];
            this.$el.classList.forEach(cls => {
                if (!baseClasses.includes(cls)) {
                    classesToRemove.push(cls);
                }
            });
            this.$el.classList.remove(...classesToRemove);
            if (this.$percent) this.$percent.style.width = '0%';
            // Ensure 'disabled' class is added if the tile is not activated (e.g. after placement but before buy)
            // However, clearPart usually means it's empty, so 'disabled' logic is more for initial placement queue.
        }
    }
}
Tile.prototype.addProperty = addProperty; // Attaches the addProperty function to Tile's prototype

export function create_reactor_tiles(gameInstance) {
    const tiles = [];
    const tiles_list = [];
    const reactorEl = gameInstance.ui.DOMElements.reactor; // Get reactor DOM element from UI

    if (!reactorEl) {
        console.error("Reactor DOM element not found in UI. Cannot create tiles.");
        return;
    }
    reactorEl.innerHTML = ''; // Clear previous tiles if any (idempotency)

    for (let r = 0; r < gameInstance.max_rows; r++) {
        const row_array = [];
        // UI event for row is optional, can be removed if not used for specific row DOM elements
        // gameInstance.ui.say('evt', 'row_added', r); 
        for (let c = 0; c < gameInstance.max_cols; c++) {
            const tile = new Tile(r, c, gameInstance);
            row_array.push(tile);
            tiles_list.push(tile);
            // The UI event 'tile_added' will create the DOM element for the tile
            gameInstance.ui.say('evt', 'tile_added', { tile_instance: tile, row: r, col: c }); 
            // Enable/disable based on current game grid size
            if (r < gameInstance.rows && c < gameInstance.cols) {
                tile.enable();
            } else {
                tile.disable();
            }
        }
        tiles.push(row_array);
    }

    gameInstance.tiles = tiles;
    gameInstance.tiles_list = tiles_list;
    gameInstance.update_active_tiles_display(); // Recalculate active_tiles arrays
}
