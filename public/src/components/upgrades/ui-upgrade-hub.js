import { safeCall, teardownAll } from "../../core/teardown.js";
import { html, render } from "lit-html";
import { numFormat as fmt } from "../../core/numbers.js";
import { bindLitRenderMulti } from "../../dom/lit-reactive.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { runCheckAffordability, setUpgradeCardRefreshHandler } from "../../bridge/bridge-upgrades.js";
import { isCellUpgradeVisible } from "../../domain/upgrade.js";
import { calculateSectionCounts, findTopAffordableInSection } from "../../domain/upgrade-sections.js";
import { UpgradeCard } from "./button-factory.js";
import { purchaseUpgradeWithFeedback } from "./presentation.js";
import { getUiElement } from "../shell/page-dom.js";
import { sectionHubMetaTemplate } from "../../templates/uiComponentsTemplates.js";
import { firstByClass } from "../../dom/class-flags.js";
const EXPAND_UPGRADE_IDS = ["expand_reactor_rows", "expand_reactor_cols"];

function forEachSectionH2(wrapper, fn) {
  if (!wrapper) return;
  const h2s = wrapper.getElementsByTagName("h2");
  for (let i = 0; i < h2s.length; i++) {
    if (h2s[i].hasAttribute("data-section-name")) fn(h2s[i]);
  }
}

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

function buildUpgradeCardTemplate(upgradeset, upgrade, doctrineSource, selectedUpgradeId) {
  const onBuyClick = (e) => {
    e.stopPropagation();
    purchaseUpgradeWithFeedback(upgradeset, upgrade.id);
  };
  const onSelectClick = (e) => {
    if (e.target.closest(".upgrade-action-btn")) return;
    const ui = upgradeset.game?.ui;
    if (!ui?.uiState?.interaction) return;
    const current = ui.uiState.interaction.selectedUpgradeId;
    ui.uiState.interaction.selectedUpgradeId = current === upgrade.id ? null : upgrade.id;
  };
  const selected = selectedUpgradeId === upgrade.id;
  return UpgradeCard(upgrade, doctrineSource, onBuyClick, { selected, onSelectClick });
}

function renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, container, selectedUpgradeId) {
  const cards = upgrades.map((upgrade) => buildUpgradeCardTemplate(upgradeset, upgrade, doctrineSource, selectedUpgradeId));
  try {
    render(html`${cards}`, container);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (msg.includes("nextSibling") || msg.includes("parentNode")) return;
    throw err;
  }
}

function groupUpgradesByContainer(filtered) {
  const byContainer = new Map();
  filtered.forEach((upgrade) => {
    const cid = getUpgradeContainerId(upgrade);
    if (!byContainer.has(cid)) byContainer.set(cid, []);
    byContainer.get(cid).push(upgrade);
  });
  return byContainer;
}

function renderGroupedUpgradeCards(upgradeset, byContainer) {
  const selectedUpgradeId = upgradeset.game?.ui?.uiState?.interaction?.selectedUpgradeId ?? null;
  const doctrineSource = (id) => upgradeset.game?.upgradeset?.getDoctrineForUpgrade(id);
  byContainer.forEach((upgrades, containerId) => {
    const container = getUiElement(null, containerId);
    if (!container?.isConnected) return;
    renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, container, selectedUpgradeId);
  });
  clearEmptyUpgradeContainers(byContainer);
}

function refreshUpgradeCards(upgradeset) {
  if (typeof document === "undefined" || !upgradeset) return;
  syncSelectedUpgradeVisibility(upgradeset);
  const filtered = filterVisibleUpgrades(upgradeset.upgradesArray, upgradeset);
  renderGroupedUpgradeCards(upgradeset, groupUpgradesByContainer(filtered));
}

function clearEmptyUpgradeContainers(byContainer) {
  const containerIds = [
    "cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades", "vent_upgrades", "exchanger_upgrades", "other_upgrades",
    "experimental_laboratory", "experimental_boost", "experimental_parts", "experimental_cells", "experimental_cells_boost", "experimental_particle_accelerators",
  ];
  containerIds.forEach((containerId) => {
    if (byContainer.has(containerId)) return;
    const container = getUiElement(null, containerId);
    if (!container?.isConnected) return;
    safeCall(() => { render(html``, container); });
  });
}

setUpgradeCardRefreshHandler(refreshUpgradeCards);

export function runPopulateUpgradeSection(upgradeset, wrapperId, filterFn) {
  if (typeof document === "undefined") return;
  const wrapper = getUiElement(null, wrapperId);
  if (!wrapper?.isConnected) return;

  syncSelectedUpgradeVisibility(upgradeset);
  const filtered = filterVisibleUpgrades(
    upgradeset.upgradesArray
      .filter(filterFn)
      .filter((u) => !EXPAND_UPGRADE_IDS.includes(u.upgrade?.id)),
    upgradeset
  );

  const byContainer = groupUpgradesByContainer(filtered);
  renderGroupedUpgradeCards(upgradeset, byContainer);

  const game = upgradeset.game;
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
  updateResearchEpHint(ui);
}

const RESEARCH_HUB_COLLAPSE_KEYS = [
  "Laboratory",
  "Global Boosts",
  "Experimental Parts & Cells",
  "Particle Accelerators",
];

function updateResearchEpHint(ui) {
  const hint = getUiElement(ui, "research_ep_hint");
  if (!hint) return;
  const map = ui?.uiState?.hub_collapsed || {};
  const allCollapsed = RESEARCH_HUB_COLLAPSE_KEYS.every((key) => !!map[key]);
  const base = hint.className.replace(/\bhidden\b/g, "").replace(/\s+/g, " ").trim();
  hint.className = allCollapsed ? base : (base ? `${base} hidden` : "hidden");
}

function updateHubSectionPreviews(ui, game) {
  const wrappers = ["upgrades_content_wrapper", "experimental_upgrades_content_wrapper"];
  wrappers.forEach((wrapperId) => {
    const wrapper = getUiElement(ui, wrapperId);
    if (!wrapper) return;
    forEachSectionH2(wrapper, (h2) => {
      const sectionName = h2.getAttribute("data-section-name");
      if (!sectionName) return;
      const article = h2.closest(".upgrade-hub-collapsible");
      if (!article) return;
      let preview = firstByClass(article, "section-hub-preview");
      if (!preview) {
        preview = document.createElement("p");
        preview.className = "section-hub-preview";
        const headerBlock = firstByClass(article, "upgrade-section-header-block");
        if (headerBlock) headerBlock.appendChild(preview);
        else {
          const metaHost = firstByClass(article, "section-hub-meta-host");
          if (metaHost) metaHost.insertAdjacentElement("afterend", preview);
          else h2.insertAdjacentElement("afterend", preview);
        }
      }
      const top = findTopAffordableInSection(game.upgradeset, sectionName);
      if (!top) {
        preview.textContent = "";
        const base = preview.className.replace(/\bhidden\b/g, "").replace(/\s+/g, " ").trim();
        preview.className = base ? `${base} hidden` : "hidden";
        return;
      }
      const isEp = top.base_ecost?.gt?.(0);
      const cost = isEp ? `${fmt(top.ecost)} EP` : `$${fmt(top.cost)}`;
      preview.textContent = `${top.title} · ${cost}`;
      preview.className = preview.className.replace(/\bhidden\b/g, "").replace(/\s+/g, " ").trim();
    });
  });
}

function mountSectionCountsForWrapper(ui, wrapperId) {
  if (typeof document === "undefined") return [];
  const wrapper = getUiElement(ui, wrapperId);
  if (!wrapper?.isConnected) return [];
  const unmounts = [];
  forEachSectionH2(wrapper, (h2) => {
    const sectionName = h2.getAttribute("data-section-name");
    if (!sectionName) return;
    const headerBlock = h2.closest(".upgrade-section-header-block");
    let metaHost = firstByClass(headerBlock, "section-hub-meta-host");
    if (!metaHost) {
      metaHost = document.createElement("div");
      metaHost.className = "section-hub-meta-host";
      const row = firstByClass(headerBlock, "upgrade-section-header-row");
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
  return () => teardownAll(unmounts);
}

export function ensureUpgradeSelectionRefresh(ui) {
  if (!ui || ui._upgradeDetailSelectionRefreshMounted) return;
  if (!ui.uiState?.interaction || !ui.game?.upgradeset) return;
  ui._upgradeDetailSelectionRefreshMounted = true;
  const unsubs = [];
  unsubs.push(subscribeKey(ui.uiState.interaction, "selectedUpgradeId", () => {
    refreshUpgradeCards(ui.game.upgradeset);
  }));
  if (!ui._unmounts) ui._unmounts = [];
  ui._unmounts.push(() => {
    teardownAll(unsubs);
  });
}

export function getUpgradeSectionContainer(ui, locationKey) {
  return getUiElement(ui, locationKey);
}

export function appendUpgradeToSection(ui, locationKey, upgradeEl) {
  const container = getUpgradeSectionContainer(ui, locationKey);
  if (container && upgradeEl) {
    container.appendChild(upgradeEl);
  }
}
