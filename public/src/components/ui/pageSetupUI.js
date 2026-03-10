import { html, render } from "lit-html";
import { repeat } from "../../utils/litHelpers.js";
import { numFormat as fmt } from "../../utils/util.js";
import { formatTime } from "../../utils/formatUtils.js";
import { logger } from "../../utils/logger.js";
import { leaderboardService } from "../../services/leaderboardService.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { MODAL_IDS } from "../ModalManager.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

export class PageSetupUI {
  constructor(ui) {
    this.ui = ui;
    this._lastIsMobileForTopBar = null;
    this._mobileTopBarResizeListenerAdded = false;
  }

  setupLeaderboardPage() {
    const ui = this.ui;
    const container = document.getElementById("leaderboard_rows");
    const sortButtons = document.querySelectorAll(".leaderboard-sort");

    const showColumn = (sortBy) => {
      const table = container?.closest('.leaderboard-table');
      if (!table) return;
      const allPowerCells = table.querySelectorAll('.leaderboard-col-power');
      const allHeatCells = table.querySelectorAll('.leaderboard-col-heat');
      const allMoneyCells = table.querySelectorAll('.leaderboard-col-money');
      allPowerCells.forEach((el) => {
        if (sortBy === 'power') { el.classList.remove('hidden'); el.style.display = ''; }
        else el.classList.add('hidden');
      });
      allHeatCells.forEach((el) => {
        if (sortBy === 'heat') { el.classList.remove('hidden'); el.style.display = ''; }
        else el.classList.add('hidden');
      });
      allMoneyCells.forEach((el) => {
        if (sortBy === 'money') { el.classList.remove('hidden'); el.style.display = ''; }
        else el.classList.add('hidden');
      });
    };

    if (!ui.game) {
      if (container) render(html`<tr><td colspan="7" style="text-align: center;">Game not initialized</td></tr>`, container);
      return;
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

    const leaderboardRowTemplate = (run, index) => {
      const date = formatRecordDate(run);
      const timeStr = formatTime(run.time_played ?? 0);
      const hasLayout = !!run.layout;
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
      return html`
        <tr>
          <td>${index + 1}</td>
          <td>${date}</td>
          <td class="leaderboard-col-power">${fmt(run.power)}</td>
          <td class="leaderboard-col-heat">${fmt(run.heat)}</td>
          <td class="leaderboard-col-money">$${fmt(run.money)}</td>
          <td class="leaderboard-col-time" style="display: none;">${timeStr}</td>
          <td>
            ${hasLayout ? html`<button class="pixel-btn layout-view-btn" style="padding: 2px 6px; font-size: 0.6em;" @click=${onView}>View</button>` : html`<span style="opacity: 0.5;">-</span>`}
          </td>
        </tr>
      `;
    };

    const leaderboardTemplate = (records, status) => {
      if (status === "loading") {
        return html`<tr><td colspan="7" style="text-align: center;">Loading...</td></tr>`;
      }
      if (records.length === 0) {
        return html`<tr><td colspan="7" style="text-align: center;">No records found yet. Play to save scores!</td></tr>`;
      }
      return repeat(records, (r, i) => `${r.timestamp}-${i}`, (run, index) => leaderboardRowTemplate(run, index));
    };

    const loadRecords = async (sortBy) => {
      if (!container) return;
      render(leaderboardTemplate([], "loading"), container);
      await leaderboardService.init();
      const records = await leaderboardService.getTopRuns(sortBy, 20);
      render(leaderboardTemplate(records, "loaded"), container);
      showColumn(sortBy);
    };

    const activeButton = document.querySelector('.leaderboard-sort.active');
    const initialSort = activeButton ? activeButton.dataset.sort : 'power';
    sortButtons.forEach(btn => {
      btn.onclick = () => {
        sortButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        loadRecords(btn.dataset.sort);
      };
    });
    return loadRecords(initialSort);
  }

  setupAffordabilityBanners(bannerId) {
    const ui = this.ui;
    if (!ui?.uiState) return;
    const flag = bannerId === "upgrades_no_affordable_banner" ? "_affordabilityBannerMountedUpgrades" : "_affordabilityBannerMountedResearch";
    if (ui[flag]) return;
    const container = document.getElementById(bannerId);
    if (!container?.isConnected) return;
    ui[flag] = true;
    const isUpgrades = bannerId === "upgrades_no_affordable_banner";
    const key = isUpgrades ? "upgradesHidden" : "researchHidden";
    const message = isUpgrades ? "No affordable upgrades available" : "No affordable research available";
    const unmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["upgrades_banner_visibility"] }],
      () => {
        const visibility = ui.uiState?.upgrades_banner_visibility ?? { upgradesHidden: true, researchHidden: true };
        const hidden = visibility[key];
        return html`
          <div class="affordability-banner ${hidden ? "hidden" : ""}">
            <article>${message}</article>
          </div>
        `;
      },
      container
    );
    if (ui._affordabilityBannerUnmounts) ui._affordabilityBannerUnmounts.push(unmount);
    else ui._affordabilityBannerUnmounts = [unmount];
  }

  setupSoundboardPage() {
    const ui = this.ui;
    if (!ui.game?.audio) return;
    const page = ui.DOMElements.soundboard_section || document.getElementById("soundboard_section");
    if (!page) return;

    const warningSlider = ui.DOMElements.sound_warning_intensity || document.getElementById("sound_warning_intensity");
    const warningValue = ui.DOMElements.sound_warning_value || document.getElementById("sound_warning_value");
    if (warningSlider && ui.uiState) {
      const initial = Number(warningSlider.value) || 50;
      ui.uiState.sound_warning_value = initial;
      warningSlider.oninput = () => {
        if (ui.uiState) ui.uiState.sound_warning_value = Number(warningSlider.value) || 50;
      };
    }
    if (warningValue && ui.uiState) {
      ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["sound_warning_value"] }],
        () => html`${ui.uiState?.sound_warning_value ?? 50}%`,
        warningValue
      );
    }

    const playSound = (button) => {
      const sound = button.dataset.sound;
      if (!sound) return;
      if (sound === "warning") {
        const intensity = warningSlider ? Number(warningSlider.value) / 100 : 0.5;
        ui.game.audio.play("warning", intensity);
        return;
      }
      if (sound === "explosion") {
        if (button.dataset.variant === "meltdown") ui.game.audio.play("explosion", "meltdown");
        else ui.game.audio.play("explosion");
        return;
      }
      const subtype = button.dataset.subtype || null;
      ui.game.audio.play(sound, subtype);
    };

    page.querySelectorAll("button.sound-btn").forEach((button) => {
      button.onclick = () => playSound(button);
    });
  }

  setupMobileTopBar() {
    const ui = this.ui;
    try {
      const mobileTopBar = document.getElementById("mobile_top_bar");
      const stats = document.getElementById("reactor_stats");
      const topNav = document.getElementById("main_top_nav");
      const reactorWrapper = document.getElementById("reactor_wrapper");
      const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
      if (!mobileTopBar || !stats) return;

      const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;

      if (isMobile) {
        mobileTopBar.classList.add("active");
        mobileTopBar.setAttribute("aria-hidden", "false");
        let statsWrap = mobileTopBar.querySelector(".mobile-top-stats");
        if (!statsWrap) {
          statsWrap = document.createElement("div");
          statsWrap.className = "mobile-top-stats";
          mobileTopBar.appendChild(statsWrap);
        }
        if (stats && stats.parentElement !== statsWrap) statsWrap.appendChild(stats);
        if (copyPasteBtns && reactorWrapper && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
      } else {
        mobileTopBar.classList.remove("active");
        mobileTopBar.setAttribute("aria-hidden", "true");
        if (topNav && stats) {
          const engineUl = topNav.querySelector("#engine_status");
          if (engineUl) topNav.insertBefore(stats, engineUl);
          else topNav.appendChild(stats);
        }
        if (reactorWrapper && copyPasteBtns && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
      }

      this._lastIsMobileForTopBar = isMobile;
    } catch (err) {
      logger.warn("[UI] setupMobileTopBar error:", err);
    }
  }

  setupMobileTopBarResizeListener() {
    const ui = this.ui;
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
