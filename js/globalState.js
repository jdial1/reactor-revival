export var GlobalState = {
            components: {
                game: null,
                ui: null,
                event: null,
                upgradeset: null,
                partset: null,
                tileset: null,
                reactor: null,
            },
            data: {
                auto_sell: false,
                auto_buy: false,
                heat_control: false,
                time_flux: true,
                pause: false,
                parts_panel: false,
                var_objs_config : {
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
                    auto_sell: { onupdate: () => this.updateToggleButtonState('auto_sell', this.current_vars.get('auto_sell')) },
                    auto_buy: { onupdate: () => this.updateToggleButtonState('auto_buy', this.current_vars.get('auto_buy')) },
                    heat_control: { onupdate: () => this.updateToggleButtonState('heat_control', this.current_vars.get('heat_control')) },
                    time_flux: { onupdate: () => this.updateToggleButtonState('time_flux', this.current_vars.get('time_flux')) },
                    pause: { onupdate: () => this.updateToggleButtonState('pause', this.current_vars.get('pause')) },
                    parts_panel: { onupdate: () => this.updateToggleButtonState('parts_panel', this.current_vars.get('parts_panel')) },
                    },
                    toggle_buttons_config: {
                        auto_sell: { id: 'auto_sell_toggle', stateProperty: 'auto_sell' },
                        auto_buy: { id: 'auto_buy_toggle', stateProperty: 'auto_buy' },
                        heat_control: { id: 'heat_control_toggle', stateProperty: 'heat_control' },
                        time_flux: { id: 'time_flux_toggle', stateProperty: 'time_flux' },
                        pause: { id: 'pause_toggle', stateProperty: 'pause' },
                        parts_panel: { id: 'parts_panel_toggle', stateProperty: 'parts_panel' }
                    },
            dom_ids:[
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
            'parts_panel_toggle', 
            // Options page buttons (newly added)
            'Import_Export_dialog', 'Import_Export_close_button', 'import_button', 'txtImportExport',
            'speed_hack', 'offline_tick', 'bottom_nav' // Added bottom_nav
        ]
            }
        }


export const reset_global_state = () => {
    stateManager.auto_sell = false;
    stateManager.auto_buy = false;
    stateManager.heat_control = false;
    stateManager.time_flux = true;
    stateManager.pause = false;
    stateManager.parts_panel = false;
    stateManager.current_money = 10;
    stateManager.current_power = 0;
    stateManager.current_heat = 0;
    stateManager.max_power = 100;
    stateManager.max_heat = 100;
    stateManager.exotic_particles = 0;
    stateManager.current_exotic_particles = 0;
    stateManager.total_exotic_particles = 0;
    stateManager.current_exotic_particles = 0;
}

