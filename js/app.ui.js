import { updateProperty, numFormat as fmt, timeFormat } from './util.js';

(() => {
	'use strict';

	class UI {
		constructor() {
			this.game = null;
			this.DOMElements = {};
			this.rowsUI = [];
			this.current_vars = new Map();
			this.update_vars = new Map();
			this.update_interface_interval = 100;
			this.update_interface_task = null;
			this.do_check_upgrades_affordability = false;
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
			this.evts = {
				game_reset: () => this.updateAllToggleBtnStates(),
				game_loaded: () => this.updateAllToggleBtnStates(),
				paused: () => this.updateToggleButtonState('pause', true),
				unpaused: () => this.updateToggleButtonState('pause', false),
				auto_sell_disabled: () => this.updateToggleButtonState('auto_sell', false),
				auto_sell_enabled: () => this.updateToggleButtonState('auto_sell', true),
				auto_buy_disabled: () => this.updateToggleButtonState('auto_buy', false),
				auto_buy_enabled: () => this.updateToggleButtonState('auto_buy', true),
				heat_control_disabled: () => this.updateToggleButtonState('heat_control', false),
				heat_control_enabled: () => this.updateToggleButtonState('heat_control', true),
				time_flux_disabled: () => this.updateToggleButtonState('time_flux', false),
				time_flux_enabled: () => this.updateToggleButtonState('time_flux', true),
				objective_loaded: (objData) => {
					if (this.DOMElements.objectiveTitle) this.DOMElements.objectiveTitle.textContent = objData.title;
					if (this.DOMElements.objectiveReward) {
						this.DOMElements.objectiveReward.textContent = objData.reward ? fmt(objData.reward) : (objData.ep_reward ? `${fmt(objData.ep_reward)} EP` : '');
					}
					if (this.DOMElements.objectivesSection) this.DOMElements.objectivesSection.classList.remove('unloading', 'loading');
				},
				objective_unloaded: () => {
					if (this.DOMElements.objectivesSection) this.DOMElements.objectivesSection.classList.add('unloading');
					setTimeout(() => {
						if (this.DOMElements.objectivesSection) this.DOMElements.objectivesSection.classList.add('loading');
					}, 300);
				},
				part_added: (part_obj) => {
					if (part_obj.erequires) {
						const required_upgrade = this.game && this.game.upgrade_objects && this.game.upgrade_objects[part_obj.erequires];
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
					const container = this.DOMElements[containerKey];
					if (container) {
						container.appendChild(part_el);
					} else {
						console.warn(`UI: Container for part category '${part_obj.category}' (expected key: '${containerKey}') not found in DOMElements. Appending to #parts as fallback.`);
						if (this.DOMElements.parts) {
							this.DOMElements.parts.appendChild(part_el);
						} else {
							console.error("UI: Fallback #parts container not found either.");
						}
					}
				},
				row_added: (row_index) => {},
				tile_added: (tile_data) => {
					const tile = tile_data.tile_instance;
					const tile_el = document.createElement('button');
					tile_el.className = 'tile';
					tile_el.dataset.row = tile_data.row;
					tile_el.dataset.col = tile_data.col;
					tile.tile_index = tile_data.row * this.game.max_cols + tile_data.col;
					tile_el.tile = tile;
					tile.$el = tile_el;
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
					if (this.DOMElements.reactor) {
						this.DOMElements.reactor.appendChild(tile_el);
					}
				},
			};
		}

		init(gameInstance) {
			this.game = gameInstance;
			this.cacheDOMElements();
			if (this.DOMElements.reactor && this.game) {
				this.DOMElements.reactor.style.gridTemplateColumns = `repeat(${this.game.cols}, 32px)`;
			}
			this.setupEventListeners();
			this.initializeToggleButtons();
			for (const key in this.var_objs_config) {
				const config = this.var_objs_config[key];
				if (config.domId) {
					// Try both the original domId and the camelCase version
					config.dom = this.DOMElements[config.domId] || this.DOMElements[config.domId.replace(/_([a-z])/g, (g) => g[1].toUpperCase())];
				}
			}
			this.update_interface_task = setTimeout(() => this.runUpdateInterfaceLoop(), this.update_interface_interval);
		}

		cacheDOMElements() {
			const ids = [
				'main', 'reactor', 'reactorBackground', 'reactorSection',
				'powerPercentage', 'heatPercentage', 'parts', 'primary', 'timeFlux',
				'money', 'currentPower', 'maxPower', 'statsPower',
				'currentHeat', 'maxHeat', 'statsHeat',
				'exoticParticles', 'rebootExoticParticles', 'currentExoticParticles', 'refundExoticParticles',
				'statsCash', 'statsOutlet', 'statsInlet', 'statsVent',
				'moneyPerTick', 'powerPerTick', 'heatPerTick',
				'cells', 'reflectors', 'capacitors', 'vents', 'heatExchangers',
				'heatInlets', 'heatOutlets', 'coolantCells', 'reactorPlatings', 'particleAccelerators',
				'objectivesSection', 'objectiveTitle', 'objectiveReward',
				'rebootBtn', 'refundBtn',
				'auto_sell_toggle', 'auto_buy_toggle', 'time_flux_toggle', 'heat_control_toggle', 'pause_toggle',
				'parts_panel_toggle', 'sidebar_toggle',
				'info_bar', 'info_heat_block', 'info_power_block', 'info_money_block',
				'info_bar_current_heat', 'info_bar_max_heat', 'info_bar_auto_heat_reduce',
				'info_bar_current_power', 'info_bar_max_power', 'info_bar_money',
				'sellBtnInfoBar', 'reduceHeatBtnInfoBar',
				'options', 'show_help', 'show_about',
				'partsSection'
			];
			ids.forEach(id => {
				const key = id.includes('_') ? id.replace(/_([a-z])/g, (g) => g[1].toUpperCase()) : id;
				this.DOMElements[key] = document.getElementById(id);
				if (!this.DOMElements[key] && id !== 'manualHeatReduce' && id !== 'autoHeatReduce' && !id.startsWith('info_bar_') && !id.endsWith('BtnInfoBar')) {
					// console.warn(`UI cache: Element with ID '${id}' (key: '${key}') not found.`);
				}
			});
			if (!this.DOMElements.reactor) this.DOMElements.reactor = document.getElementById('reactor');
			if (!this.DOMElements.partsSection) this.DOMElements.partsSection = document.getElementById('parts_section');
			if (!this.DOMElements.main) this.DOMElements.main = document.getElementById('main');
		}

		setupEventListeners() {
			const { rebootBtn, refundBtn, sellBtnInfoBar, reduceHeatBtnInfoBar, partsPanelToggle, sidebarToggle, options, showHelp, showAbout } = this.DOMElements;
			if (rebootBtn) rebootBtn.onclick = () => { if (confirm("Are you sure you want to reboot?")) this.game.reboot_action(); };
			if (refundBtn) refundBtn.onclick = () => { if (confirm("Are you sure you want to reboot and refund EP?")) this.game.reboot_action(true); };
			if (sellBtnInfoBar) sellBtnInfoBar.onclick = () => this.game.sell_action();
			if (reduceHeatBtnInfoBar) reduceHeatBtnInfoBar.onclick = () => this.game.manual_reduce_heat_action();
			if (partsPanelToggle && this.DOMElements.partsSection) {
				partsPanelToggle.onclick = () => {
					this.DOMElements.partsSection.classList.toggle('collapsed');
				};
			}
			if (sidebarToggle && this.DOMElements.partsSection) {
				sidebarToggle.onclick = () => {
					document.body.classList.toggle('sidebar-collapsed');
					document.body.classList.toggle('sidebar-expanded', !document.body.classList.contains('sidebar-collapsed'));
				};
			}
			const pageButtons = [options, showHelp, showAbout, ...document.querySelectorAll('#bottom_nav .bottom_nav_btn')];
			pageButtons.forEach(button => {
				if (button) {
					button.addEventListener('click', (e) => {
						const targetSectionId = e.currentTarget.dataset.section;
						const targetPageId = e.currentTarget.dataset.page;
						if (targetSectionId && targetPageId) {
							this.showPage(targetSectionId, targetPageId);
						}
					});
				}
			});
		}
		
		showPage(sectionId, pageId) {
			const section = document.getElementById(sectionId);
			if (!section) return;
			const pages = section.querySelectorAll('.page');
			pages.forEach(p => p.classList.remove('showing'));
			const targetPage = section.querySelector(`#${pageId}`);
			if (targetPage) {
				targetPage.classList.add('showing');
			}
		}

		initializeToggleButtons() {
			for (const key in this.toggle_buttons_config) {
				const config = this.toggle_buttons_config[key];
				const button = document.getElementById(config.id);
				if (button) {
					this.DOMElements[config.id] = button;
					button.onclick = () => {
						if (!config.gameProperty) {
							console.error(`gameProperty not defined for toggle button config: ${config.id}`);
							return;
						}
						const gamePropertyValue = this.game[config.gameProperty];
						let isFeatureCurrentlyActive = config.isPropertyNegated ? !gamePropertyValue : gamePropertyValue;
						if (isFeatureCurrentlyActive) {
							if (typeof config.disableFunc === 'function') {
								config.disableFunc();
							} else {
								console.error(`disableFunc is not a function for ${config.id}`);
							}
						} else {
							if (typeof config.enableFunc === 'function') {
								config.enableFunc();
							} else {
								console.error(`enableFunc is not a function for ${config.id}`);
							}
						}
					};
				}
			}
			this.updateAllToggleBtnStates();
		}
		
		updateToggleButtonState(toggleName, isEnabled) {
			const config = this.toggle_buttons_config[toggleName];
			if (config && this.DOMElements[config.id]) {
				const button = this.DOMElements[config.id];
				if (isEnabled) {
					button.classList.add('enabled');
					button.classList.remove('disabled');
				} else {
					button.classList.add('disabled');
					button.classList.remove('enabled');
				}
			}
		}

		updateAllToggleBtnStates() {
			if (!this.game) return;
			for (const key in this.toggle_buttons_config) {
				const config = this.toggle_buttons_config[key];
				if (config.gameProperty) {
					const gamePropertyValue = this.game[config.gameProperty];
					const isFeatureActive = config.isPropertyNegated ? !gamePropertyValue : gamePropertyValue;
					this.updateToggleButtonState(key, isFeatureActive);
				}
			}
		}

		updatePercentageBar(currentVarKey, maxVarKey, domElement) {
			if (!domElement) return;
			const currentValue = this.current_vars.get(currentVarKey);
			const maxValue = this.current_vars.get(maxVarKey);
			if (typeof currentValue !== 'number' || typeof maxValue !== 'number' || maxValue === 0) {
				domElement.style.width = '0%';
				return;
			}
			const percent = Math.min(100, Math.max(0, (currentValue / maxValue) * 100));
			domElement.style.width = percent + '%';
		}

		updateReactorHeatBackground() {
			const current_heat = this.current_vars.get('current_heat');
			const max_heat = this.current_vars.get('max_heat');
			if (!this.DOMElements.reactorBackground || typeof current_heat !== 'number' || typeof max_heat !== 'number') return;
			if (max_heat <= 0) {
				this.DOMElements.reactorBackground.style.backgroundColor = 'transparent';
				return;
			}
			if (current_heat <= max_heat) {
				this.DOMElements.reactorBackground.style.backgroundColor = 'transparent';
			} else if (current_heat > max_heat && current_heat <= max_heat * 2) {
				this.DOMElements.reactorBackground.style.backgroundColor = `rgba(255, 0, 0, ${(current_heat - max_heat) / max_heat})`;
			} else {
				this.DOMElements.reactorBackground.style.backgroundColor = 'rgb(255, 0, 0)';
			}
		}
		
		check_affordability_parts() {
			if (!this.game || !this.game.part_objects_array) return;
			this.game.part_objects_array.forEach(part => {
				let affordable = false;
				if (part.erequires) {
					const required_upgrade = this.game.upgrade_objects[part.erequires];
					if (required_upgrade && required_upgrade.level > 0 && this.game.current_exotic_particles >= part.cost) {
						affordable = true;
					}
				} else {
					if (this.game.current_money >= part.cost) {
						affordable = true;
					}
				}
				part.setAffordable(affordable);
				if (part.$el) {
					part.$el.classList.toggle('unaffordable', !affordable);
				}
			});
		}

		check_upgrades_affordability() {
			if (!this.game || !this.game.upgrade_objects_array) return;
			this.game.upgrade_objects_array.forEach(upgrade => {
				let affordable = false;
				if (upgrade.level >= upgrade.max_level) {
					affordable = false;
				} else if (upgrade.upgrade.ecost) {
					const req = upgrade.erequires ? this.game.upgrade_objects[upgrade.erequires] : null;
					if ((!req || req.level > 0) && this.game.current_exotic_particles >= upgrade.current_ecost) {
						affordable = true;
					}
				} else {
					 if (this.game.current_money >= upgrade.current_cost) {
						affordable = true;
					}
				}
				upgrade.setAffordable(affordable);
				if (upgrade.$el) {
					upgrade.$el.classList.toggle('unaffordable', !affordable);
					 upgrade.$el.disabled = !affordable && upgrade.level < upgrade.max_level;
				}
			});
		}

		runUpdateInterfaceLoop() {
			updateProperty();
			for (const [key, value] of this.update_vars) {
				const obj_config = this.var_objs_config[key];
				if (!obj_config) continue;
				let displayValue = value;
				// For heat values, always show as integer
				if ((key === 'current_heat' || key === 'max_heat') && typeof value === 'number') {
					displayValue = Math.floor(value);
				}
				if (obj_config.dom && obj_config.dom instanceof HTMLElement) {
					obj_config.dom.textContent = obj_config.num ? fmt(displayValue, obj_config.places || null) : displayValue;
				}
				if (obj_config.onupdate) obj_config.onupdate();
			}

			// Update info bar progress bars
			const heat = this.current_vars.get('current_heat');
			const maxHeat = this.current_vars.get('max_heat');
			const power = this.current_vars.get('current_power');
			const maxPower = this.current_vars.get('max_power');
			const heatBar = document.getElementById('info_heat_progress');
			const powerBar = document.getElementById('info_power_progress');
			if (heatBar && typeof heat === 'number' && typeof maxHeat === 'number' && maxHeat > 0) {
				heatBar.style.width = Math.min(100, Math.max(0, (heat / maxHeat) * 100)) + '%';
			} else if (heatBar) {
				heatBar.style.width = '0%';
			}
			if (powerBar && typeof power === 'number' && typeof maxPower === 'number' && maxPower > 0) {
				powerBar.style.width = Math.min(100, Math.max(0, (power / maxPower) * 100)) + '%';
			} else if (powerBar) {
				powerBar.style.width = '0%';
			}

			this.update_vars.clear();
			this.check_affordability_parts();
			this.check_upgrades_affordability();
			clearTimeout(this.update_interface_task);
			this.update_interface_task = setTimeout(() => this.runUpdateInterfaceLoop(), this.update_interface_interval);
		}

		say(type, name, val) {
			if (type === 'var') {
				if (val === this.current_vars.get(name) && !this.var_objs_config[name]?.forceUpdate) return;
				this.current_vars.set(name, val);
				this.update_vars.set(name, val);
			} else if (type === 'evt') {
				if (this.evts && this.evts[name]) {
					this.evts[name](val);
				}
			}
		}

		updateReactorGridColumns() {
			if (this.DOMElements.reactor && this.game) {
				this.DOMElements.reactor.style.gridTemplateColumns = `repeat(${this.game.cols}, 32px)`;
			}
		}
	}

	const ui = new UI();
	window.ui = ui;
})();
