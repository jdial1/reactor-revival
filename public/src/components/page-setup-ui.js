import { html, render } from "lit-html";
import { actions } from "../store.js";
import { numFormat as fmt, formatTime } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import { MODAL_IDS } from "../modalIds.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { leaderboardService, getLocalBestRun } from "../services.js";
import { queryClient, queryKeys } from "../services-query.js";
import {
  leaderboardStatusRowTemplate,
  leaderboardRowTemplate as leaderboardRowTemplateView,
  affordabilityBannerTemplate,
  soundWarningValueTemplate,
} from "../templates/uiComponentsTemplates.js";
import { leaderboardControlsTemplate } from "../templates/sectionPageTemplates.js";
import { updateLeaderboardIcon } from "./ui-components.js";
import { getUiElement } from "./page-dom.js";
import { classMap, repeat, when } from "../dom/lit.js";

export class PageSetupUI {
  constructor(ui) {
    this.ui = ui;
    this._lastIsMobileForTopBar = null;
    this._mobileTopBarResizeListenerAdded = false;
  }

  setupLeaderboardPage() {
    const ui = this.ui;
    const container = getUiElement(ui, "leaderboard_rows");

    const syncLeaderboardColumnVisibility = (sortBy) => {
      const columns = [
        ["power", ".leaderboard-col-power"],
        ["heat", ".leaderboard-col-heat"],
        ["money", ".leaderboard-col-money"],
      ];
      columns.forEach(([key, selector]) => {
        document.querySelectorAll(`.leaderboard-table ${selector}`).forEach((el) => {
          el.classList.toggle("hidden", sortBy !== key);
        });
      });
    };

    if (!ui.game) {
      if (container) render(leaderboardStatusRowTemplate({ text: "Game not initialized" }), container);
      return;
    }

    const onSortChange = (sortBy) => {
      if (ui.uiState) ui.uiState.leaderboard_sort = sortBy;
      void loadRecords(sortBy);
    };

    let controlsRoot = getUiElement(ui, "leaderboard_controls_root");
    if (!controlsRoot) {
      const legacyBtn = document.querySelector(".leaderboard-sort");
      if (legacyBtn) {
        const host = document.createElement("div");
        host.id = "leaderboard_controls_root";
        legacyBtn.parentNode.insertBefore(host, legacyBtn);
        document.querySelectorAll(".leaderboard-sort").forEach((btn) => btn.remove());
        controlsRoot = host;
      }
    }

    if (controlsRoot && ui.uiState && !ui._leaderboardControlsMounted) {
      ui._leaderboardControlsMounted = true;
      const unmount = bindLitRenderMulti(
        [{ state: ui.uiState, keys: ["leaderboard_sort"] }],
        () => leaderboardControlsTemplate({ uiState: ui.uiState, onSortChange }),
        controlsRoot
      );
      if (ui._unmounts) ui._unmounts.push(unmount);
      else ui._unmounts = [unmount];
    }

    const formatRecordDate = (run) => {
      let date = 'N/A';
      try {
        const timestamp = typeof run.timestamp === 'string' ? parseInt(run.timestamp, 10) : run.timestamp;
        if (timestamp && !isNaN(timestamp) && timestamp > 0) {
          const dateObj = new Date(timestamp);
          if (!isNaN(dateObj.getTime())) {
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const year = String(dateObj.getFullYear()).slice(-2);
            date = `${month}/${day}/${year}`;
          }
        }
      } catch (e) {
        logger.warn('Error formatting date:', e);
      }
      return date;
    };

    const leaderboardRowTemplate = (run, index, sortBy) => {
      const date = formatRecordDate(run);
      const timeStr = formatTime(run.time_played ?? 0);
      const hasLayout = !!run.layout;
      const powerClass = classMap({ "leaderboard-col-power": true, hidden: sortBy !== "power" });
      const heatClass = classMap({ "leaderboard-col-heat": true, hidden: sortBy !== "heat" });
      const moneyClass = classMap({ "leaderboard-col-money": true, hidden: sortBy !== "money" });
      const onView = () => {
        if (run.layout) {
          ui.modalOrchestrator.showModal(MODAL_IDS.LAYOUT_VIEW, {
            layoutJson: run.layout,
            stats: {
              money: run.money || 0,
              ep: run.exotic_particles || 0,
              heat: run.heat || 0,
              power: run.power || 0,
            },
          });
        }
      };
      const onLoad = () => {
        if (run.layout && typeof ui._showPasteModalWithData === "function") {
          ui._showPasteModalWithData(run.layout);
        }
      };
      const viewCellContent = when(
        hasLayout,
        () => html`
          <button class="pixel-btn layout-view-btn" style="padding: 2px 6px; font-size: 0.6em; margin-right: 4px;" @click=${onView}>View</button>
          <button class="pixel-btn layout-load-btn" style="padding: 2px 6px; font-size: 0.6em;" @click=${onLoad}>Load to Grid</button>
        `,
        () => html`<span style="opacity: 0.5;">-</span>`
      );
      return leaderboardRowTemplateView({
        rank: index < 0 ? "—" : index + 1,
        date,
        powerClass,
        heatClass,
        moneyClass,
        powerText: fmt(run.power),
        heatText: fmt(run.heat),
        moneyText: `$${fmt(run.money)}`,
        timeText: timeStr,
        viewCellContent,
      });
    };

    const leaderboardTemplate = (records, status, sortBy) => {
      if (status === "loading") {
        return leaderboardStatusRowTemplate({ loading: true });
      }
      if (status === "offline") {
        return leaderboardStatusRowTemplate({
          text: "Leaderboard unavailable. Check your connection.",
          offline: true,
          onRetry: () => loadRecords(sortBy),
        });
      }
      if (records.length === 0) {
        return leaderboardStatusRowTemplate({ text: "No records found yet. Play to save scores!", empty: true });
      }
      return repeat(records, (r, i) => `${r.timestamp}-${i}`, (run, index) => leaderboardRowTemplate(run, index, sortBy));
    };

    const updateSubtitle = (sortBy, status) => {
      const el = getUiElement(ui, "leaderboard_subtitle");
      if (!el) return;
      const labels = { power: "power", heat: "heat", money: "money" };
      const base = `Sorted by ${labels[sortBy] ?? sortBy}`;
      el.textContent = status === "offline" ? `${base} · API offline` : base;
    };

    const renderOfflineView = (sortBy) => {
      updateSubtitle(sortBy, "offline");
      const localBest = getLocalBestRun(sortBy);
      if (localBest) {
        render(html`
          ${leaderboardRowTemplate(localBest, -1, sortBy)}
          ${leaderboardStatusRowTemplate({
            text: "API offline — your local best run shown above",
            offline: true,
            onRetry: () => loadRecords(sortBy),
          })}
        `, container);
        return;
      }
      render(leaderboardTemplate([], "offline", sortBy), container);
    };

    const loadRecords = async (sortBy) => {
      if (!container) return;
      syncLeaderboardColumnVisibility(sortBy);
      updateSubtitle(sortBy, "loading");
      if (leaderboardService.disabled) {
        render(leaderboardTemplate([], "loaded", sortBy), container);
        return;
      }
      render(leaderboardTemplate([], "loading", sortBy), container);
      await leaderboardService.init();
      if (!leaderboardService.initialized) {
        renderOfflineView(sortBy);
        return;
      }
      const st = leaderboardService.getStatus();
      if (st.state === "open") {
        renderOfflineView(sortBy);
        return;
      }
      let records = [];
      try {
        records = await Promise.race([
          leaderboardService.getTopRuns(sortBy, 20),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("leaderboard fetch timeout")), 1500);
          }),
        ]);
      } catch {
        const cached = queryClient.getQueryData(queryKeys.leaderboard(sortBy, 20));
        if (Array.isArray(cached) && cached.length > 0) {
          updateSubtitle(sortBy, "offline");
          render(leaderboardTemplate(cached, "loaded", sortBy), container);
          return;
        }
        renderOfflineView(sortBy);
        return;
      }
      updateSubtitle(sortBy, "loaded");
      render(leaderboardTemplate(records, "loaded", sortBy), container);
      updateLeaderboardIcon(ui);
    };

    const initialSort = ui.uiState?.leaderboard_sort ?? "power";
    return loadRecords(initialSort);
  }

  setupAffordabilityBanners(bannerId) {
    const ui = this.ui;
    if (!ui?.uiState) return;
    const flag = bannerId === "upgrades_no_affordable_banner" ? "_affordabilityBannerMountedUpgrades" : "_affordabilityBannerMountedResearch";
    if (ui[flag]) {
      const existing = getUiElement(ui, bannerId);
      if (existing?.isConnected) return;
      ui[flag] = false;
    }
    const container = getUiElement(ui, bannerId);
    if (!container?.isConnected) return;
    ui[flag] = true;
    const isUpgrades = bannerId === "upgrades_no_affordable_banner";
    const key = isUpgrades ? "upgradesHidden" : "researchHidden";
    const message = isUpgrades ? "No affordable upgrades available" : "No affordable research available";
    const unmount = bindLitRenderMulti(
      [{ state: ui.uiState, keys: ["upgrades_banner_visibility"] }],
      () => {
        const visibility = ui.uiState?.upgrades_banner_visibility ?? { upgradesHidden: true, researchHidden: true };
        const hidden = visibility[key];
        return affordabilityBannerTemplate({ hidden, message });
      },
      container
    );
    if (ui._affordabilityBannerUnmounts) ui._affordabilityBannerUnmounts.push(unmount);
    else ui._affordabilityBannerUnmounts = [unmount];
  }

  setupSoundboardPage() {
    const ui = this.ui;
    if (!ui.game?.audio) return;
    const page = getUiElement(ui, "soundboard_section");
    if (!page) return;
    const warningSlider = getUiElement(ui, "sound_warning_intensity");
    const warningValue = getUiElement(ui, "sound_warning_value");
    if (warningSlider && ui.uiState) {
      const initial = Number(warningSlider.value) || 50;
      ui.uiState.sound_warning_value = initial;
      warningSlider.oninput = () => {
        if (ui.uiState) ui.uiState.sound_warning_value = Number(warningSlider.value) || 50;
      };
    }
    if (warningValue && ui.uiState) {
      bindLitRenderMulti(
        [{ state: ui.uiState, keys: ["sound_warning_value"] }],
        () => soundWarningValueTemplate({ value: ui.uiState?.sound_warning_value ?? 50 }),
        warningValue
      );
    }

    const playSound = (button) => {
      const sound = button.dataset.sound;
      if (!sound || !ui.game) return;
      if (sound === "warning") {
        const intensity = warningSlider ? Number(warningSlider.value) / 100 : 0.5;
        actions.enqueueEffect(ui.game, { kind: "sfx", id: "warning", intensity, context: "global" });
        return;
      }
      if (sound === "explosion") {
        const subtype = button.dataset.variant === "meltdown" ? "meltdown" : null;
        actions.enqueueEffect(ui.game, { kind: "sfx", id: "explosion", subtype, pan: 0, context: "global" });
        return;
      }
      const subtype = button.dataset.subtype || null;
      actions.enqueueEffect(ui.game, { kind: "sfx", id: sound, a: subtype, b: undefined, context: "global" });
    };

    page.querySelectorAll("button.sound-btn").forEach((button) => {
      button.onclick = () => playSound(button);
    });
  }

  setupMobileTopBar() {
    const ui = this.ui;
    try {
      const mobileTopBar = getUiElement(ui, "mobile_top_bar");
      const stats = getUiElement(ui, "reactor_stats");
      const topNav = getUiElement(ui, "main_top_nav");
      const reactorWrapper = getUiElement(ui, "reactor_wrapper");
      const reactorSection = getUiElement(ui, "reactor_section");
      const copyPasteBtns = getUiElement(ui, "reactor_copy_paste_btns");
      const copyPasteToggle = getUiElement(ui, "reactor_copy_paste_toggle");
      if (!mobileTopBar) return;

      const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (ui?.uiState) ui.uiState.is_mobile_viewport = isMobile;

      if (isMobile) {
        mobileTopBar.classList.add("active");
        mobileTopBar.setAttribute("aria-hidden", "false");
        if (copyPasteBtns && reactorSection && reactorWrapper && copyPasteBtns.parentElement === reactorWrapper) {
          reactorSection.insertBefore(copyPasteBtns, reactorWrapper);
        }
        const isCollapsed = ui?.uiState?.copy_paste_collapsed === true || copyPasteBtns?.classList.contains("collapsed");
        if (isCollapsed && copyPasteToggle) {
          copyPasteToggle.style.display = "inline-flex";
          copyPasteToggle.style.visibility = "visible";
        }
      } else {
        mobileTopBar.classList.remove("active");
        mobileTopBar.setAttribute("aria-hidden", "true");
        if (reactorWrapper && copyPasteBtns && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
        if (copyPasteToggle) {
          copyPasteToggle.style.removeProperty("display");
          copyPasteToggle.style.removeProperty("visibility");
        }
      }

      this._lastIsMobileForTopBar = isMobile;
    } catch (err) {
      logger.warn("[UI] setupMobileTopBar error:", err);
    }
  }

  setupMobileTopBarResizeListener() {
    if (this._mobileTopBarResizeListenerAdded) return;
    this._mobileTopBarResizeListenerAdded = true;
    window.addEventListener("resize", () => {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile !== this._lastIsMobileForTopBar) {
        this.setupMobileTopBar();
      }
    });
  }
}
