import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { numFormat as fmt } from "../format/numbers.js";
import { escapeHtml } from "../dom/lit.js";
import { actions } from "../store.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { runCheckAffordability, setUpgradeCardRefreshHandler } from "../domain/upgrade-affordance.js";
import { isCellUpgradeVisible } from "../domain/upgrade.js";
import { calculateSectionCounts, findTopAffordableInSection } from "../logic-upgrade-sections.js";
import { UpgradeCard } from "./button-factory.js";
import { getUiElement } from "./page-dom.js";
import {
  debugVariablesSectionTemplate,
  debugVariablesTemplate,
  sectionHubMetaTemplate,
  upgradeHubDetailEmptyTemplate,
  upgradeHubDetailPanelTemplate,
} from "../templates/uiComponentsTemplates.js";
const EXPAND_UPGRADE_IDS = ["expand_reactor_rows", "expand_reactor_cols"];

function getUpgradeContainerId(upgrade) {
  if (upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0)) {
    return upgrade.upgrade.type;
  }
  const map = {
    cell_power: "cell_power_upgrades",
    cell_tick: "cell_tick_upgrades",
    cell_perpetual: "cell_perpetual_upgrades",
    exchangers: "exchanger_upgrades",
    vents: "vent_upgrades",
    other: "other_upgrades",
  };
  const key = upgrade.upgrade?.type;
  return key?.endsWith("_upgrades") ? key : (map[key] || key);
}

function filterVisibleUpgrades(upgrades, upgradeset) {
  const game = upgradeset?.game;
  return upgrades.filter((u) => isCellUpgradeVisible(u, game));
}

function syncSelectedUpgradeVisibility(upgradeset) {
  const ui = upgradeset?.game?.ui;
  const selectedId = ui?.uiState?.interaction?.selectedUpgradeId;
  if (!selectedId) return;
  const upgrade = upgradeset?.getUpgrade(selectedId);
  if (!upgrade || !isCellUpgradeVisible(upgrade, upgradeset.game)) {
    ui.uiState.interaction.selectedUpgradeId = null;
  }
}

function buildUpgradeCardTemplate(upgradeset, upgrade, doctrineSource, useReactiveLevelAndCost, selectedUpgradeId) {
  const onBuyClick = (e) => {
    e.stopPropagation();
    if (!upgradeset.isUpgradeAvailable(upgrade.id)) return;
    if (!upgradeset.purchaseUpgrade(upgrade.id)) {
      if (upgradeset.game) {
        actions.enqueueEffect(upgradeset.game, { kind: "sfx", id: "error", context: "global" });
        actions.enqueueEffect(upgradeset.game, {
          kind: "floating_text",
          body: "[Not enough funds!]",
          context: "global",
        });
      }
      return;
    }
    if (upgradeset.game) actions.enqueueEffect(upgradeset.game, { kind: "sfx", id: "upgrade", context: "global" });
  };
  const onSelectClick = (e) => {
    if (e.target.closest(".upgrade-action-btn")) return;
    const ui = upgradeset.game?.ui;
    if (!ui?.uiState?.interaction) return;
    const current = ui.uiState.interaction.selectedUpgradeId;
    ui.uiState.interaction.selectedUpgradeId = current === upgrade.id ? null : upgrade.id;
  };
  const selected = selectedUpgradeId === upgrade.id;
  return UpgradeCard(upgrade, doctrineSource, onBuyClick, { useReactiveLevelAndCost, selected, onSelectClick });
}

function renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, useReactiveLevelAndCost, container, selectedUpgradeId) {
  const cards = upgrades.map((upgrade) => buildUpgradeCardTemplate(upgradeset, upgrade, doctrineSource, useReactiveLevelAndCost, selectedUpgradeId));
  try {
    render(html`${cards}`, container);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (msg.includes("nextSibling") || msg.includes("parentNode")) return;
    throw err;
  }
}

function mountUpgradeReactiveDisplay(upgrade, display, container) {
  const root = container?.querySelector(`[data-id="${upgrade.id}"]`);
  const levelContainer = root?.querySelector(".upgrade-level-info");
  if (levelContainer) {
    if (typeof upgrade._levelReactiveUnmount === "function") {
      try {
        upgrade._levelReactiveUnmount();
      } catch (_) {}
      upgrade._levelReactiveUnmount = null;
    }
    levelContainer.replaceChildren();
    let lastLevelHeader;
    const levelRenderFn = () => html`<span class="level-text cathode-readout"></span>`;
    const afterLevelReadout = () => {
      const el = levelContainer.querySelector(".cathode-readout");
      const d = display[upgrade.id] ?? upgrade;
      const lvl = d.level ?? upgrade.level;
      const header = lvl >= upgrade.max_level ? "MAX" : `Level ${lvl}/${upgrade.max_level}`;
      if (!el || typeof header !== "string") return;
      if (lastLevelHeader === undefined) {
        el.textContent = header;
        lastLevelHeader = header;
        return;
      }
      if (lastLevelHeader === header) return;
      lastLevelHeader = header;
      el.textContent = header;
    };
    upgrade._levelReactiveUnmount = bindLitRenderMulti(
      [{ state: display, keys: [upgrade.id] }],
      levelRenderFn,
      levelContainer,
      afterLevelReadout
    );
  }
}

export function refreshUpgradeCards(upgradeset) {
  if (typeof document === "undefined" || !upgradeset) return;
  syncSelectedUpgradeVisibility(upgradeset);
  const filtered = filterVisibleUpgrades(upgradeset.upgradesArray, upgradeset);
  const selectedUpgradeId = upgradeset.game?.ui?.uiState?.interaction?.selectedUpgradeId ?? null;
  const byContainer = new Map();
  filtered.forEach((upgrade) => {
    const cid = getUpgradeContainerId(upgrade);
    if (!byContainer.has(cid)) byContainer.set(cid, []);
    byContainer.get(cid).push(upgrade);
  });
  const doctrineSource = (id) => upgradeset.game?.upgradeset?.getDoctrineForUpgrade(id);
  const state = upgradeset.game?.state;
  const useReactiveLevelAndCost = !!state?.upgrade_display;
  byContainer.forEach((upgrades, containerId) => {
    const container = document.getElementById(containerId);
    if (!container?.isConnected) return;
    renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, useReactiveLevelAndCost, container, selectedUpgradeId);
    const display = state?.upgrade_display;
    upgrades.forEach((upgrade) => {
      if (display) mountUpgradeReactiveDisplay(upgrade, display, container);
    });
  });
  clearEmptyUpgradeContainers(byContainer);
}

function clearEmptyUpgradeContainers(byContainer) {
  const containerIds = [
    "cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades", "vent_upgrades", "exchanger_upgrades", "other_upgrades",
    "experimental_laboratory", "experimental_boost", "experimental_parts", "experimental_cells", "experimental_cells_boost", "experimental_particle_accelerators",
  ];
  containerIds.forEach((containerId) => {
    if (byContainer.has(containerId)) return;
    const container = document.getElementById(containerId);
    if (!container?.isConnected) return;
    try {
      render(html``, container);
    } catch (_) {}
  });
}

setUpgradeCardRefreshHandler(refreshUpgradeCards);

export function runPopulateUpgradeSection(upgradeset, wrapperId, filterFn) {
  if (typeof document === "undefined") return;
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper?.isConnected) return;

  syncSelectedUpgradeVisibility(upgradeset);
  const filtered = filterVisibleUpgrades(
    upgradeset.upgradesArray
      .filter(filterFn)
      .filter((u) => !EXPAND_UPGRADE_IDS.includes(u.upgrade?.id)),
    upgradeset
  );

  const selectedUpgradeId = upgradeset.game?.ui?.uiState?.interaction?.selectedUpgradeId ?? null;
  const byContainer = new Map();
  filtered.forEach((upgrade) => {
    const cid = getUpgradeContainerId(upgrade);
    if (!byContainer.has(cid)) byContainer.set(cid, []);
    byContainer.get(cid).push(upgrade);
  });

  const doctrineSource = (id) => upgradeset.game?.upgradeset?.getDoctrineForUpgrade(id);
  const state = upgradeset.game?.state;
  const useReactiveLevelAndCost = !!state?.upgrade_display;

  byContainer.forEach((upgrades, containerId) => {
    const container = document.getElementById(containerId);
    if (!container?.isConnected) return;
    renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, useReactiveLevelAndCost, container, selectedUpgradeId);
  });
  clearEmptyUpgradeContainers(byContainer);

  const game = upgradeset.game;
  filtered.forEach((upgrade) => {
    const containerId = getUpgradeContainerId(upgrade);
    const container = document.getElementById(containerId);
    if (!container?.isConnected) return;
    upgrade.updateDisplayCost();
    const display = state?.upgrade_display;
    if (display) {
      mountUpgradeReactiveDisplay(upgrade, display, container);
    } else {
      const el = container.querySelector(`[data-id="${upgrade.id}"]`);
      const lr = el?.querySelector(".upgrade-level-info .cathode-readout");
      const t = lr?.textContent?.trim();
      if (lr && t) lr.textContent = t;
    }
  });

  if (game) runCheckAffordability(upgradeset, game);
}

export function updateSectionCountsState(ui, game) {
  if (!ui?.uiState || !game?.upgradeset) return;
  const sections = calculateSectionCounts(game.upgradeset);
  const counts = {};
  sections.forEach((s) => {
    counts[s.name] = { researched: s.researched, total: s.total, affordable: s.affordable ?? 0 };
  });
  ui.uiState.section_counts = counts;
  updateHubSectionPreviews(ui, game);
  updateResearchEpHint();
}

function updateResearchEpHint() {
  const hint = document.getElementById("research_ep_hint");
  const wrapper = document.getElementById("experimental_upgrades_content_wrapper");
  if (!hint || !wrapper) return;
  const allCollapsed = wrapper.querySelectorAll(".upgrade-hub-collapsible:not(.section-collapsed)").length === 0;
  hint.classList.toggle("hidden", !allCollapsed);
}

function updateHubSectionPreviews(ui, game) {
  const wrappers = ["upgrades_content_wrapper", "experimental_upgrades_content_wrapper"];
  wrappers.forEach((wrapperId) => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.querySelectorAll("h2[data-section-name]").forEach((h2) => {
      const sectionName = h2.getAttribute("data-section-name");
      if (!sectionName) return;
      const article = h2.closest(".upgrade-hub-collapsible");
      if (!article) return;
      let preview = article.querySelector(".section-hub-preview");
      if (!preview) {
        preview = document.createElement("p");
        preview.className = "section-hub-preview";
        const headerBlock = article.querySelector(".upgrade-section-header-block");
        if (headerBlock) headerBlock.appendChild(preview);
        else {
          const metaHost = article.querySelector(".section-hub-meta-host");
          if (metaHost) metaHost.insertAdjacentElement("afterend", preview);
          else h2.insertAdjacentElement("afterend", preview);
        }
      }
      const top = findTopAffordableInSection(game.upgradeset, sectionName);
      if (!top) {
        preview.textContent = "";
        preview.classList.add("hidden");
        return;
      }
      const isEp = top.base_ecost?.gt?.(0);
      const cost = isEp ? `${fmt(top.ecost)} EP` : `$${fmt(top.cost)}`;
      preview.textContent = `${top.title} · ${cost}`;
      preview.classList.remove("hidden");
    });
  });
}

function mountSectionCountsForWrapper(ui, wrapperId) {
  if (typeof document === "undefined") return [];
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper?.isConnected) return [];
  const h2s = wrapper.querySelectorAll("h2[data-section-name]");
  const unmounts = [];
  h2s.forEach((h2) => {
    const sectionName = h2.getAttribute("data-section-name");
    if (!sectionName) return;
    const headerBlock = h2.closest(".upgrade-section-header-block");
    let metaHost = headerBlock?.querySelector(".section-hub-meta-host");
    if (!metaHost) {
      metaHost = document.createElement("div");
      metaHost.className = "section-hub-meta-host";
      const row = headerBlock?.querySelector(".upgrade-section-header-row");
      if (row) row.appendChild(metaHost);
      else h2.insertAdjacentElement("afterend", metaHost);
    }
    const renderFn = () => {
      const section = ui.uiState?.section_counts?.[sectionName] ?? { researched: 0, total: 0, affordable: 0 };
      return sectionHubMetaTemplate(section);
    };
    unmounts.push(
      bindLitRenderMulti(
        [{ state: ui.uiState, keys: ["section_counts"] }],
        renderFn,
        metaHost
      )
    );
  });
  return unmounts;
}

export function mountSectionCountsReactive(ui, wrapperId) {
  if (!ui?.uiState) return () => {};
  const ids = wrapperId
    ? [wrapperId]
    : ["upgrades_content_wrapper", "experimental_upgrades_content_wrapper"];
  const unmounts = ids.flatMap((id) => mountSectionCountsForWrapper(ui, id));
  return () => unmounts.forEach((fn) => { try { fn(); } catch (_) {} });
}

function buildUpgradeDetailPanelData(upgrade, upgradeset) {
  if (!upgrade || !upgradeset) return null;
  const isMaxed = upgrade.level >= upgrade.max_level;
  const available = upgradeset.isUpgradeAvailable(upgrade.id);
  const doctrineLocked = !available;
  const display = upgradeset.game?.state?.upgrade_display?.[upgrade.id];
  const level = display?.level ?? upgrade.level;
  const levelHeader = isMaxed ? "MAX" : `Level ${level}/${upgrade.max_level}`;
  const rawDesc = isMaxed ? "" : (upgrade.description || "");
  const descHtml = upgrade.game?.ui?.stateManager
    ? upgrade.game.ui.stateManager.addPartIconsToTitle(rawDesc)
    : rawDesc;
  const costDisplay = isMaxed ? "" : (display?.display_cost ?? upgrade.display_cost ?? upgrade.cost ?? "");
  const iconPath = upgrade.upgrade?.icon ?? upgrade.icon ?? "img/ui/status/status_star.png";
  return {
    upgradeId: upgrade.id,
    iconPath,
    title: upgrade.title,
    descHtml,
    levelHeader,
    costDisplay,
    doctrineLocked,
    isMaxed,
    unaffordable: !upgrade.affordable && !isMaxed && !doctrineLocked,
    affordProgress: upgrade.afford_progress ?? 0,
    ariaLabel: isMaxed ? `${upgrade.title} is maxed out` : `Buy ${upgrade.title} for ${costDisplay}`,
    onBuyClick: (e) => {
      e.stopPropagation();
      if (!upgradeset.isUpgradeAvailable(upgrade.id)) return;
      if (!upgradeset.purchaseUpgrade(upgrade.id)) {
        if (upgradeset.game) {
          actions.enqueueEffect(upgradeset.game, { kind: "sfx", id: "error", context: "global" });
          actions.enqueueEffect(upgradeset.game, {
            kind: "floating_text",
            body: "[Not enough funds!]",
            context: "global",
          });
        }
        return;
      }
      if (upgradeset.game) actions.enqueueEffect(upgradeset.game, { kind: "sfx", id: "upgrade", context: "global" });
    },
  };
}

export function mountUpgradeDetailPanel(ui, panelId) {
  const panel = document.getElementById(panelId);
  if (!panel?.isConnected || !ui?.uiState) return null;
  const isResearchPanel = panelId === "research_detail_panel";
  const subscriptions = [
    { state: ui.uiState.interaction, keys: ["selectedUpgradeId"] },
    { state: ui.uiState, keys: ["active_page"] },
    { state: ui.game?.state, keys: ["upgrade_display", "current_money", "current_exotic_particles"] },
  ].filter((s) => s.state != null);
  const renderFn = () => {
    const activePage = ui.uiState.active_page;
    if (isResearchPanel && activePage !== "experimental_upgrades_section") {
      return upgradeHubDetailEmptyTemplate();
    }
    if (!isResearchPanel && activePage !== "upgrades_section") {
      return upgradeHubDetailEmptyTemplate();
    }
    const selectedId = ui.uiState.interaction.selectedUpgradeId;
    const upgradeset = ui.game?.upgradeset;
    const upgrade = selectedId && upgradeset ? upgradeset.getUpgrade(selectedId) : null;
    if (!upgrade || !isCellUpgradeVisible(upgrade, ui.game)) {
      return upgradeHubDetailEmptyTemplate();
    }
    const isResearchUpgrade = Boolean(upgrade.base_ecost?.gt?.(0));
    if (isResearchPanel !== isResearchUpgrade) {
      return upgradeHubDetailEmptyTemplate();
    }
    const data = buildUpgradeDetailPanelData(upgrade, upgradeset);
    if (!data) return upgradeHubDetailEmptyTemplate();
    return upgradeHubDetailPanelTemplate(data);
  };
  return bindLitRenderMulti(subscriptions, renderFn, panel);
}

function ensureUpgradeDetailSelectionRefresh(ui) {
  if (!ui || ui._upgradeDetailSelectionRefreshMounted) return;
  if (!ui.uiState?.interaction || !ui.game?.upgradeset) return;
  ui._upgradeDetailSelectionRefreshMounted = true;
  ui._unmounts.push(
    subscribeKey(ui.uiState.interaction, "selectedUpgradeId", () => {
      refreshUpgradeCards(ui.game.upgradeset);
    })
  );
}

export function ensureUpgradeDetailPanelMounted(ui, panelId) {
  if (!ui) return;
  if (!ui._upgradeDetailPanelUnmounts) ui._upgradeDetailPanelUnmounts = {};
  if (ui._upgradeDetailPanelUnmounts[panelId]) return;
  const unmount = mountUpgradeDetailPanel(ui, panelId);
  if (typeof unmount !== "function") return;
  ui._upgradeDetailPanelUnmounts[panelId] = unmount;
  ui._unmounts.push(unmount);
  ensureUpgradeDetailSelectionRefresh(ui);
}

export function mountUpgradeDetailPanels(ui) {
  ensureUpgradeDetailPanelMounted(ui, "upgrades_detail_panel");
  ensureUpgradeDetailPanelMounted(ui, "research_detail_panel");
  return () => {
    const unmounts = ui?._upgradeDetailPanelUnmounts;
    if (!unmounts) return;
    Object.values(unmounts).forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
    ui._upgradeDetailPanelUnmounts = {};
  };
}

export function getUpgradeSectionContainer(ui, locationKey) {
  return getUiElement(ui, locationKey) ?? document.getElementById(locationKey);
}

export function appendUpgradeToSection(ui, locationKey, upgradeEl) {
  const container = getUpgradeSectionContainer(ui, locationKey);
  if (container && upgradeEl) {
    container.appendChild(upgradeEl);
  }
}

function formatUpgradeDebugValue(value) {
  if (value === null || value === undefined) {
    return "<span class='debug-null'>null</span>";
  }
  if (typeof value === "boolean") {
    return `<span class='debug-boolean'>${value}</span>`;
  }
  if (typeof value === "number") {
    return `<span class='debug-number'>${value}</span>`;
  }
  if (typeof value === "string") {
    return `<span class='debug-string'>"${escapeHtml(value)}"</span>`;
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return `<span class='debug-array'>[${value.length} items]</span>`;
    }
    return `<span class='debug-object'>{${Object.keys(value).length} keys}</span>`;
  }
  return `<span class='debug-other'>${escapeHtml(String(value))}</span>`;
}

export function showUpgradeDebugPanel(ui) {
  const getEl = (id) => getUiElement(ui, id);
  const debugSection = getEl("debug_section");
  const debugToggleBtn = getEl("debug_toggle_btn");
  if (debugSection && debugToggleBtn) {
    debugSection.classList.remove("hidden");
    debugToggleBtn.textContent = "Hide Debug Info";
    updateUpgradeDebugVariables(ui);
  }
}

export function hideUpgradeDebugPanel(ui) {
  const getEl = (id) => getUiElement(ui, id);
  const debugSection = getEl("debug_section");
  const debugToggleBtn = getEl("debug_toggle_btn");
  if (debugSection && debugToggleBtn) {
    debugSection.classList.add("hidden");
    debugToggleBtn.textContent = "Show Debug Info";
  }
}

export function updateUpgradeDebugVariables(ui) {
  const debugVariables = getUiElement(ui, "debug_variables");
  if (!ui.game || !debugVariables) return;
  const gameVars = collectUpgradeDebugGameVariables(ui);
  const sectionTemplate = ([fileName, variables]) => {
    const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
    return debugVariablesSectionTemplate({
      fileName,
      sortedEntries,
      escapeKey: escapeHtml,
      renderValue: (value) => unsafeHTML(formatUpgradeDebugValue(value)),
    });
  };
  const entries = Object.entries(gameVars);
  const template = debugVariablesTemplate({ entries, renderSection: sectionTemplate });
  render(template, debugVariables);
}

export function collectUpgradeDebugGameVariables(ui) {
  const vars = {
    "Game (game.js)": {},
    "Reactor (reactor.js)": {},
    "State Manager": {},
    "UI State": {},
    Performance: {},
    Tileset: {},
    Engine: {},
  };
  if (!ui.game) return vars;
  const game = ui.game;
  vars["Game (game.js)"]["version"] = game.version;
  vars["Game (game.js)"]["base_cols"] = game.base_cols;
  vars["Game (game.js)"]["base_rows"] = game.base_rows;
  vars["Game (game.js)"]["max_cols"] = game.max_cols;
  vars["Game (game.js)"]["max_rows"] = game.max_rows;
  vars["Game (game.js)"]["rows"] = game.rows;
  vars["Game (game.js)"]["cols"] = game.cols;
  vars["Game (game.js)"]["base_loop_wait"] = game.base_loop_wait;
  vars["Game (game.js)"]["base_manual_heat_reduce"] = game.base_manual_heat_reduce;
  vars["Game (game.js)"]["upgrade_max_level"] = game.upgrade_max_level;
  vars["Game (game.js)"]["base_money"] = game.base_money;
  vars["Game (game.js)"]["current_money"] = game.state.current_money;
  vars["Game (game.js)"]["protium_particles"] = game.protium_particles;
  vars["Game (game.js)"]["total_exotic_particles"] = game.state.total_exotic_particles;
  vars["Game (game.js)"]["exotic_particles"] = game.exoticParticleManager.exotic_particles;
  vars["Game (game.js)"]["current_exotic_particles"] = game.state.current_exotic_particles;
  vars["Game (game.js)"]["loop_wait"] = game.loop_wait;
  vars["Game (game.js)"]["paused"] = game.paused;
  vars["Game (game.js)"]["autoSellEnabled"] = game.autoSellEnabled;
  vars["Game (game.js)"]["isAutoBuyEnabled"] = game.isAutoBuyEnabled;
  vars["Game (game.js)"]["sold_power"] = game.sold_power;
  vars["Game (game.js)"]["sold_heat"] = game.sold_heat;

  if (game.reactor) {
    const reactor = game.reactor;
    vars["Reactor (reactor.js)"]["base_max_heat"] = reactor.base_max_heat;
    vars["Reactor (reactor.js)"]["base_max_power"] = reactor.base_max_power;
    vars["Reactor (reactor.js)"]["current_heat"] = reactor.current_heat;
    vars["Reactor (reactor.js)"]["current_power"] = reactor.current_power;
    vars["Reactor (reactor.js)"]["max_heat"] = reactor.max_heat;
    vars["Reactor (reactor.js)"]["altered_max_heat"] = reactor.altered_max_heat;
    vars["Reactor (reactor.js)"]["max_power"] = reactor.max_power;
    vars["Reactor (reactor.js)"]["altered_max_power"] = reactor.altered_max_power;
    vars["Reactor (reactor.js)"]["auto_sell_multiplier"] = reactor.auto_sell_multiplier;
    vars["Reactor (reactor.js)"]["heat_power_multiplier"] = reactor.heat_power_multiplier;
    vars["Reactor (reactor.js)"]["heat_controlled"] = reactor.heat_controlled;
    vars["Reactor (reactor.js)"]["heat_outlet_controlled"] = reactor.heat_outlet_controlled;
    vars["Reactor (reactor.js)"]["vent_capacitor_multiplier"] = reactor.vent_capacitor_multiplier;
    vars["Reactor (reactor.js)"]["vent_plating_multiplier"] = reactor.vent_plating_multiplier;
    vars["Reactor (reactor.js)"]["transfer_capacitor_multiplier"] = reactor.transfer_capacitor_multiplier;
    vars["Reactor (reactor.js)"]["transfer_plating_multiplier"] = reactor.transfer_plating_multiplier;
    vars["Reactor (reactor.js)"]["has_melted_down"] = reactor.has_melted_down;
    vars["Reactor (reactor.js)"]["stats_power"] = reactor.stats_power;
    vars["Reactor (reactor.js)"]["stats_heat_generation"] = reactor.stats_heat_generation;
    vars["Reactor (reactor.js)"]["stats_vent"] = reactor.stats_vent;
    vars["Reactor (reactor.js)"]["stats_inlet"] = reactor.stats_inlet;
    vars["Reactor (reactor.js)"]["stats_outlet"] = reactor.stats_outlet;
    vars["Reactor (reactor.js)"]["stats_total_part_heat"] = reactor.stats_total_part_heat;
    vars["Reactor (reactor.js)"]["vent_multiplier_eff"] = reactor.vent_multiplier_eff;
    vars["Reactor (reactor.js)"]["transfer_multiplier_eff"] = reactor.transfer_multiplier_eff;
  }

  if (game.tileset) {
    const tileset = game.tileset;
    vars["Tileset"]["max_rows"] = tileset.max_rows;
    vars["Tileset"]["max_cols"] = tileset.max_cols;
    vars["Tileset"]["rows"] = tileset.rows;
    vars["Tileset"]["cols"] = tileset.cols;
    vars["Tileset"]["tiles_list_length"] = tileset.tiles_list?.length || 0;
    vars["Tileset"]["active_tiles_list_length"] = tileset.active_tiles_list?.length || 0;
    vars["Tileset"]["tiles_with_parts"] = tileset.tiles_list?.filter((t) => t.part)?.length || 0;
  }

  if (game.engine) {
    const engine = game.engine;
    vars["Engine"]["running"] = engine.running;
    vars["Engine"]["tick_count"] = engine.tick_count;
    vars["Engine"]["last_tick_time"] = engine.last_tick_time;
    vars["Engine"]["tick_interval"] = engine.tick_interval;
  }

  if (ui.stateManager) {
    const stateVars = ui.stateManager.getAllVars();
    Object.entries(stateVars).forEach(([key, value]) => {
      vars["State Manager"][key] = value;
    });
  }

  vars["UI State"]["update_interface_interval"] = ui.update_interface_interval;
  vars["UI State"]["isDragging"] = ui.inputHandler?.isDragging ?? false;
  vars["UI State"]["lastTileModified"] = ui.inputHandler?.lastTileModified ? "Tile Object" : null;
  vars["UI State"]["longPressTimer"] = ui.inputHandler?.longPressTimer ? "Active" : null;
  vars["UI State"]["longPressDuration"] = ui.inputHandler?.longPressDuration ?? 500;
  vars["UI State"]["last_money"] = ui.last_money;
  vars["UI State"]["last_exotic_particles"] = ui.last_exotic_particles;
  vars["UI State"]["ctrl9HoldTimer"] = null;
  vars["UI State"]["ctrl9HoldStartTime"] = null;
  vars["UI State"]["ctrl9MoneyInterval"] = null;
  vars["UI State"]["ctrl9BaseAmount"] = null;
  vars["UI State"]["ctrl9ExponentialRate"] = null;
  vars["UI State"]["ctrl9IntervalMs"] = null;
  vars["UI State"]["screen_resolution"] = `${window.innerWidth}x${window.innerHeight}`;
  vars["UI State"]["device_pixel_ratio"] = window.devicePixelRatio;

  if (game.performance) {
    const perf = game.performance;
    vars["Performance"]["enabled"] = perf.enabled;
    vars["Performance"]["marks"] = Object.keys(perf.marks || {}).length;
    vars["Performance"]["measures"] = Object.keys(perf.measures || {}).length;
  }

  return vars;
}
