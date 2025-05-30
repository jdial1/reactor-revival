export class TooltipManager {
    constructor(main_element_selector, tooltip_element_selector) {
        this.$main = document.querySelector(main_element_selector);
        this.$tooltip = document.querySelector(tooltip_element_selector);

        if (!this.$main) console.error(`TooltipManager: Main element "${main_element_selector}" not found.`);
        if (!this.$tooltip) console.error(`TooltipManager: Tooltip element "${tooltip_element_selector}" not found.`);

        this.tooltip_task = null;
        this.tooltip_update_callback = null;
        this.tooltip_showing = false;
    }

    show(part_or_upgrade_obj, tile_context, update_callback) {
        clearTimeout(this.tooltip_task);

        if (!part_or_upgrade_obj) {
            this.tooltip_task = setTimeout(() => this._hide(), 200);
            return;
        }

        if (!this.tooltip_showing && this.$main) {
            this.$main.classList.add('tooltip_showing');
            this.tooltip_showing = true;
        }

        this.tooltip_update_callback = update_callback;
        if (this.tooltip_update_callback) {
            this.tooltip_update_callback();
        }
    }

    _hide() {
        this.tooltip_update_callback = null;
        if (this.$main) {
            this.$main.classList.remove('tooltip_showing');
        }
        this.tooltip_showing = false;
    }

    hide() {
        clearTimeout(this.tooltip_task);
        this.tooltip_task = setTimeout(() => this._hide(), 200); 
    }

    request_update() {
        if (this.tooltip_showing && this.tooltip_update_callback) {
            this.tooltip_update_callback();
        }
    }
}
