import { updateProperty, numFormat as fmt, timeFormat } from './util.js';
import { EventHandlers } from './events.js';


export class UI {
    constructor() {
        console.log('UI constructor');
        this.game = null;
        this.DOMElements = {};
        this.rowsUI = [];
        this.current_vars = new Map();
        this.update_vars = new Map();
        this.update_interface_interval = 100;
        this.update_interface_task = null;
        this.do_check_upgrades_affordability = false;
        this.eventHandlers = new EventHandlers(this);
        this.var_objs_config = {
        current_money: { domId: 'info_bar_money', num: true },
        current_power: { domId: 'info_bar_current_power', num: true, onupdate: () => this.updatePercentageBar('current_power', 'max_power', this.DOMElements.powerPercentage) },
        max_power: { domId: 'info_bar_max_power', num: true, onupdate: () => this.updatePercentageBar('current_power', 'max_power', this.DOMElements.powerPercentage) },
        current_heat: { domId: 'info_bar_current_heat', num: true, onupdate: () => {
        this.updatePercentageBar('current_heat', 'max_heat', this.DOMElements.heatPercentage);
        this.updateReactorHeatBackground();
        }},
        max_heat: { domId: 'info_bar_max_heat', num: true, onupdate: () => {
        this.updatePercentageBar('current_heat', 'max_heat', this.DOMElements.heatPercentage);
        if(this.DOMElements.infoBarAutoHeatReduce && this.current_vars.get('max_heat') > 0) this.DOMElements.infoBarAutoHeatReduce.textContent = `-${fmt(this.current_vars.get('max_heat') / 10000)}`;
        this.updateReactorHeatBackground();
        }},
        auto_heat_reduce: { domId: 'info_bar_auto_heat_reduce', onupdate: () => this.DOMElements.infoBarAutoHeatReduce && (this.DOMElements.infoBarAutoHeatReduce.textContent = `-${fmt(this.current_vars.get('auto_heat_reduce'))}`) },
        legacy_current_power: { domId: 'currentPower', num: true },
        legacy_max_power: { domId: 'maxPower', num: true },
        legacy_current_heat: { domId: 'currentHeat', num: true },
        legacy_max_heat: { domId: 'maxHeat', num: true },
        legacy_money: { domId: 'money', num: true },
        exotic_particles: { domId: 'exoticParticles', num: true, onupdate: () => this.DOMElements.rebootExoticParticles && (this.DOMElements.rebootExoticParticles.textContent = fmt(this.current_vars.get('exotic_particles'))) },
        current_exotic_particles: { domId: 'currentExoticParticles', num: true, onupdate: () => {
        if (this.DOMElements.refundExoticParticles) {
        const total_ep = this.current_vars.get('total_exotic_particles') || 0;
        const current_ep = this.current_vars.get('current_exotic_particles');
        this.DOMElements.refundExoticParticles.textContent = fmt(total_ep - current_ep);
        }
        }},
        stats_power: { domId: 'statsPower', num: true },
        total_heat: { domId: 'statsHeat', num: true },
        stats_cash: { domId: 'statsCash', num: true, places: 2 },
        stats_outlet: { domId: 'statsOutlet', num: true, places: 2 },
        stats_inlet: { domId: 'statsInlet', num: true, places: 2 },
        stats_vent: { domId: 'statsVent', num: true, places: 2 },
        money_add: { domId: 'moneyPerTick', num: true },
        power_add: { domId: 'powerPerTick', num: true },
        heat_add: { domId: 'heatPerTick', num: true },
        auto_sell_disabled_state_change: { onupdate: () => this.updateToggleButtonState('auto_sell', !this.current_vars.get('auto_sell_disabled_state_change')) },
        auto_buy_disabled_state_change: { onupdate: () => this.updateToggleButtonState('auto_buy', !this.current_vars.get('auto_buy_disabled_state_change')) },
        heat_control_enabled_state_change: { onupdate: () => this.updateToggleButtonState('heat_control', this.current_vars.get('heat_control_enabled_state_change')) },
        time_flux_enabled_state_change: { onupdate: () => this.updateToggleButtonState('time_flux', this.current_vars.get('time_flux_enabled_state_change')) },
        paused_state_change: { onupdate: () => this.updateToggleButtonState('pause', this.current_vars.get('paused_state_change')) },
        };
        this.toggle_buttons_config = {
            auto_sell: { id: 'auto_sell_toggle', gameProperty: 'auto_sell_disabled', isPropertyNegated: true, enableFunc: window.enable_auto_sell, disableFunc: window.disable_auto_sell },
            auto_buy: { id: 'auto_buy_toggle', gameProperty: 'auto_buy_disabled', isPropertyNegated: true, enableFunc: window.enable_auto_buy, disableFunc: window.disable_auto_buy },
            heat_control: { id: 'heat_control_toggle', gameProperty: 'heat_controlled', isPropertyNegated: false, enableFunc: window.enable_heat_control, disableFunc: window.disable_heat_control },
            time_flux: { id: 'time_flux_toggle', gameProperty: 'time_flux', isPropertyNegated: false, enableFunc: window.enable_time_flux, disableFunc: window.disable_time_flux },
            pause: { id: 'pause_toggle', gameProperty: 'paused', isPropertyNegated: false, enableFunc: window.unpause_game, disableFunc: window.pause_game }
        };
        this.evts = this.eventHandlers.getHandlers();
    }

    cacheDOMElements() {
        const ids = [
            // Main layout
            'main', 'reactor', 'reactor_background', 'reactor_section', 'parts_section', 'primary',
            // Info Bar (new structure)
            'info_bar', 'info_heat_block', 'info_power_block', 'info_money_block', 'time_flux',
            'info_bar_current_heat', 'info_bar_max_heat', 'info_bar_auto_heat_reduce', 'info_heat_progress',
            'info_bar_current_power', 'info_bar_max_power', 'info_power_progress',
            'info_bar_money', 'time_flux_value',
            'sellBtnInfoBar', 'reduceHeatBtnInfoBar',
            // Parts containers
            'all_parts', 'cells', 'reflectors', 'capacitors', 'vents', 'heatExchangers',
            'heatInlets', 'heatOutlets', 'coolantCells', 'reactorPlatings', 'particleAccelerators',
            // Objectives
            'objectives_section', 'objective_title', 'objective_reward',
            // Tooltip (already querySelected in app.js, but can cache wrapper)
            'tooltip', 'tooltip_nav',
            // Reactor Stats Panel
            'stats_power', 'stats_heat', 'stats_cash', 'stats_outlet', 'stats_inlet', 'stats_vent',
            'money_per_tick', 'power_per_tick', 'heat_per_tick',
            // Upgrades & Experiments
            'reactor_upgrades', 'all_upgrades', // Main containers for pages
            'options_section', 'help_section', 'about_section', 'patch_section',
            'upgrades_section', 'experimental_upgrades_section',
            'current_exotic_particles', 'exotic_particles', // These are for display in experiment tab
            'reboot_exotic_particles', 'refund_exotic_particles', // Spans within reboot buttons
            'reboot_btn', 'refund_btn', 'reset_game',
            // Toggle buttons
            'auto_sell_toggle', 'auto_buy_toggle', 'time_flux_toggle', 'heat_control_toggle', 'pause_toggle',
            'parts_panel_toggle', 'sidebar_toggle',
            // Options page buttons (newly added)
            'enable_google_drive_save', 'enable_local_save', 'trigger_save',
            'export_save', 'download_save', 'import_save',
            'Import_Export_dialog', 'Import_Export_close_button', 'import_button', 'txtImportExport',
            'speed_hack', 'offline_tick' // Assuming these are IDs
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                this.DOMElements[id] = el;
                // Add camelCase version if it contains underscores
                if (id.includes('_')) {
                    const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                    this.DOMElements[camelCaseKey] = el;
                }
            } else {
                console.warn(`[UI Cache] Element with ID '${id}' not found.`);
            }
        });

        // Ensure critical elements are explicitly checked
        if (!this.DOMElements.reactor) {
            console.error("[UI Cache] Critical element #reactor not found!");
            return false;
        }

        // Cache EP display spans if not caught by general ID list
        this.DOMElements.currentExoticParticlesDisplay = document.getElementById('current_exotic_particles');
        this.DOMElements.totalExoticParticlesDisplay = document.getElementById('exotic_particles');

        return true;
    }


  initializeToggleButtons() {
            for (const key in this.toggle_buttons_config) {
                const config = this.toggle_buttons_config[key];
                const button = this.DOMElements[config.id]; // Get from cached DOMElements
                if (button) {
                    button.onclick = () => {
                        if (!this.game || typeof this.game[config.gameProperty] === 'undefined') {
                            console.error(`[UI] Game property '${config.gameProperty}' not defined for toggle button '${config.id}'.`);
                            return;
                        }
                        const gamePropertyValue = this.game[config.gameProperty];
                        let isFeatureCurrentlyActive = config.isPropertyNegated ? !gamePropertyValue : gamePropertyValue;

                        if (isFeatureCurrentlyActive) {
                            if (typeof config.disableFunc === 'function') config.disableFunc();
                            else console.error(`[UI] disableFunc is not a function for '${config.id}'`);
                        } else {
                            if (typeof config.enableFunc === 'function') config.enableFunc();
                            else console.error(`[UI] enableFunc is not a function for '${config.id}'`);
                        }
                        // State update for button class will be handled by the 'evt' in say() or direct call to updateToggleButtonState
                    };
                } else {
                     console.warn(`[UI] Toggle button with ID '${config.id}' not found.`);
                }
            }
            this.updateAllToggleBtnStates(); // Initial state sync
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
        
        setupPartsTabs() {
            const tabButtons = Array.from(document.querySelectorAll('.parts_tab'));
            const tabContents = Array.from(document.querySelectorAll('.parts_tab_content'));

            tabButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (btn.disabled) return;
                    const clickedTabId = btn.getAttribute('data-tab');

                    tabButtons.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    btn.classList.add('active');
                    const contentToShow = document.getElementById('parts_tab_' + clickedTabId);
                    if (contentToShow) contentToShow.classList.add('active');
                });
            });
        }
    
        runUpdateInterfaceLoop() {
            updateProperty(); 

            for (const [key, value] of this.update_vars) {
                const config = this.var_objs_config[key];
                if (!config) continue;

                let displayValue = value;
                if ((key === 'current_heat' || key === 'max_heat') && typeof value === 'number') {
                    displayValue = Math.floor(value); // Display whole numbers for heat
                }

                if (config.dom && config.dom instanceof HTMLElement) {
                    let textContent = config.formatter ? config.formatter(displayValue) : (config.num ? fmt(displayValue, config.places || null) : displayValue);
                    if(config.prefix) textContent = config.prefix + textContent;
                    if(config.suffix) textContent = textContent + config.suffix;
                    config.dom.textContent = textContent;
                }
                if (config.onupdate) config.onupdate();
            }
            this.update_vars.clear();

            if (this.game && this.game.active_tiles_list) {
                this.game.active_tiles_list.forEach(tile => {
                    if (!tile.$percent || !tile.part || !tile.activated) {
                        if(tile.$percent) tile.$percent.style.width = '0%'; // Clear if no part or not active
                        return;
                    }
                    if ((tile.part.category === 'cell' || tile.part.category === 'reflector') && tile.part.ticks > 0) {
                        const perc = Math.max(0, Math.min(1, tile.ticks / tile.part.ticks));
                        tile.$percent.style.width = (perc * 100) + '%';
                        tile.$percent.style.backgroundColor = '#0f0'; // Green for durability
                    } else if (tile.part.containment > 0) {
                        const perc = Math.max(0, Math.min(1, tile.heat_contained / tile.part.containment));
                        tile.$percent.style.width = (perc * 100) + '%';
                        tile.$percent.style.backgroundColor = '#f00'; // Red for heat
                    } else {
                        tile.$percent.style.width = '0%'; // No relevant progress
                    }
                });
            }

            if(this.game && this.game.partset) this.game.partset.check_affordability(this.game);
            if(this.game && this.game.upgradeset) this.game.upgradeset.check_affordability(this.game);

            clearTimeout(this.update_interface_task);
            this.update_interface_task = setTimeout(() => this.runUpdateInterfaceLoop(), this.update_interface_interval);
        }



    init(gameInstance) {
        console.log('[UI] INIT GAME: Starting initialization');

        console.log('[UI] INIT GAME: Caching DOM elements...');
        if (!this.cacheDOMElements()) {
            console.error('[UI] Failed to cache required DOM elements. Initialization aborted.');
            return false;
        }

        console.log(`[UI] INIT GAME: Setting reactor grid columns to ${gameInstance.cols}`);
        this.DOMElements.reactor.style.gridTemplateColumns = `repeat(${gameInstance.cols}, 32px)`;
    
        console.log('[UI] INIT GAME: Setting up event listeners...');
        this.setupEventListeners(gameInstance);

        console.log('[UI] INIT GAME: Initializing toggle buttons...');
        this.initializeToggleButtons();

        console.log('[UI] INIT GAME: Setting up part tabs...');
        this.setupPartsTabs();

        for (const key in this.var_objs_config) {
            const config = this.var_objs_config[key];
            if (config.domId) {
                config.dom = this.DOMElements[config.domId] || this.DOMElements[config.domId.replace(/_([a-z])/g, (g) => g[1].toUpperCase())];
            }
        }
        console.log('[UI] INIT GAME: Scheduling interface update loop...');
        this.update_interface_task = setTimeout(() => this.runUpdateInterfaceLoop(), this.update_interface_interval);
        
        console.log('[UI] INIT GAME: Initialization complete.');
        return true;
    }

    setupEventListeners(gameInstance) {
        if (this.DOMElements.reactor) {
            this.DOMElements.reactor.addEventListener('click', (e) => {
                const tile_el = e.target.closest('.tile');
                if (tile_el && tile_el.tile) {
                    const tile = tile_el.tile;
                    if (tile.enabled) {
                        const clicked_part = this.eventHandlers.getClickedPart();
                        if (clicked_part) {
                            tile.part = clicked_part;
                            tile.activated = true;
                            tile.ticks = clicked_part.ticks;
                            tile.heat_contained = 0;
                            tile.$el.classList.add('activated');
                            this.eventHandlers.setClickedPart(null);
                            if (this.DOMElements.main) this.DOMElements.main.classList.remove('part_active');
                        } else if (tile.part) {
                            tile.part = null;
                            tile.activated = false;
                            tile.ticks = 0;
                            tile.heat_contained = 0;
                            tile.$el.classList.remove('activated'); 
                        }
                        gameInstance.update_cell_power();
                    }
                }
            });
        }
    }

}

