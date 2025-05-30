import { numFormat as fmt } from './util.js';


export class EventHandlers {
    constructor(ui) {
        this.ui = ui;
        this.globalState = {};
        this.clicked_part = null;
    }

    getHandlers() {
        return {
            game_reset: () => this.ui.updateAllToggleBtnStates(),
            paused: () => this.ui.updateToggleButtonState('pause', true),
            unpaused: () => this.ui.updateToggleButtonState('pause', false),
            auto_sell_disabled: () => this.ui.updateToggleButtonState('auto_sell', false),
            auto_sell_enabled: () => this.ui.updateToggleButtonState('auto_sell', true),
            auto_buy_disabled: () => this.ui.updateToggleButtonState('auto_buy', false),
            auto_buy_enabled: () => this.ui.updateToggleButtonState('auto_buy', true),
            heat_control_disabled: () => this.ui.updateToggleButtonState('heat_control', false),
            heat_control_enabled: () => this.ui.updateToggleButtonState('heat_control', true),
            time_flux_disabled: () => this.ui.updateToggleButtonState('time_flux', false),
            time_flux_enabled: () => this.ui.updateToggleButtonState('time_flux', true),
            objective_loaded: (objData) => this.handleObjectiveLoaded(objData),
            upgrade_added: (upgrade_obj) => this.handleUpgradeAdded(upgrade_obj),
            objective_unloaded: () => this.handleObjectiveUnloaded(),
            objective_completed: () => this.handleObjectiveCompleted(),
            part_added: (game,part_obj) => this.handlePartAdded(game,part_obj),
            row_added: (game,row_index) => this.handleRowAdded(game,row_index),
            tile_added: (game,tile_data) => this.handleTileAdded(game,tile_data)
        };
    }

    handleObjectiveLoaded(game,objData) {
        if (this.ui.DOMElements.objectiveTitle) {
            this.ui.DOMElements.objectiveTitle.textContent = objData.title;
        }
        if (this.ui.DOMElements.objectiveReward) {
            this.ui.DOMElements.objectiveReward.textContent = objData.reward ? 
                fmt(objData.reward) : 
                (objData.ep_reward ? `${fmt(objData.ep_reward)} EP` : '');
        }
        if (this.ui.DOMElements.objectivesSection) {
            this.ui.DOMElements.objectivesSection.classList.remove('unloading', 'loading');
        }
    }

    handleUpgradeAdded(game,upgrade_obj) {
        // console.log('upgrade_added', upgrade_obj);
    }

    handleObjectiveUnloaded(game) {
        if (this.ui.DOMElements.objectivesSection) {
            this.ui.DOMElements.objectivesSection.classList.add('unloading');
            setTimeout(() => {
                if (this.ui.DOMElements.objectivesSection) {
                    this.ui.DOMElements.objectivesSection.classList.add('loading');
                }
            }, 300);
        }
    }

    handleObjectiveCompleted(game) {
        if (this.ui.DOMElements.objectivesSection) {
            this.ui.DOMElements.objectivesSection.classList.add('flash');
            setTimeout(() => {
                this.ui.DOMElements.objectivesSection.classList.remove('flash');
            }, 800);
        }
    }

    handlePartAdded(game,part_obj) {
        if (part_obj.erequires) {
            const required_upgrade = this.game?.upgrade_objects?.[part_obj.erequires];
            if (!required_upgrade || required_upgrade.level < 1) {
                return;
            }
        }

        const part_el = document.createElement('button');
        part_el.className = `part part_${part_obj.id} category_${part_obj.category}`;
        part_el.id = `part_btn_${part_obj.id}`;
        part_el._part = part_obj;
        part_obj.$el = part_el;

        const image_el = document.createElement('div');
        image_el.className = 'image';
        part_el.appendChild(image_el);

        let containerKey = part_obj.category + 's';
        const categoryToContainerMap = {
            'coolant_cell': 'coolantCells',
            'reactor_plating': 'reactorPlatings',
            'heat_exchanger': 'heatExchangers',
            'heat_inlet': 'heatInlets',
            'heat_outlet': 'heatOutlets',
            'particle_accelerator': 'particleAccelerators'
        };

        if (categoryToContainerMap[part_obj.category]) {
            containerKey = categoryToContainerMap[part_obj.category];
        }

        const container = this.ui.DOMElements[containerKey];
        if (container) {
            container.appendChild(part_el);
        } else {
            console.warn(`UI: Container for part category '${part_obj.category}' (expected key: '${containerKey}') not found in DOMElements. Part will not be shown in UI.`);
        }
    }

    handleRowAdded(game,row_index) {
        console.log(`[UI] row_added: Row ${row_index} added.`);
    }

    handleTileAdded(game,tile_data) {
        // console.log(`[UI] tile_added: Adding tile at row ${tile_data.row}, col ${tile_data.col}`, tile_data);
        const tile = tile_data;
        const tile_el = document.createElement('button');
        tile_el.className = 'tile';
        tile_el.dataset.row = tile_data.row;
        tile_el.dataset.col = tile_data.col;
        tile.tile_index = tile_data.row * game.max_cols + tile_data.col;
        tile_el.tile = tile;
        tile.$el = tile_el;

        if (tile.enabled) {
            tile.$el.classList.add('enabled');
        }

        const percent_wrapper_wrapper = document.createElement('div');
        percent_wrapper_wrapper.className = 'percent_wrapper_wrapper';
        const percent_wrapper = document.createElement('div');
        percent_wrapper.className = 'percent_wrapper';
        const percent = document.createElement('div');
        percent.className = 'percent';
        tile.$percent = percent;
        percent_wrapper.appendChild(percent);
        percent_wrapper_wrapper.appendChild(percent_wrapper);
        tile_el.appendChild(percent_wrapper_wrapper);

        if (this.ui.DOMElements.reactor) {
            this.ui.DOMElements.reactor.appendChild(tile_el);
        } else {
            console.warn('[UI] tile_added: Reactor DOM element not found!');
        }
    }

   updateToggleButtonState(toggleName, isEnabled) {
            const config = this.toggle_buttons_config[toggleName];
            if (config && this.DOMElements[config.id]) {
                const button = this.DOMElements[config.id];
                button.classList.toggle('enabled', isEnabled);
                button.classList.toggle('disabled', !isEnabled);
            }
        }

        updateAllToggleBtnStates() {
            if (!this.game) return;
            for (const key in this.toggle_buttons_config) {
                const config = this.toggle_buttons_config[key];
                if (config.gameProperty && typeof this.game[config.gameProperty] !== 'undefined') {
                    const gamePropertyValue = this.game[config.gameProperty];
                    const isFeatureActive = config.isPropertyNegated ? !gamePropertyValue : gamePropertyValue;
                    this.updateToggleButtonState(key, isFeatureActive);
                }
            }
        }
        
        _updateAllToggleBtnStates() { // Alias for external calls if needed
            this.updateAllToggleBtnStates();
        }

    check_affordability(game) {
        game.upgradeset.check_affordability(game);
        game.partset.check_affordability(game);
    }

    game_reset() {
        this.setVar('current_money', this.getVar('base_money'),true);
        this.setVar('current_power', 0,true);
        this.setVar('current_heat', 0,true);
        this.setVar('max_power', this.getVar('base_max_power'),true);
        this.setVar('max_heat', this.getVar('base_max_heat'),true);
    }

    setVar(varName, value,isDOMelement = false) {
        if(isDOMelement &&  this.ui.DOMElements[varName]) this.ui.DOMElements[varName].textContent = value;
        this.globalState[varName] = value;
    }

    getVar(varName) {
        return this.globalState[varName];
    }

    setClickedPart(part) {
        this.clicked_part = part;
    }

    getClickedPart() {
        return this.clicked_part;
    }
} 