import { html, render } from "lit-html";
import { logger } from "../../core/logger.js";
import { safeCall } from "../../core/teardown.js";
import {
  dedupeReactorStatsDom,
  getPageReactor,
  getPageReactorWrapper,
  getPageReactorBackground,
} from "./page-dom.js";
import { mountReactorGridLayoutBinding } from "../grid/ui-grid.js";
import { bindLitRenderMulti } from "../../dom/lit-reactive.js";
import { classMap } from "../../dom/lit.js";
import { pwaState } from "../../store.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";

function ensureUnmounts(ui) {
  if (!ui._unmounts) ui._unmounts = [];
  return ui._unmounts;
}

function trackAbortController(ui, controller) {
  ensureUnmounts(ui).push(() => {
    safeCall(() => { controller.abort(); });
  });
  return controller.signal;
}

export function clearPageReactor(ui) {
  const reactor = getPageReactor(ui);
  if (reactor) reactor.innerHTML = "";
}

export function setPageGridContainer(ui, container) {
  if (ui.gridCanvasRenderer) ui.gridCanvasRenderer.setContainer(container);
}

function hubKeyForArticle(article) {
  return article?.dataset?.hubKey
    || article?.querySelector("h2[data-section-name]")?.getAttribute("data-section-name")
    || article?.id
    || null;
}

function findHubArticle(key) {
  return [...document.querySelectorAll("[data-hub-key]")].find((el) => el.dataset.hubKey === key) ?? null;
}

function hubArticleClassMap(key, collapsed) {
  const isResearch = key === "reboot_section" || key === "doctrine_tree_viewer";
  const isDoctrine = key === "doctrine_tree_viewer";
  return {
    "upgrade-section-hub": !isResearch,
    "upgrade-hub-collapsible": !isResearch,
    "research-collapsible": isResearch,
    "doctrine-tree-viewer": isDoctrine,
    "section-collapsed": collapsed,
    hidden: isDoctrine,
  };
}

function projectHubCollapsedFromMarkers(ui, host) {
  host.querySelectorAll("[data-hub-proj]").forEach((marker) => {
    const key = marker.getAttribute("data-hub-proj");
    const article = findHubArticle(key);
    if (!article) return;
    article.setAttribute("class", marker.getAttribute("class") || "");
    article.dataset.hubKey = key;
    if (key === "reboot_section" || key === "doctrine_tree_viewer") article.id = key;
    const header = article.querySelector(".upgrade-section-header, .research-section-header");
    header?.setAttribute("aria-expanded", String(!ui.uiState.hub_collapsed[key]));
  });
}

function hubCollapsedTemplate(ui) {
  const map = ui.uiState.hub_collapsed || {};
  return html`${Object.keys(map).map((key) => html`<i data-hub-proj=${key} class=${classMap(hubArticleClassMap(key, !!map[key]))}></i>`)}`;
}

function mountHubCollapsedProjection(ui) {
  if (ui._hubCollapsedProjectionMounted || !ui?.uiState) return;
  let host = document.getElementById("hub_collapsed_lit_host");
  if (!host) {
    host = document.createElement("div");
    host.id = "hub_collapsed_lit_host";
    host.hidden = true;
    document.body.appendChild(host);
  }
  ui._hubCollapsedProjectionMounted = true;
  ui._hubCollapsedLitHost = host;
  const unmount = bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["hub_collapsed"] }],
    () => hubCollapsedTemplate(ui),
    host,
    () => projectHubCollapsedFromMarkers(ui, host)
  );
  if (typeof unmount === "function") ensureUnmounts(ui).push(unmount);
}

function setHubCollapsed(ui, key, collapsed, { accordionWrapper = null } = {}) {
  if (!ui?.uiState || !key) return;
  const next = { ...ui.uiState.hub_collapsed, [key]: collapsed };
  if (!collapsed && accordionWrapper) {
    accordionWrapper.querySelectorAll("[data-hub-key]").forEach((other) => {
      const otherKey = hubKeyForArticle(other);
      if (otherKey && otherKey !== key) next[otherKey] = true;
    });
  }
  ui.uiState.hub_collapsed = next;
  const host = ui._hubCollapsedLitHost || document.getElementById("hub_collapsed_lit_host");
  if (host) {
    render(hubCollapsedTemplate(ui), host);
    projectHubCollapsedFromMarkers(ui, host);
  }
}

export function setupUpgradeHubCollapsibleSections(ui) {
  if (ui._upgradeHubCollapsibleSetup) return;
  ui._upgradeHubCollapsibleSetup = true;
  mountHubCollapsedProjection(ui);
  const ac = new AbortController();
  const { signal } = ac;
  trackAbortController(ui, ac);
  const bind = (sectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.addEventListener("click", (e) => {
      const header = e.target.closest(".upgrade-section-header");
      if (!header) return;
      const article = header.closest(".upgrade-hub-collapsible");
      if (!article) return;
      e.preventDefault();
      const key = hubKeyForArticle(article);
      const collapsed = !(ui.uiState.hub_collapsed[key]);
      setHubCollapsed(ui, key, collapsed, { accordionWrapper: article.closest("[data-hub-accordion]") });
    }, { signal });
    section.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const header = e.target.closest(".upgrade-section-header");
      if (!header) return;
      e.preventDefault();
      header.click();
    }, { signal });
  };
  bind("upgrades_section");
  bind("experimental_upgrades_section");
}

export function setupAboutScrollHint(ui) {
  const section = document.getElementById("about_section");
  const hint = document.getElementById("about_scroll_hint");
  if (!section || !hint) return;
  const hide = () => hint.classList.add("hidden");
  const scrollTargets = [section, document.getElementById("page_content_area")].filter(Boolean);
  const ac = new AbortController();
  const { signal } = ac;
  if (ui) trackAbortController(ui, ac);
  scrollTargets.forEach((target) => {
    target.addEventListener("scroll", hide, { once: true, passive: true, signal });
  });
  requestAnimationFrame(() => {
    const scrollHost = scrollTargets.find((el) => el.scrollHeight > el.clientHeight + 12) ?? section;
    if (scrollHost.scrollHeight <= scrollHost.clientHeight + 12) hide();
  });
}

function autoExpandAffordableHubSections(ui, wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  const counts = ui?.uiState?.section_counts;
  if (!wrapper || !counts || !ui.uiState) return;
  const next = { ...ui.uiState.hub_collapsed };
  let changed = false;
  wrapper.querySelectorAll(".upgrade-hub-collapsible[data-hub-key] h2[data-section-name]").forEach((header) => {
    const sectionName = header.getAttribute("data-section-name");
    const key = hubKeyForArticle(header.closest(".upgrade-hub-collapsible"));
    if (!key) return;
    if ((counts[sectionName]?.affordable ?? 0) > 0 && next[key]) {
      next[key] = false;
      changed = true;
    }
  });
  if (changed) ui.uiState.hub_collapsed = next;
}

export function setupResearchCollapsibleSections(ui) {
  const section = document.getElementById("experimental_upgrades_section");
  if (!section) return;
  mountHubCollapsedProjection(ui);
  if (ui._researchCollapsibleSetup) return;
  ui._researchCollapsibleSetup = true;
  const ac = new AbortController();
  const { signal } = ac;
  trackAbortController(ui, ac);
  section.addEventListener("click", (e) => {
    const header = e.target.closest(".research-section-header");
    if (!header) return;
    const article = header.closest(".research-collapsible");
    if (!article) return;
    e.preventDefault();
    const key = hubKeyForArticle(article);
    setHubCollapsed(ui, key, !(ui.uiState.hub_collapsed[key]));
  }, { signal });
  section.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const header = e.target.closest(".research-section-header");
    if (!header) return;
    e.preventDefault();
    header.click();
  }, { signal });
  const coverWrap = document.querySelector(".refund-safety-cover-wrap");
  const coverBtn = document.getElementById("refund_safety_cover");
  if (coverBtn && coverWrap) {
    coverBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      coverWrap.classList.toggle("cover-open");
    }, { signal });
  }
  const rebootBtn = document.getElementById("reboot_btn");
  const refundBtn = document.getElementById("refund_btn");
  const orchestrator = ui.modalOrchestrator;
  if (rebootBtn) {
    rebootBtn.addEventListener("click", (e) => {
      if (!coverWrap?.classList.contains("cover-open")) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        orchestrator?.showModal?.(MODAL_IDS.PRESTIGE, { mode: "refund" });
      }
    }, { signal });
  }
  if (refundBtn) {
    refundBtn.addEventListener("click", () => {
      orchestrator?.showModal?.(MODAL_IDS.PRESTIGE, { mode: "prestige" });
    }, { signal });
  }
}

export function setupVersionDisplayForPage(ui) {
  if (!ui?.uiState || ui._versionDisplayMounted) return;
  const aboutEl = document.getElementById("about_version");
  const appEl = document.getElementById("app_version");
  const unmounts = ensureUnmounts(ui);
  const renderVersion = (el) => {
    if (!el?.isConnected) return;
    const unmount = bindLitRenderMulti(
      [{ state: ui.uiState, keys: ["version_display"] }],
      () => html`${ui.uiState?.version_display?.app ?? ui.uiState?.version_display?.about ?? ""}`,
      el
    );
    if (typeof unmount === "function") unmounts.push(unmount);
  };
  if (aboutEl) renderVersion(aboutEl);
  if (appEl && appEl !== aboutEl) renderVersion(appEl);
  const aboutBtn = document.getElementById("about_version_btn");
  if (aboutBtn && !aboutBtn.dataset.changelogBound) {
    aboutBtn.dataset.changelogBound = "1";
    const ac = new AbortController();
    const { signal } = ac;
    trackAbortController(ui, ac);
    aboutBtn.addEventListener("click", () => {
      pwaState.versionCheckRequested = true;
    }, { signal });
  }
  ui._versionDisplayMounted = true;
}

export async function loadAndSetVersionForPage(ui) {
  try {
    const { getResourceUrl } = await import("../../dom/lit.js");
    const response = await fetch(getResourceUrl("version.json"));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new Error("HTML response received (likely 404 fallback)");
      }
      throw new Error(`Expected JSON but got ${contentType || "unknown content type"}`);
    }

    const versionData = await response.json();
    const version = versionData.version || "Unknown";
    ui._cachedVersion = version;

    if (ui?.uiState) {
      ui.uiState.version_display = { ...ui.uiState.version_display, app: version, about: version };
    }
  } catch (error) {
    if (!error.message || !error.message.includes("Expected JSON")) {
      logger.log("warn", "ui", "Could not load version info:", error.message || error);
    }
    if (ui?.uiState) {
      ui.uiState.version_display = { ...ui.uiState.version_display, app: "Unknown", about: "Unknown" };
    }
  }
}

export function initializePage(ui, pageId) {
  const game = ui.game;
  dedupeReactorStatsDom();

  if (pageId === "reactor_section") {
    const pauseCfg = ui.var_objs_config?.pause;
    const paused = !!ui.game?.state?.pause;
    if (pauseCfg?.onupdate) pauseCfg.onupdate(paused);
  }

  switch (pageId) {
    case "reactor_section": {
      mountReactorGridLayoutBinding(ui);
      if (!ui._reactorResetBtnMounted) {
        const resetBtn = document.getElementById("reset_reactor_btn");
        if (resetBtn) {
          ui._reactorResetBtnMounted = true;
          const ac = new AbortController();
          const { signal } = ac;
          trackAbortController(ui, ac);
          resetBtn.addEventListener("click", () => { void ui.resetReactor?.(); }, { signal });
        }
      }
      const reactor = getPageReactor(ui);
      logger.log("debug", "ui", "[PageInit] reactor_section init start", {
        hasGridScaler: !!ui.gridScaler,
        hasWrapper: !!ui.gridScaler?.wrapper,
        hasReactor: !!reactor,
        hasGridRenderer: !!ui.gridCanvasRenderer,
        hasGame: !!ui.game,
        hasTileset: !!ui.game?.tileset,
      });
      if (ui.gridScaler && !ui.gridScaler.wrapper) {
        ui.gridScaler.init();
      }
      if (reactor) {
        clearPageReactor(ui);
        if (ui.gridCanvasRenderer) {
          ui.gridCanvasRenderer.init(reactor);
        }
      }

      ui.inputHandler.setupReactorEventListeners();
      ui.inputHandler.setupSegmentHighlight();
      ui.gridScaler.resize();
      const container = getPageReactorWrapper(ui) || getPageReactorBackground(ui);
      setPageGridContainer(ui, container);
      if (ui.game?.tileset) {
        ui.game.tileset.updateActiveTiles();
      }
      if (ui.gridCanvasRenderer && ui.game) {
        ui.gridCanvasRenderer.render(ui.game);
      }
      logger.log("debug", "ui", "[PageInit] reactor_section init done");
      ui.initializeCopyPasteUI();
      ui.pageSetupUI.setupMobileTopBar();
      ui.pageSetupUI.setupMobileTopBarResizeListener();
      break;
    }
    case "upgrades_section":
      setupUpgradeHubCollapsibleSections(ui);
      ui.pageSetupUI.setupAffordabilityBanners("upgrades_no_affordable_banner");
      if (!ui._sectionCountsMountedUpgrades && document.getElementById("upgrades_content_wrapper")) {
        ui._unmounts.push(ui.mountSectionCountsReactive("upgrades_content_wrapper"));
        ui._sectionCountsMountedUpgrades = true;
      }
      ui.ensureUpgradeDetailPanelMounted("upgrades_detail_panel");
      if (game?.upgradeset) ui.updateSectionCountsState(game);
      autoExpandAffordableHubSections(ui, "upgrades_content_wrapper");
      requestAnimationFrame(() => {
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateUpgrades === "function"
        ) {
          game.upgradeset.populateUpgrades();
        } else {
          logger.log("warn", "ui", "upgradeset.populateUpgrades is not a function or upgradeset missing");
        }
      });
      break;
    case "experimental_upgrades_section":
      setupUpgradeHubCollapsibleSections(ui);
      ui.mountExoticParticlesDisplayIfNeeded();
      ui.pageSetupUI.setupAffordabilityBanners("research_no_affordable_banner");
      if (!ui._sectionCountsMountedResearch && document.getElementById("experimental_upgrades_content_wrapper")) {
        ui._unmounts.push(ui.mountSectionCountsReactive("experimental_upgrades_content_wrapper"));
        ui._sectionCountsMountedResearch = true;
      }
      ui.ensureUpgradeDetailPanelMounted("research_detail_panel");
      if (game?.upgradeset) ui.updateSectionCountsState(game);
      autoExpandAffordableHubSections(ui, "experimental_upgrades_content_wrapper");
      if (
        game.upgradeset &&
        typeof game.upgradeset.populateExperimentalUpgrades === "function"
      ) {
        game.upgradeset.populateExperimentalUpgrades();
      } else {
        logger.log("warn", "ui", "upgradeset.populateExperimentalUpgrades is not a function or upgradeset missing");
      }
      setupResearchCollapsibleSections(ui);
      void loadAndSetVersionForPage(ui);
      ui.setupUpgradeCardHoverBuzz();
      break;
    case "about_section":
      setupAboutScrollHint(ui);
      setupVersionDisplayForPage(ui);
      if (!ui.uiState?.version_display?.app) void loadAndSetVersionForPage(ui);
      break;
    case "leaderboard_section":
      ui.pageSetupUI.setupLeaderboardPage();
      break;
    case "soundboard_section":
      ui.pageSetupUI.setupSoundboardPage();
      break;
    default:
      break;
  }

  ui.objectivesUI.showObjectivesForPage(pageId);
}
