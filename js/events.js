import { numFormat as fmt } from './util.js';
import { GlobalState } from './globalState.js';

export class EventHandlers {
    constructor(ui) {
        this.ui = ui;
        this.stateManager = GlobalState;
        this.clicked_part = null;
        this.game = null; 
    }

    setGame(gameInstance) {
        this.game = gameInstance;
    }

    update_vars(update_vars) {
        for (const [key, value] of update_vars) {
            const config = this.var_objs_config[key];
            if (!config) continue;

            let displayValue = value;
            if ((key === 'current_heat' || key === 'max_heat') && typeof value === 'number') {
                displayValue = Math.floor(value);
            }

            if (config.dom && config.dom instanceof HTMLElement) {
                let textContent = config.formatter ? config.formatter(displayValue) : (config.num ? fmt(displayValue, config.places || null) : displayValue);
                if(config.prefix) textContent = config.prefix + textContent;
                if(config.suffix) textContent = textContent + config.suffix;
                config.dom.textContent = textContent;
            }
            if (config.onupdate) config.onupdate();
        }
        update_vars.clear();
    }

    getHandlers() {
        return {
            game_reset: () => this.game_reset(),

            paused: () => this.pause_game(),
            unpaused: () => this.unpause_game(),

            auto_sell_disabled: () => this.setVar('auto_sell', false),
            auto_sell_enabled: () => this.setVar('auto_sell', true),

            auto_buy_disabled: () => this.setVar('auto_buy', false),
            auto_buy_enabled: () => this.setVar('auto_buy', true),

            heat_control_disabled: () => this.setVar('heat_control', false),
            heat_control_enabled: () => this.setVar('heat_control', true),

            time_flux_disabled: () => this.setVar('time_flux', false),
            time_flux_enabled: () => this.setVar('time_flux', true),

            objective_loaded: (objData) => this.handleObjectiveLoaded(objData),
            objective_unloaded: () => this.handleObjectiveUnloaded(),
            objective_completed: () => this.handleObjectiveCompleted(),

            upgrade_added: (upgrade_obj) => this.handleUpgradeAdded(upgrade_obj),
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

    handleUpgradeAdded(game, upgrade_obj) {
        // Normalize location/type to DOM id
        const normalizeKey = (key) => {
            const map = {
                cell_power: 'cell_power_upgrades',
                cell_tick: 'cell_tick_upgrades',
                cell_perpetual: 'cell_perpetual_upgrades',
                exchangers: 'exchanger_upgrades',
                exchanger: 'exchanger_upgrades',
                vent: 'vent_upgrades',
                vents: 'vent_upgrades',
                other: 'other_upgrades',
            };
            return map[key] || key;
        };

        let locationKey = upgrade_obj.upgrade.location || upgrade_obj.upgrade.type;
        locationKey = normalizeKey(locationKey);

        let container = null;
        if (window.upgrade_locations_dom_map && window.upgrade_locations_dom_map[locationKey]) {
            container = window.upgrade_locations_dom_map[locationKey];
        } else if (this.ui.DOMElements[locationKey]) {
            container = this.ui.DOMElements[locationKey];
        } else {
            container = document.getElementById(locationKey);
        }
        if (!container) {
            console.warn(`No container found for upgrade location: ${locationKey}`);
            return;
        }
        // Build the correct class list and id
        const upgrade = upgrade_obj.upgrade;
        const resource = upgrade.resource || '';
        const type = upgrade.type || '';
        const id = upgrade.id || '';
        const level = (typeof upgrade_obj.level === 'number' ? upgrade_obj.level : 0);
        // Affordability logic
        const affordable = typeof upgrade_obj.isAffordable === 'function' ? upgrade_obj.isAffordable(game) : false;
        let classList = ['upgrade'];
        let buttonId = '';
        if (type && type.startsWith('cell_') && resource) {
            classList.push(resource);
            classList.push(type);
            buttonId = `${type}_${resource}`;
        } else if (type === 'other') {
            buttonId = id;
        } else if (type === 'vent' || type === 'exchanger') {
            buttonId = id;
        } else {
            if (resource) classList.push(resource);
            if (type) classList.push(type);
            buttonId = id;
        }
        classList.push(affordable ? 'affordable' : 'unaffordable');
        const upgradeEl = document.createElement('button');
        upgradeEl.className = classList.join(' ');
        upgradeEl.id = buttonId;
        // Build the inner HTML
        const imageDiv = document.createElement('div');
        imageDiv.className = 'image';
        if (upgrade.iconClass) {
            imageDiv.classList.add(upgrade.iconClass);
        }
        imageDiv.innerHTML += `Click to Upgrade<span class=\"levels\">${level}</span>`;
        upgradeEl.appendChild(imageDiv);
        upgradeEl.upgrade_object = upgrade_obj;
        // Tooltip support
        upgradeEl.addEventListener('mouseover', () => {
            if (game.ui && typeof game.ui.show_tooltip_for_object === 'function') {
                game.ui.show_tooltip_for_object(upgrade_obj, null);
            }
        });
        upgradeEl.addEventListener('mouseout', () => {
            if (game.ui && game.ui.tooltip_manager) {
                game.ui.tooltip_manager.hide();
            }
        });
        // Click support
        upgradeEl.addEventListener('click', () => {
            if (typeof upgrade_obj.purchase === 'function') {
                upgrade_obj.purchase(game);
            }
        });
        container.appendChild(upgradeEl);
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

    pause_game() {
        clearTimeout(loop_timeout);
        last_tick_time = 0;
        dtime = 0;
        this.stateManager.pause = true;
    }

    unpause_game() {
        this.stateManager.pause = false;
        last_tick_time = performance.now();
        dtime = 0;
        gameLoop();
        this.stateManager.pause = false;
    };

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

    setVar(varName, value, isDOMelement = false) {

        if (isDOMelement && this.ui.DOMElements[varName]) {
            this.ui.DOMElements[varName].textContent = value;
        }
        
        if (this.stateManager.hasOwnProperty(varName)) { 
            if (this.stateManager[varName] !== value) {
                console.log('[EventHandlers] setVar:', varName, value);
                this.stateManager[varName] = value;

                if (this.ui && this.ui.update_vars && this.ui.current_vars) {
                    this.ui.update_vars.set(varName, value);
                    this.ui.current_vars.set(varName, value); 
                }
            }
        } else {
            this.stateManager[varName] = value;
            if (this.ui && this.ui.update_vars && this.ui.current_vars) {
                this.ui.update_vars.set(varName, value);
                this.ui.current_vars.set(varName, value);
            }
        }
        if (this.ui && this.ui.var_objs_config && this.ui.var_objs_config[varName] && typeof this.ui.var_objs_config[varName].onupdate === 'function') {
            this.ui.var_objs_config[varName].onupdate();
        }
    }

    getVar(varName) {
        return this.stateManager[varName];
    }

    setClickedPart(part) {
        this.clicked_part = part;
    }

    getClickedPart() {
        return this.clicked_part;
    }
} 