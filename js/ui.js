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
        this.stateManager = new EventHandlers(this);
        
        // Define toggle button configurations
        this.toggle_buttons_config = {
            auto_sell: { id: 'auto_sell_toggle', stateProperty: 'auto_sell' },
            auto_buy: { id: 'auto_buy_toggle', stateProperty: 'auto_buy' },
            time_flux: { id: 'time_flux_toggle', stateProperty: 'time_flux' },
            heat_control: { id: 'heat_control_toggle', stateProperty: 'heat_control' },
            pause: { id: 'pause_toggle', stateProperty: 'pause' },
            // New main control buttons
            main_auto_sell: { 
                id: 'main_auto_sell_toggle_btn', 
                stateProperty: 'auto_sell',
                textMap: {true: 'Disable Auto Sell', false: 'Enable Auto Sell'}
            },
            main_auto_buy: { 
                id: 'main_auto_buy_toggle_btn', 
                stateProperty: 'auto_buy',
                textMap: {true: 'Disable Auto Buy', false: 'Enable Auto Buy'}
            },
            main_time_flux: { 
                id: 'main_time_flux_toggle_btn', 
                stateProperty: 'time_flux',
                textMap: {true: 'Disable Time Flux', false: 'Enable Time Flux'}
            },
            main_heat_controller: { 
                id: 'main_heat_controller_toggle_btn', 
                stateProperty: 'heat_control',
                textMap: {true: 'Disable Heat Controller', false: 'Enable Heat Controller'}
            },
            main_pause: { 
                id: 'main_pause_toggle_btn', 
                stateProperty: 'pause',
                textMap: {true: 'Play', false: 'Pause'}
            },
            main_parts_panel: { 
                id: 'parts_panel_toggle', 
                stateProperty: 'parts_panel',
                textMap: {true: '>', false: '<'}
            }
        };
    }

    cacheDOMElements() {
        const ids = this.stateManager.getVar('data')['dom_ids'];

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
        if (!this.game) {
            console.error('[UI] Cannot initialize toggle buttons: Game instance not found');
            return;
        }

        for (const buttonKey in this.toggle_buttons_config) {
            const config = this.toggle_buttons_config[buttonKey];
            const button = this.DOMElements[config.id];

            if (button) {
                button.onclick = () => {
                    const currentState = this.stateManager.getVar(config.stateProperty);
                    const newState = !currentState;
                    
                    // Update the single source of truth
                    this.stateManager.setVar(config.stateProperty, newState);

                    // Game logic should react to this state change
                    if (this.game && typeof this.game.onToggleStateChange === 'function') {
                        this.game.onToggleStateChange(config.stateProperty, newState);
                    }
                };
            } else {
                console.warn(`[UI] Toggle button with ID '${config.id}' not found.`);
            }
        }
        this.updateAllToggleBtnStates();
    }

    updateAllToggleBtnStates() {
        console.log('[UI] updateAllToggleBtnStates');
        if (!this.game) return;
        for (const buttonKey in this.toggle_buttons_config) {
            const config = this.toggle_buttons_config[buttonKey];
            const isActive = this.stateManager.getVar(config.stateProperty);
            this.updateToggleButtonState(buttonKey, isActive);
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
        
        // Set the game instance
        this.game = gameInstance;
        if (!this.game) {
            console.error('[UI] No game instance provided for initialization');
            return false;
        }

        // Set game instance in EventHandlers
        this.stateManager.setGame(gameInstance);

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

        // Initialize state variables from EventHandlers.stateManager
        for (const key in this.stateManager.data) {
            if (this.stateManager.data.hasOwnProperty(key) && this.var_objs_config[key]) {
                this.current_vars.set(key, this.stateManager.getVar(key));
                this.update_vars.set(key, this.stateManager.getVar(key));
            }
        }

        console.log('[UI] INIT GAME: Scheduling interface update loop...');
        this.update_interface_task = setTimeout(() => this.runUpdateInterfaceLoop(), this.update_interface_interval);
        
        console.log('[UI] INIT GAME: Initialization complete.');
        return true;
    }

    showPage(pageId) {
        if (!this.DOMElements.main) {
            console.error("[UI] Main element (#main) not found for page switching.");
            return;
        }

        const pageElementIds = [
            'reactor_section',
            'upgrades_section',
            'experimental_upgrades_section',
            'options_section',
            'help_section',
            'about_section'
        ];

        // Hide all pages
        pageElementIds.forEach(id => {
            if (this.DOMElements[id] && this.DOMElements[id].classList.contains('page')) {
                this.DOMElements[id].classList.remove('showing');
            }
        });

        // Show the target page
        if (this.DOMElements[pageId] && this.DOMElements[pageId].classList.contains('page')) {
            this.DOMElements[pageId].classList.add('showing');
            console.log(`[UI] Switched to page: ${pageId}`);
        } else {
            console.error(`[UI] Target page element for ID '${pageId}' not found or not a page in DOMElements.`);
        }
    }

    setupEventListeners(gameInstance) {
        // Existing reactor click listener
        if (this.DOMElements.reactor) {
            this.DOMElements.reactor.addEventListener('click', (e) => {
                const tile_el = e.target.closest('.tile');
                if (tile_el && tile_el.tile) {
                    const tile = tile_el.tile;
                    if (tile.enabled) {
                        const clicked_part = this.stateManager.getClickedPart();
                        if (clicked_part) {
                            tile.part = clicked_part;
                            tile.activated = true;
                            tile.ticks = clicked_part.ticks;
                            tile.heat_contained = 0;
                            tile.$el.classList.add('activated');
                            this.stateManager.setClickedPart(null);
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

        // Navigation event listeners
        const setupNavListeners = (container, buttonClass) => {
            if (container) {
                container.addEventListener('click', (event) => {
                    const button = event.target.closest(buttonClass);
                    if (button && button.dataset.page) {
                        this.showPage(button.dataset.page);
                        
                        // Update active state for bottom nav buttons
                        if (buttonClass === '.bottom_nav_btn') {
                            const allTabs = container.querySelectorAll(buttonClass);
                            allTabs.forEach(tab => tab.classList.remove('active'));
                            button.classList.add('active');
                        }
                    }
                });
            }
        };

        // Setup bottom navigation
        setupNavListeners(this.DOMElements.bottom_nav, '.bottom_nav_btn');

        // Setup main top controls navigation (Options, Help, About)
        setupNavListeners(this.DOMElements.main_top_controls_wrapper, '.styled-button[data-page]');
    }

    updateToggleButtonState(buttonKey, isActive) {
        console.log('[UI] updateToggleButtonState:', buttonKey, isActive);
        const config = this.toggle_buttons_config[buttonKey];
        if (!config) {
            return;
        }

        const button = this.DOMElements[config.id];
        if (!button) {
            return;
        }

        if (isActive) {
            button.classList.add('on');
            button.classList.remove('off');
        } else {
            button.classList.remove('on');
            button.classList.add('off');
        }

        // Update button text if textMap is defined
        if (config.textMap && button) {
            button.textContent = config.textMap[isActive];
        }
    }

}

