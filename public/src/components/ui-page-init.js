import { html } from "lit-html";
import { logger } from "../core/logger.js";
import {
  dedupeReactorStatsDom,
  getPageReactor,
  getPageReactorWrapper,
  getPageReactorBackground,
} from "./page-dom.js";
import { mountReactorGridLayoutBinding } from "./ui-grid.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { pwaState } from "../store.js";

export function clearPageReactor(ui) {
  const reactor = getPageReactor(ui);
  if (reactor) reactor.innerHTML = "";
}

export function setPageGridContainer(ui, container) {
  if (ui.gridCanvasRenderer) ui.gridCanvasRenderer.setContainer(container);
}

export function setupUpgradeHubCollapsibleSections(ui) {
  if (ui._upgradeHubCollapsibleSetup) return;
  ui._upgradeHubCollapsibleSetup = true;
  const bind = (sectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.addEventListener("click", (e) => {
      const header = e.target.closest(".upgrade-section-header");
      if (!header) return;
      const article = header.closest(".upgrade-hub-collapsible");
      if (!article) return;
      e.preventDefault();
      const collapsed = article.classList.toggle("section-collapsed");
      header.setAttribute("aria-expanded", String(!collapsed));
      const accordionWrapper = article.closest("[data-hub-accordion]");
      if (!collapsed && accordionWrapper) {
        accordionWrapper.querySelectorAll(".upgrade-hub-collapsible").forEach((other) => {
          if (other === article) return;
          other.classList.add("section-collapsed");
          other.querySelector(".upgrade-section-header")?.setAttribute("aria-expanded", "false");
        });
      }
    });
    section.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const header = e.target.closest(".upgrade-section-header");
      if (!header) return;
      e.preventDefault();
      header.click();
    });
  };
  bind("upgrades_section");
  bind("experimental_upgrades_section");
}

export function setupAboutScrollHint() {
  const section = document.getElementById("about_section");
  const hint = document.getElementById("about_scroll_hint");
  if (!section || !hint) return;
  const hide = () => hint.classList.add("hidden");
  const scrollTargets = [section, document.getElementById("page_content_area")].filter(Boolean);
  scrollTargets.forEach((target) => {
    target.addEventListener("scroll", hide, { once: true, passive: true });
  });
  requestAnimationFrame(() => {
    const scrollHost = scrollTargets.find((el) => el.scrollHeight > el.clientHeight + 12) ?? section;
    if (scrollHost.scrollHeight <= scrollHost.clientHeight + 12) hide();
  });
}

function autoExpandAffordableHubSections(ui, wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  const counts = ui?.uiState?.section_counts;
  if (!wrapper || !counts) return;
  wrapper.querySelectorAll(".upgrade-hub-collapsible.section-collapsed h2[data-section-name]").forEach((header) => {
    const sectionName = header.getAttribute("data-section-name");
    if ((counts[sectionName]?.affordable ?? 0) > 0) {
      const article = header.closest(".upgrade-hub-collapsible");
      article?.classList.remove("section-collapsed");
      header.setAttribute("aria-expanded", "true");
    }
  });
}

export function setupResearchCollapsibleSections(ui) {
  if (ui._researchCollapsibleSetup) return;
  ui._researchCollapsibleSetup = true;
  const section = document.getElementById("experimental_upgrades_section");
  if (!section) return;
  section.addEventListener("click", (e) => {
    const header = e.target.closest(".research-section-header");
    if (!header) return;
    const article = header.closest(".research-collapsible");
    if (!article) return;
    e.preventDefault();
    const collapsed = article.classList.toggle("section-collapsed");
    header.setAttribute("aria-expanded", String(!collapsed));
  });
  section.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const header = e.target.closest(".research-section-header");
    if (!header) return;
    e.preventDefault();
    header.click();
  });
  const coverWrap = document.querySelector(".refund-safety-cover-wrap");
  const coverBtn = document.getElementById("refund_safety_cover");
  if (coverBtn && coverWrap) {
    coverBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      coverWrap.classList.toggle("cover-open");
    });
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
        orchestrator?.showPrestigeModal?.("refund");
      }
    });
  }
  if (refundBtn) {
    refundBtn.addEventListener("click", () => {
      orchestrator?.showPrestigeModal?.("prestige");
    });
  }
}

export function setupVersionDisplayForPage(ui) {
  if (!ui?.uiState || ui._versionDisplayMounted) return;
  const aboutEl = document.getElementById("about_version");
  const appEl = document.getElementById("app_version");
  const renderVersion = (el) => {
    if (!el?.isConnected) return;
    bindLitRenderMulti(
      [{ state: ui.uiState, keys: ["version_display"] }],
      () => html`${ui.uiState?.version_display?.app ?? ui.uiState?.version_display?.about ?? ""}`,
      el
    );
  };
  if (aboutEl) renderVersion(aboutEl);
  if (appEl && appEl !== aboutEl) renderVersion(appEl);
  const aboutBtn = document.getElementById("about_version_btn");
  if (aboutBtn && !aboutBtn.dataset.changelogBound) {
    aboutBtn.dataset.changelogBound = "1";
    aboutBtn.addEventListener("click", () => {
      pwaState.versionCheckRequested = true;
    });
  }
  ui._versionDisplayMounted = true;
}

export async function loadAndSetVersionForPage(ui) {
  try {
    const { getResourceUrl } = await import("../dom/lit.js");
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
          resetBtn.addEventListener("click", () => { void ui.resetReactor?.(); });
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
      setupAboutScrollHint();
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
