import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import { repeat, styleMap, numFormat as fmt, logger, classMap, StorageUtils, serializeSave, escapeHtml, unsafeHTML, toNumber, formatTime, getPartImagePath, toDecimal } from "../../utils/utils_constants.js";
import { MODAL_IDS } from "../ui_modals.js";
import { runCheckAffordability, calculateSectionCounts } from "../../core/upgrades_system.js";
import { UpgradeCard, CloseButton, PartButton } from "../buttonFactory.js";
import { BlueprintService } from "../../core/parts_system.js";
import { setDecimal, preferences } from "../../core/store.js";
import { MOBILE_BREAKPOINT_PX, REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, BlueprintSchema, LegacyGridSchema } from "../../utils/utils_constants.js";
import { leaderboardService } from "../../services/services_cloud.js";
import { BaseComponent } from "../../core/reactor_state.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

export function mergeComponents(summary, checkedTypes) {
  const merged = {};
  summary.forEach(item => {
    const key = `${item.type}_${item.lvl}`;
    if (!merged[key]) {
      merged[key] = { ...item, count: 0, ids: [] };
    }
    merged[key].count += item.count ?? 1;
    merged[key].ids.push(item.id);
  });
  return merged;
}

export function renderComponentIcons(summary, options = {}, onSlotClick) {
  const { showCheckboxes = false, checkedTypes = {} } = options;
  const mergedComponents = mergeComponents(summary, checkedTypes);
  const items = Object.values(mergedComponents);
  if (items.length === 0) {
    return html`<div class="component-summary-section"></div>`;
  }
  return html`
    <div class="component-summary-section">
      <div class="component-header">
        <span class="component-title">Components</span>
      </div>
      <div class="component-grid">
        ${items.map(item => {
          const anyUnchecked = item.ids.some(id => checkedTypes[id] === false);
          const checked = !anyUnchecked;
          const isDisabled = showCheckboxes && !checked;
          const imagePath = getPartImagePath({ type: item.type, level: item.lvl });
          const fallbackChar = item.title ? item.title.charAt(0).toUpperCase() : "?";
          return html`
            <div class="component-slot ${isDisabled ? "component-disabled" : ""}"
                 data-ids="${item.ids.join(",")}"
                 data-type="${item.type}"
                 data-lvl="${String(item.lvl)}"
                 @click=${onSlotClick ? () => onSlotClick(item.ids, checked) : undefined}>
              <div class="component-icon">
                <img src="${imagePath}" alt="${item.title || ""}"
                     @error=${e => {
                       e.target.style.display = "none";
                       if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = "block";
                     }} />
                <div class="component-fallback" style="display: none;">${fallbackChar}</div>
              </div>
              <div class="component-count">${item.count}</div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

export class ComponentRenderingUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(container, summary, options = {}, onSlotClick) {
    const template = renderComponentIcons(summary, options, onSlotClick);
    render(template, container);
  }
}

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

function shouldSkipCellUpgrade(upgrade, upgradeset) {
  try {
    const upgType = upgrade?.upgrade?.type || "";
    const basePart = upgrade?.upgrade?.part;
    const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
    if (isCellUpgrade && basePart && basePart.category === "cell") {
      const show =
        upgradeset.game?.unlockManager && typeof upgradeset.game.unlockManager.isPartUnlocked === "function"
          ? upgradeset.game.unlockManager.isPartUnlocked(basePart)
          : true;
      return !show;
    }
  } catch (_) {}
  return false;
}

export function runPopulateUpgradeSection(upgradeset, wrapperId, filterFn) {
  if (typeof document === "undefined") return;
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper?.isConnected) return;

  const filtered = upgradeset.upgradesArray
    .filter(filterFn)
    .filter((u) => !EXPAND_UPGRADE_IDS.includes(u.upgrade?.id))
    .filter((u) => !(upgradeset.isUpgradeAvailable(u.id) && shouldSkipCellUpgrade(u, upgradeset)));

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

    const cards = upgrades.map((upgrade) => {
      const onBuyClick = (e) => {
        e.stopPropagation();
        if (!upgradeset.isUpgradeAvailable(upgrade.id)) return;
        if (!upgradeset.purchaseUpgrade(upgrade.id)) {
          if (upgradeset.game?.audio) upgradeset.game.audio.play("error");
          return;
        }
        if (upgradeset.game?.audio) upgradeset.game.audio.play("upgrade");
      };
      const onBuyMaxClick = (e) => {
        e.stopPropagation();
        if (!upgradeset.game?.isSandbox) return;
        if (upgradeset.isUpgradeAvailable(upgrade.id)) {
          const count = upgradeset.purchaseUpgradeToMax(upgrade.id);
          if (count > 0 && upgradeset.game?.audio) upgradeset.game.audio.play("upgrade");
        }
      };
      const onResetClick = (e) => {
        e.stopPropagation();
        if (upgradeset.game?.isSandbox) upgradeset.resetUpgradeLevel(upgrade.id);
      };
      return UpgradeCard(upgrade, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick, useReactiveLevelAndCost });
    });
    try {
      render(html`${cards}`, container);
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("nextSibling") || msg.includes("parentNode")) return;
      throw err;
    }
  });

  const game = upgradeset.game;
  filtered.forEach((upgrade) => {
    const container = document.getElementById(getUpgradeContainerId(upgrade));
    if (!container?.isConnected) return;
    upgrade.$el = container?.querySelector(`[data-id="${upgrade.id}"]`);
    if (upgrade.$el) {
      upgrade.updateDisplayCost();
      const display = state?.upgrade_display;
      if (display) {
        if (!display[upgrade.id]) display[upgrade.id] = { level: upgrade.level, display_cost: upgrade.display_cost };
        const levelContainer = upgrade.$el.querySelector(".upgrade-level-info");
        const costContainer = upgrade.$el.querySelector(".cost-display");
        if (levelContainer) {
          levelContainer.replaceChildren();
          const levelRenderFn = () => {
            const d = display[upgrade.id] ?? upgrade;
            const lvl = d.level ?? upgrade.level;
            const header = lvl >= upgrade.max_level ? "MAX" : `Level ${lvl}/${upgrade.max_level}`;
            return html`<span class="level-text">${header}</span>`;
          };
          ReactiveLitComponent.mountMulti(
            [{ state: display, keys: [upgrade.id] }],
            levelRenderFn,
            levelContainer
          );
        }
        if (costContainer) {
          costContainer.replaceChildren();
          const costRenderFn = () => {
            const d = display[upgrade.id] ?? upgrade;
            return html`${d.display_cost ?? upgrade.display_cost}`;
          };
          ReactiveLitComponent.mountMulti(
            [{ state: display, keys: [upgrade.id] }],
            costRenderFn,
            costContainer
          );
        }
      }
    }
  });

  if (game) runCheckAffordability(upgradeset, game);
}

export function updateSectionCountsState(ui, game) {
  if (!ui?.uiState || !game?.upgradeset) return;
  const sections = calculateSectionCounts(game.upgradeset);
  const counts = {};
  sections.forEach((s) => {
    counts[s.name] = { researched: s.researched, total: s.total };
  });
  ui.uiState.section_counts = counts;
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
    let countSpan = h2.querySelector(".section-count");
    if (!countSpan) {
      countSpan = document.createElement("span");
      countSpan.className = "section-count";
      h2.appendChild(countSpan);
    }
    const renderFn = () => {
      const section = ui.uiState?.section_counts?.[sectionName] ?? { researched: 0, total: 0 };
      return html` ${section.researched}/${section.total}`;
    };
    unmounts.push(
      ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["section_counts"] }],
        renderFn,
        countSpan
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

export class UpgradesUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('Upgrades', this);
  }

  getUpgradeContainer(locationKey) {
    return this.ui.DOMElements?.[locationKey] ?? this.ui.coreLoopUI?.getElement?.(locationKey) ?? document.getElementById(locationKey);
  }

  appendUpgrade(locationKey, upgradeEl) {
    const container = this.getUpgradeContainer(locationKey);
    if (container && upgradeEl) {
      container.appendChild(upgradeEl);
    }
  }

  showDebugPanel() {
    const ui = this.ui;
    const getEl = (id) => ui.coreLoopUI?.getElement?.(id) ?? ui.DOMElements?.[id];
    const debugSection = getEl("debug_section");
    const debugToggleBtn = getEl("debug_toggle_btn");
    if (debugSection && debugToggleBtn) {
      debugSection.classList.remove("hidden");
      debugToggleBtn.textContent = "Hide Debug Info";
      this.updateDebugVariables();
    }
  }

  hideDebugPanel() {
    const ui = this.ui;
    const getEl = (id) => ui.coreLoopUI?.getElement?.(id) ?? ui.DOMElements?.[id];
    const debugSection = getEl("debug_section");
    const debugToggleBtn = getEl("debug_toggle_btn");
    if (debugSection && debugToggleBtn) {
      debugSection.classList.add("hidden");
      debugToggleBtn.textContent = "Show Debug Info";
    }
  }

  updateDebugVariables() {
    const ui = this.ui;
    const debugVariables = ui.coreLoopUI?.getElement?.("debug_variables") ?? ui.DOMElements?.debug_variables;
    if (!ui.game || !debugVariables) return;
    const gameVars = this.collectGameVariables();
    const sectionTemplate = ([fileName, variables]) => {
      const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
      return html`
        <div class="debug-section">
          <h4>${fileName}</h4>
          <div class="debug-variables-list">
            ${repeat(sortedEntries, ([k]) => k, ([key, value]) => html`
              <div class="debug-variable">
                <span class="debug-key">${escapeHtml(key)}:</span>
                <span class="debug-value">${unsafeHTML(this.formatDebugValue(value))}</span>
              </div>
            `)}
          </div>
        </div>
      `;
    };
    const entries = Object.entries(gameVars);
    const template = html`${repeat(entries, ([f]) => f, sectionTemplate)}`;
    render(template, debugVariables);
  }

  collectGameVariables() {
    const ui = this.ui;
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
    vars["Game (game.js)"]["time_flux"] = game.time_flux;
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
    vars["UI State"]["ctrl9HoldTimer"] = ui.ctrl9HoldTimer ? "Active" : null;
    vars["UI State"]["ctrl9HoldStartTime"] = ui.ctrl9HoldStartTime;
    vars["UI State"]["ctrl9MoneyInterval"] = ui.ctrl9MoneyInterval ? "Active" : null;
    vars["UI State"]["ctrl9BaseAmount"] = ui.ctrl9BaseAmount;
    vars["UI State"]["ctrl9ExponentialRate"] = ui.ctrl9ExponentialRate;
    vars["UI State"]["ctrl9IntervalMs"] = ui.ctrl9IntervalMs;
    if (ui.ctrl9HoldStartTime) {
      const holdDuration = Date.now() - ui.ctrl9HoldStartTime;
      const secondsHeld = holdDuration / 1000;
      vars["UI State"]["ctrl9SecondsHeld"] = secondsHeld.toFixed(2);
      vars["UI State"]["ctrl9CurrentAmount"] = Math.floor(
        ui.ctrl9BaseAmount * Math.pow(ui.ctrl9ExponentialRate, secondsHeld)
      );
    }
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

  formatDebugValue(value) {
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
}

function resourceGte(a, b) {
  return a != null && typeof a.gte === "function" ? a.gte(b) : Number(a) >= b;
}

function resourceSub(a, b) {
  return a != null && typeof a.sub === "function" ? a.sub(b) : a - b;
}

function normalizeMoney(game, sellCredit) {
  let money = game.state.current_money;
  if (money != null && typeof money.add === "function") return sellCredit > 0 ? money.add(sellCredit) : money;
  return Number(money?.toNumber?.() ?? money ?? 0) + sellCredit;
}

function normalizeEp(game) {
  const ep = game.state.current_exotic_particles ?? 0;
  if (ep && typeof ep.toNumber === "function") return ep.toNumber();
  return Number(ep ?? 0);
}

function getNormalizedResources(game, sellCredit) {
  return { money: normalizeMoney(game, sellCredit), ep: normalizeEp(game) };
}

function getPartCost(part, cell) {
  const cost = part.cost != null && part.cost.gte ? part.cost.mul(cell.lvl || 1) : (part.cost ?? 0) * (cell.lvl || 1);
  const costNum = typeof cost === "number" ? cost : (cost?.toNumber?.() ?? Number(cost));
  return { cost, costNum };
}

function allocateIfAffordable(money, ep, part, cost, costNum, gte, sub) {
  if (part.erequires) {
    if (gte(ep, costNum)) return { newMoney: money, newEp: typeof ep === "number" ? ep - costNum : sub(ep, cost), allocated: true };
    return { newMoney: money, newEp: ep, allocated: false };
  }
  if (gte(money, costNum)) return { newMoney: typeof money === "number" ? money - costNum : sub(money, cost), newEp: ep, allocated: true };
  return { newMoney: money, newEp: ep, allocated: false };
}

function getCellCostNumber(part, cell) {
  if (typeof part.cost === "undefined" || part.cost == null) return 0;
  const amount = part.cost.gte ? part.cost.mul(cell.lvl || 1) : part.cost * (cell.lvl || 1);
  return amount != null && amount.gte != null ? amount.toNumber?.() ?? Number(amount) : Number(amount);
}

function addCellCostToBreakdown(out, part, num) {
  if (part.erequires) out.ep += num;
  else out.money += num;
}

export function calculateLayoutCostBreakdown(partset, layout) {
  const out = { money: 0, ep: 0 };
  if (!layout || !partset) return out;
  const cells = layout.flatMap((row) => row || []);
  cells
    .filter((cell) => cell?.id)
    .forEach((cell) => {
      const part = partset.parts.get(cell.id);
      if (part) addCellCostToBreakdown(out, part, getCellCostNumber(part, cell));
    });
  return out;
}

export function calculateLayoutCost(partset, layout) {
  if (!layout || !partset) return 0;
  return layout.flatMap((row) => row || []).filter((cell) => cell && cell.id).reduce((cost, cell) => {
    const part = partset.parts.get(cell.id);
    return cost + (part ? getCellCostNumber(part, cell) : 0);
  }, 0);
}

const PREVIEW_MAX_WIDTH = 160;
const PREVIEW_MAX_HEIGHT = 120;
const PREVIEW_MIN_TILE_SIZE = 2;
const GHOST_ALPHA = 0.35;

function getPreviewDimensions(rows, cols) {
  const tileSize = Math.max(PREVIEW_MIN_TILE_SIZE, Math.min(Math.floor(PREVIEW_MAX_WIDTH / cols), Math.floor(PREVIEW_MAX_HEIGHT / rows)));
  return { tileSize, w: cols * tileSize, h: rows * tileSize };
}

function drawPreviewTileBackground(ctx, x, y, tileSize) {
  ctx.fillStyle = "rgb(20 20 20)";
  ctx.strokeStyle = "rgb(40 40 40)";
  ctx.fillRect(x, y, tileSize, tileSize);
  ctx.strokeRect(x, y, tileSize, tileSize);
}

function drawPreviewTilePart(ctx, img, x, y, tileSize, ghost) {
  if (!img || !img.complete || !img.naturalWidth) return;
  if (ghost) ctx.globalAlpha = GHOST_ALPHA;
  ctx.drawImage(img, x, y, tileSize, tileSize);
  if (ghost) ctx.globalAlpha = 1;
}

function createImageLoader() {
  const imgCache = new Map();
  return (path) => {
    if (imgCache.has(path)) return imgCache.get(path);
    if (typeof Image !== "function" || typeof document === "undefined") {
      imgCache.set(path, null);
      return null;
    }
    try {
      const img = new Image();
      img.src = path;
      imgCache.set(path, img);
      return img;
    } catch (_) {
      imgCache.set(path, null);
      return null;
    }
  };
}

function drawPreviewCell(ctx, opts) {
  const { layout, r, c, partset, loadImg, tileSize, affordableSet } = opts;
  const x = c * tileSize;
  const y = r * tileSize;
  drawPreviewTileBackground(ctx, x, y, tileSize);
  const cell = layout[r]?.[c];
  if (!cell?.id) return;
  const part = partset.getPartById(cell.id);
  if (!part) return;
  const path = typeof part.getImagePath === "function" ? part.getImagePath() : null;
  if (!path) return;
  const key = `${r},${c}`;
  const ghost = affordableSet != null && !affordableSet.has(key);
  drawPreviewTilePart(ctx, loadImg(path), x, y, tileSize, ghost);
}

export function renderLayoutPreview(partset, layout, canvasEl, affordableSet) {
  if (!layout?.length || !canvasEl || !partset) return;
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  if (cols === 0) return;
  const { tileSize, w, h } = getPreviewDimensions(rows, cols);
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  const loadImg = createImageLoader();
  const indices = Array.from({ length: rows * cols }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols }));
  indices.forEach(({ r, c }) => drawPreviewCell(ctx, { layout, r, c, partset, loadImg, tileSize, affordableSet }));
}

export function buildPartSummary(partset, layout) {
  if (!partset || !layout) return [];
  const cells = layout.flatMap((row) => row || []).filter((cell) => cell && cell.id);
  const summary = cells.reduce((acc, cell) => {
    const key = `${cell.id}|${cell.lvl || 1}`;
    if (!acc[key]) {
      const part = partset.parts.get(cell.id);
      acc[key] = {
        id: cell.id,
        type: cell.t,
        lvl: cell.lvl || 1,
        title: part ? part.title : cell.id,
        unitPrice: part ? part.cost : 0,
        count: 0,
        total: 0,
      };
    }
    acc[key].count++;
    acc[key].total += acc[key].unitPrice;
    return acc;
  }, {});
  return Object.values(summary);
}

export function buildAffordableSet(affordableLayout) {
  if (!affordableLayout) return new Set();
  const keys = affordableLayout.flatMap((row, r) => (row || []).map((cell, c) => cell ? `${r},${c}` : null).filter(Boolean));
  return new Set(keys);
}

export function getCompactLayout(game) {
  if (!game.tileset || !game.tileset.tiles_list) return null;
  const rows = game.rows;
  const cols = game.cols;
  const parts = [];
  game.tileset.tiles_list.forEach((tile) => {
    if (tile.enabled && tile.part) {
      parts.push({
        r: tile.row,
        c: tile.col,
        t: tile.part.type,
        id: tile.part.id,
        lvl: tile.part.level || 1,
      });
    }
  });
  return { size: { rows, cols }, parts };
}

function countPlacedParts(game, type, level) {
  if (!game.tileset || !game.tileset.tiles_list) return 0;
  let count = 0;
  for (const tile of game.tileset.tiles_list) {
    const tilePart = tile.part;
    if (tilePart && tilePart.type === type && tilePart.level === level) {
      count++;
    }
  }
  return count;
}

export function serializeReactor(game) {
  const layout = getCompactLayout(game);
  if (!layout) return "";
  return JSON.stringify(layout, null, 2);
}

function buildEmptyLayout(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function populateLayoutFromParts(layout, parts, rows, cols) {
  parts.forEach((part) => {
    if (part.r >= 0 && part.r < rows && part.c >= 0 && part.c < cols) {
      layout[part.r][part.c] = { t: part.t, id: part.id, lvl: part.lvl };
    }
  });
}

function parseLayoutFromBlueprint(parsed) {
  const { rows, cols } = parsed.size;
  const layout = buildEmptyLayout(rows, cols);
  populateLayoutFromParts(layout, parsed.parts, rows, cols);
  return layout;
}

export function deserializeReactor(str) {
  try {
    const data = JSON.parse(str);
    const bpResult = BlueprintSchema.safeParse(data);
    if (bpResult.success) return parseLayoutFromBlueprint(bpResult.data);
    const legacyResult = LegacyGridSchema.safeParse(data);
    if (legacyResult.success) return legacyResult.data;
    return null;
  } catch {
    return null;
  }
}

const SELL_VALUE_MULTIPLIER = 0.5;

export function filterLayoutByCheckedTypes(layout, checkedTypes) {
  return layout.map(row => row.map(cell => (cell && checkedTypes[cell.id] !== false) ? cell : null));
}

export function clipToGrid(layout, rows, cols) {
  return layout.slice(0, rows).map(row => (row || []).slice(0, cols));
}

export function calculateCurrentSellValue(tileset) {
  if (!tileset?.tiles_list) return 0;
  let sellValue = 0;
  tileset.tiles_list.forEach(tile => {
    if (tile.enabled && tile.part) {
      sellValue += (tile.part.cost * (tile.part.level || 1)) * SELL_VALUE_MULTIPLIER;
    }
  });
  return Math.floor(sellValue);
}

export function buildAffordableLayout(filteredLayout, sellCredit, gameRows, gameCols, game) {
  if (!filteredLayout || !game?.partset) return null;
  let { money, ep } = getNormalizedResources(game, sellCredit);
  const rows = Math.min(gameRows, filteredLayout.length);
  const cols = Math.min(gameCols, filteredLayout[0]?.length ?? 0);
  const result = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  const cellsInOrder = filteredLayout.flatMap((row, r) =>
    (row || []).map((cell, c) => (cell && cell.id ? { r, c, cell } : null)).filter(Boolean)
  );
  cellsInOrder.forEach(({ r, c, cell }) => {
    const part = game.partset.getPartById(cell.id);
    if (!part) return;
    const { cost, costNum } = getPartCost(part, cell);
    const { newMoney, newEp, allocated } = allocateIfAffordable(money, ep, part, cost, costNum, resourceGte, resourceSub);
    money = newMoney;
    ep = newEp;
    if (allocated) result[r][c] = cell;
  });
  return result;
}

function calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum) {
  const netMoney = breakdown.money - sellCredit;
  const canAffordMoney = netMoney <= currentMoneyNum;
  const canAffordEp = breakdown.ep <= currentEpNum;
  const canPaste = (breakdown.money > 0 || breakdown.ep > 0) && canAffordMoney && canAffordEp;
  return { canAffordMoney, canAffordEp, canPaste };
}

export function buildPasteState(layout, checkedTypes, game, tileset, sellCheckboxChecked) {
  if (!layout) return { valid: false, invalidMessage: "Invalid layout data" };

  const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
  const breakdown = calculateLayoutCostBreakdown(game?.partset, filteredLayout);
  const sellCredit = sellCheckboxChecked ? calculateCurrentSellValue(tileset) : 0;

  const currentMoney = game.state.current_money;
  const currentEp = game.state.current_exotic_particles;
  const currentMoneyNum = typeof currentMoney?.toNumber === "function"
    ? currentMoney.toNumber()
    : Number(currentMoney ?? 0);
  const currentEpNum = typeof currentEp?.toNumber === "function"
    ? currentEp.toNumber()
    : Number(currentEp ?? 0);

  const finances = calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum);
  const affordableLayout = buildAffordableLayout(filteredLayout, sellCredit, game.rows, game.cols, game);
  const hasPartial = affordableLayout ? affordableLayout.some(row => row?.some(cell => cell != null)) : false;

  return {
    valid: true,
    filteredLayout,
    breakdown,
    ...finances,
    affordableLayout,
    currentMoneyNum,
    currentEpNum,
    hasPartial,
  };
}

export function validatePasteResources(breakdown, sellCredit, currentMoney, currentEp) {
  const netMoney = breakdown.money - sellCredit;
  if (breakdown.money <= 0 && breakdown.ep <= 0) return { valid: false, reason: "no_parts" };
  if (!resourceGte(currentMoney, netMoney) || !resourceGte(currentEp, breakdown.ep)) return { valid: false, reason: "insufficient_resources" };
  return { valid: true };
}

export function getCostBreakdown(layout, partset) {
  if (!layout || !partset) return { money: 0, ep: 0 };
  return layout.flatMap(row => row || []).filter(cell => cell?.id).reduce((out, cell) => {
    const part = partset.parts.get(cell.id);
    if (!part) return out;
    const n = (part.cost?.toNumber?.() ?? Number(part.cost ?? 0)) * (cell.lvl || 1);
    if (part.erequires) out.ep += n;
    else out.money += n;
    return out;
  }, { money: 0, ep: 0 });
}

function getLayoutCost(entryData, ui, fmtFn) {
  try {
    const parsed = typeof entryData === "string" ? JSON.parse(entryData) : entryData;
    const layout2D = ui.sandboxUI.compactTo2DLayout(parsed);
    if (!layout2D || !ui.game?.partset) return "-";
    const cost = layout2D.flatMap((row) => row || []).filter((cell) => cell?.id).reduce((sum, cell) => {
      const part = ui.game.partset.parts.get(cell.id);
      return sum + (part ? part.cost * (cell.lvl || 1) : 0);
    }, 0);
    return cost > 0 ? fmtFn(cost) : "-";
  } catch {
    return "-";
  }
}

const MODAL_HIDE_DELAY_MS = 1000;
const MODAL_COST_MARGIN_TOP_PX = 10;
const MODAL_SECTION_MARGIN_TOP_PX = 15;
const MODAL_BORDER_RADIUS_PX = 4;
const CONFIRM_BTN_BG = "#236090";
const MODAL_GAP_PX = 4;
const MODAL_PADDING_PX = 10;
const MODAL_INNER_GAP_PX = 8;
const JSON_INDENT_SPACES = 2;
const MODAL_BORDER_COLOR = "rgb(68 68 68)";
const MODAL_BG_DARK = "rgb(42 42 42)";
const COLOR_GOLD = "rgb(255 215 0)";
const COLOR_SUCCESS = "rgb(76 175 80)";
const COLOR_ERROR = "rgb(255 107 107)";
const COLOR_AFFORD = "#4caf50";
const COLOR_CANNOT_AFFORD = "#ff6b6b";
const OPACITY_VISIBLE = "1";
const OPACITY_HIDDEN = "0";
const Z_INDEX_VISIBLE = "1";
const HEIGHT_COLLAPSED = "0";

const pasteState = proxy({
  textareaData: "",
  checkedTypes: {},
  sellExisting: false,
});

function setModalTextareaVisibility(modalText, isPaste) {
  if (isPaste) {
    modalText.classList.remove("hidden");
    modalText.style.display = "block";
    modalText.style.visibility = "visible";
    modalText.style.opacity = OPACITY_VISIBLE;
    modalText.style.position = "relative";
    modalText.style.zIndex = Z_INDEX_VISIBLE;
  } else {
    modalText.classList.add("hidden");
    modalText.style.display = "none";
    modalText.style.visibility = "hidden";
    modalText.style.opacity = OPACITY_HIDDEN;
    modalText.style.height = HEIGHT_COLLAPSED;
    modalText.style.overflow = "hidden";
  }
}

function CostDisplay({ breakdown, affordability }) {
  const { money: costMoney, ep: costEp } = breakdown;
  if (costMoney <= 0 && costEp <= 0) {
    return html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_ERROR, fontWeight: "bold" })}>No parts found in layout</div>`;
  }
  const moneyColor = affordability.canAffordMoney ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const epColor = affordability.canAffordEp ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const containerStyle = styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, display: "flex", flexDirection: "column", gap: `${MODAL_GAP_PX}px` });
  return html`
    <div style=${containerStyle}>
      ${costMoney > 0 ? html`<span style=${styleMap({ color: moneyColor, fontWeight: "bold" })}>Money: $${fmt(costMoney)} needed (you have $${fmt(affordability.currentMoneyNum)})</span>` : ""}
      ${costEp > 0 ? html`<span style=${styleMap({ color: epColor, fontWeight: "bold" })}>EP: ${fmt(costEp)} needed (you have ${fmt(affordability.currentEpNum)})</span>` : ""}
    </div>
  `;
}

function SellOption({ currentSellValue, checked, onSellChange }) {
  const boxStyle = styleMap({
    padding: `${MODAL_PADDING_PX}px`,
    border: `1px solid ${MODAL_BORDER_COLOR}`,
    borderRadius: `${MODAL_BORDER_RADIUS_PX}px`,
    marginTop: `${MODAL_SECTION_MARGIN_TOP_PX}px`,
    backgroundColor: MODAL_BG_DARK,
  });
  const labelStyle = styleMap({ display: "flex", alignItems: "center", cursor: "pointer", gap: `${MODAL_INNER_GAP_PX}px` });
  return html`
    <div style=${boxStyle}>
      <label style=${labelStyle}>
        <input type="checkbox" id="sell_existing_checkbox" style=${styleMap({ margin: 0 })} ?checked=${checked} @change=${onSellChange}>
        <span style=${styleMap({ color: COLOR_GOLD })}>Sell existing grid for $${fmt(currentSellValue)}</span>
      </label>
    </div>
  `;
}

function renderModalCostContent(modalCost, cost, summary, ui, options, onSlotClick) {
  const componentTemplate = summary.length ? renderComponentIcons(summary, options, onSlotClick) : html``;
  const costTemplate = cost > 0 ? html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" })}>Total Cost: $${fmt(cost)}</div>` : html``;
  render(html`${componentTemplate}${costTemplate}`, modalCost);
}

function showModal(ui, refs, opts) {
  const { modal, modalTitle, modalText, modalCost, confirmBtn } = refs;
  const { title, data, cost, action, canPaste = false, summary = [], ...options } = opts;
  const confirmLabel = action === "copy" ? "Copy" : "Paste";
  ui._copyPasteModalReactiveUnmount?.();
  ui.uiState.copy_paste_modal_display = { title, confirmLabel };
  const titleUnmount = ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["copy_paste_modal_display"] }],
    () => html`${ui.uiState?.copy_paste_modal_display?.title ?? ""}`,
    modalTitle
  );
  const btnUnmount = ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["copy_paste_modal_display"] }],
    () => html`${ui.uiState?.copy_paste_modal_display?.confirmLabel ?? ""}`,
    confirmBtn
  );
  ui._copyPasteModalReactiveUnmount = () => { titleUnmount(); btnUnmount(); };
  modalText.value = data;
  setModalTextareaVisibility(modalText, action === "paste");
  const wasPaused = ui.stateManager.getVar("pause");
  ui.stateManager.setVar("pause", true);
  renderModalCostContent(modalCost, cost, summary, ui, options);
  if (action === "copy") {
    modalText.readOnly = true;
    modalText.placeholder = "Reactor layout data (read-only)";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = false;
  } else if (action === "paste") {
    modalText.readOnly = false;
    modalText.placeholder = (data && data.trim()) ? "Paste reactor layout data here..." : "Enter reactor layout JSON data manually...";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = !canPaste;
  }
  modal.classList.remove("hidden");
  const previewWrap = document.getElementById("reactor_copy_paste_preview_wrap");
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
  if (previewWrap) previewWrap.classList.toggle("hidden", action !== "paste");
  if (partialBtn) partialBtn.classList.toggle("hidden", action !== "paste");
  modal.dataset.previousPauseState = wasPaused;
  const handleOutsideClick = (e) => {
    if (e.target === modal) {
      ui.modalOrchestrationUI.hideModal();
      modal.removeEventListener('click', handleOutsideClick);
    }
  };
  modal.addEventListener('click', handleOutsideClick);
}

export function setupCopyAction(ui, bp, refs) {
  const { copyBtn, modalCost, confirmBtn } = refs;

  copyBtn.onclick = () => {
    const data = bp().serialize();
    const layout = bp().deserialize(data);
    const cost = bp().getTotalCost(layout);
    const summary = bp().getPartSummary(layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    showModal(ui, refs, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });

    const updateCopySummary = (layout, summary, checkedTypes) => {
      const onSlotClick = (ids, checked) => {
        ids.forEach(id => { checkedTypes[id] = !checked; });
        updateCopySummary(layout, summary, checkedTypes);
      };
      const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
      const filteredLayout = bp().filterByTypes(layout, checkedTypes);
      const filteredCost = bp().getTotalCost(filteredLayout);
      const costTemplate = html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" })}>Selected Parts Cost: $${fmt(filteredCost)}</div>`;
      render(html`${componentTemplate}${costTemplate}`, modalCost);
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("hidden");
    };

    updateCopySummary(layout, summary, checkedTypes);

    confirmBtn.onclick = async () => {
      if (!ui.game) return;
      const filteredLayout = bp().filterByTypes(layout, checkedTypes);
      const rows = ui.game.rows;
      const cols = ui.game.cols;
      const parts = filteredLayout.flatMap((row, r) => (row || []).map((cell, c) => (cell && cell.id) ? { r, c, t: cell.t, id: cell.id, lvl: cell.lvl || 1 } : null).filter(Boolean));
      const compactLayout = { size: { rows, cols }, parts };
      const filteredData = JSON.stringify(compactLayout, null, JSON_INDENT_SPACES);
      const result = await ui.clipboardUI.writeToClipboard(filteredData);
      const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
      if (result.success) {
        ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, filteredData);
        ui.uiState.copy_paste_modal_display = { ...ui.uiState.copy_paste_modal_display, confirmLabel: "Copied!" };
      } else {
        ui.uiState.copy_paste_modal_display = { ...ui.uiState.copy_paste_modal_display, confirmLabel: "Failed to Copy" };
      }
      setTimeout(() => ui.modalOrchestrationUI.hideModal(), MODAL_HIDE_DELAY_MS);
    };

    confirmBtn.disabled = false;
    confirmBtn.classList.remove("hidden");
    confirmBtn.style.backgroundColor = CONFIRM_BTN_BG;
    confirmBtn.style.cursor = "pointer";
  };
}

function clearExistingPartsForSell(ui) {
  ui.game.tileset.tiles_list.forEach(tile => {
    if (tile.enabled && tile.part) tile.sellPart();
  });
  ui.game.reactor.updateStats();
}

function handleConfirmPaste(ui, bp) {
  const layoutToPaste = bp().deserialize(pasteState.textareaData);
  if (!layoutToPaste) {
    logger.log('warn', 'ui', 'Please paste reactor layout data into the text area.');
    return;
  }
  const filtered = bp().filterByTypes(layoutToPaste, pasteState.checkedTypes);
  const breakdown = bp().getCostBreakdown(filtered);
  const sellCredit = pasteState.sellExisting ? bp().getCurrentSellValue() : 0;
  const validation = bp().validateResources(breakdown, sellCredit);

  if (!validation.valid) {
    logger.log('warn', 'ui', validation.reason === "no_parts" ? "Invalid layout: no parts found." : "Not enough resources for full layout.");
    return;
  }
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  ui.copyPaste.pasteReactorLayout(bp().clipToGrid(filtered));
  ui.modalOrchestrationUI.hideModal();
}

function handlePartialPaste(ui, bp) {
  const layoutToPaste = bp().deserialize(pasteState.textareaData);
  if (!layoutToPaste) return;
  const filtered = bp().filterByTypes(layoutToPaste, pasteState.checkedTypes);
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  const affordable = bp().buildAffordableLayout(filtered, 0);
  if (affordable) ui.copyPaste.pasteReactorLayout(affordable);
  ui.modalOrchestrationUI.hideModal();
}

function renderPasteModalContent(ui, bp, refs) {
  const parsed = bp().deserialize(pasteState.textareaData);
  if (!parsed) {
    const msg = !pasteState.textareaData ? "Enter reactor layout JSON data in the text area above" : "Invalid layout data - please check the JSON format";
    render(html`${msg}`, refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const originalSummary = bp().getPartSummary(parsed);
  originalSummary.forEach(item => {
    if (pasteState.checkedTypes[item.id] === undefined) {
      pasteState.checkedTypes[item.id] = true;
    }
  });

  const validationState = bp().buildPasteState(parsed, pasteState.checkedTypes, pasteState.sellExisting);
  if (!validationState.valid) {
    render(html`${validationState.invalidMessage}`, refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const onSlotClick = (ids, checked) => ids.forEach(id => { pasteState.checkedTypes[id] = !checked; });
  const onSellChange = (e) => { pasteState.sellExisting = e.target.checked; };

  const componentTemplate = renderComponentIcons(originalSummary, { showCheckboxes: true, checkedTypes: pasteState.checkedTypes }, onSlotClick);
  const hasSellOption = refs.modal.dataset.hasSellOption === "true";
  const totalSellValue = Number(refs.modal.dataset.sellValue || 0);

  const sellOptionTemplate = hasSellOption
    ? SellOption({ currentSellValue: totalSellValue, checked: pasteState.sellExisting, onSellChange })
    : html``;

  const costTemplate = CostDisplay({
    breakdown: validationState.breakdown,
    affordability: {
      canAffordMoney: validationState.canAffordMoney,
      canAffordEp: validationState.canAffordEp,
      currentMoneyNum: validationState.currentMoneyNum,
      currentEpNum: validationState.currentEpNum,
    },
  });

  render(html`${componentTemplate}${sellOptionTemplate}${costTemplate}`, refs.modalCost);

  refs.confirmBtn.disabled = !validationState.canPaste;
  const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
  if (partialBtnRef) {
    partialBtnRef.disabled = !validationState.hasPartial;
  }

  const previewCanvas = document.getElementById("reactor_copy_paste_preview");
  if (previewCanvas) {
    const affordableSet = bp().getAffordableSet(validationState.affordableLayout);
    bp().renderPreview(parsed, previewCanvas, affordableSet);
  }
}

export function setupPasteAction(ui, bp, refs) {
  const { pasteBtn, modal, modalText, confirmBtn } = refs;
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");

  if (!modal._hasValtioSub) {
    modal._hasValtioSub = true;
    subscribe(pasteState, () => renderPasteModalContent(ui, bp, refs));
  }

  modalText.oninput = (e) => {
    pasteState.textareaData = e.target.value.trim();
    pasteState.checkedTypes = {};
  };

  confirmBtn.onclick = () => handleConfirmPaste(ui, bp);
  if (partialBtn) partialBtn.onclick = () => handlePartialPaste(ui, bp);

  ui._showPasteModalWithData = (data) => {
    pasteState.textareaData = data;
    pasteState.checkedTypes = {};
    pasteState.sellExisting = false;

    const layout = bp().deserialize(data);
    const summary = bp().getPartSummary(layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = bp().getCurrentSellValue();
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

    modal.dataset.hasSellOption = String(hasExistingParts);
    modal.dataset.sellValue = String(currentSellValue);

    showModal(ui, refs, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    renderPasteModalContent(ui, bp, refs);
  };

  pasteBtn.onclick = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    ui._showPasteModalWithData(result.success ? result.data : "");
  };
}

function layoutsListTemplate(ui, list, fmtFn, onAfterDelete) {
  if (list.length === 0) {
    return html`<p style="color: rgb(180 180 180); margin: 0;">No saved layouts. Copy a reactor layout to add it here.</p>`;
  }
  return html`
    <table id="my_layouts_list_table">
      <thead><tr><th>Name</th><th>Cost</th><th></th></tr></thead>
      <tbody>
        ${repeat(
          list,
          (e) => e.id,
          (entry) => {
            const costStr = getLayoutCost(entry.data, ui, fmtFn);
            return html`
              <tr data-id=${entry.id}>
                <td>${entry.name}</td>
                <td>${costStr}</td>
                <td class="my-layout-actions">
                  <button class="pixel-btn my-layout-view-btn" type="button" @click=${() => ui.modalOrchestrator.showModal(MODAL_IDS.LAYOUT_VIEW, { layoutJson: entry.data, stats: {} })}>View</button>
                  <button class="pixel-btn my-layout-load-btn" type="button" @click=${() => {
                    ui.modalOrchestrator.hideModal(MODAL_IDS.MY_LAYOUTS);
                    ui._showPasteModalWithData(entry.data);
                  }}>Load</button>
                  <button class="pixel-btn my-layout-delete-btn" type="button" @click=${() => {
                    ui.layoutStorageUI.removeFromMyLayouts(entry.id);
                    if (typeof onAfterDelete === "function") onAfterDelete();
                  }}>Delete</button>
                </td>
              </tr>
            `;
          }
        )}
      </tbody>
    </table>
  `;
}

export function myLayoutsTemplate(ui, list, fmtFn, onClose) {
  const onSaveFromClipboard = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    const data = result.success ? result.data : "";
    const bpService = new BlueprintService(ui.game);
    const layout = bpService.deserialize(data);
    if (!layout) return;

    const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
    ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, data);
    ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS);
  };

  return html`
    <div
      id="my_layouts_modal"
      class="modal-overlay"
      style="position: fixed; z-index: 1000; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: rgb(0 0 0 / 80%);"
      @click=${(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="modal-content" style="position: relative; max-width: 90%; max-height: 90%; padding: 0; border: 2px solid rgb(51, 51, 51); border-radius: 8px; background-color: rgb(26, 26, 26); overflow-y: auto;">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-radius: 8px 8px 0 0; border-bottom: 1px solid rgb(51, 51, 51); background: rgb(34, 34, 34);">
          <h3 style="margin: 0; color: rgb(74, 158, 255); font-size: 18px;">My Layouts</h3>
          <button id="my_layouts_close_btn" title="Close" aria-label="Close" style="background:transparent; border:none; color:white; font-size:1.2rem; cursor:pointer;" @click=${onClose}>×</button>
        </div>
        <div class="my-layouts-toolbar" style="display: flex; padding: 12px 20px; border-bottom: 1px solid rgb(51, 51, 51); background: rgb(34, 34, 34);">
          <button id="my_layouts_save_from_clipboard_btn" class="pixel-btn" type="button" @click=${onSaveFromClipboard}>Save from Clipboard</button>
        </div>
        <div id="my_layouts_list" style="padding: 20px;">
          ${layoutsListTemplate(ui, list, fmtFn, () => ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS))}
        </div>
      </div>
    </div>
  `;
}