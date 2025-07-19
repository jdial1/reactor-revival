import { numFormat as fmt } from "./util.js";

export class TooltipManager {
  constructor(main_element_selector, tooltip_element_selector, game) {
    this.$main = document.querySelector(main_element_selector);
    this.$tooltip = document.querySelector(tooltip_element_selector);
    this.$tooltipContent = document.getElementById("tooltip_data");
    this.game = game;

    if (!this.$main || !this.$tooltip || !this.$tooltipContent) {
      console.error("TooltipManager: A required element was not found.");
    }

    this.tooltip_task = null;
    this.tooltip_showing = false;
    this.current_obj = null;
    this.current_tile_context = null;
    this.isLocked = false;
    this.lastRenderedObj = null;
    this.lastRenderedTileContext = null;
    this._lastTooltipContent = null;
    this.isMobile = window.innerWidth <= 768;
    this.needsLiveUpdates = false;

    window.addEventListener("resize", () => {
      const wasMobile = this.isMobile;
      this.isMobile = window.innerWidth <= 768;
      if (wasMobile !== this.isMobile && this.current_obj) {
        this.update();
      }

      // Handle tooltip mouse events for desktop/mobile transitions
      const isDesktop = window.innerWidth > 768;
      if (isDesktop) {
        // Add mouse events for desktop
        if (!this.$tooltip._hasMouseEvents) {
          this.$tooltip._mouseEnterHandler = () => {
            clearTimeout(this.tooltip_task);
          };

          this.$tooltip._mouseLeaveHandler = () => {
            if (!this.isLocked) {
              this.hide();
            }
          };

          this.$tooltip.addEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
          this.$tooltip.addEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
          this.$tooltip._hasMouseEvents = true;
        }
      } else {
        // Remove mouse events for mobile
        if (this.$tooltip._hasMouseEvents) {
          this.$tooltip.removeEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
          this.$tooltip.removeEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
          this.$tooltip._hasMouseEvents = false;
        }
      }
    });

    // Use event delegation for the close button
    this.$tooltip.addEventListener("click", (e) => {
      if (e.target.id === "tooltip_close_btn") {
        this.closeView();
      }
    });

    // Keep tooltip open when mouse moves over it (desktop only)
    if (window.innerWidth > 768) {
      this.$tooltip._mouseEnterHandler = () => {
        // Clear any pending hide timeout when mouse enters tooltip
        clearTimeout(this.tooltip_task);
      };

      this.$tooltip._mouseLeaveHandler = () => {
        // Only hide if not locked and mouse leaves tooltip
        if (!this.isLocked) {
          this.hide();
        }
      };

      this.$tooltip.addEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
      this.$tooltip.addEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
      this.$tooltip._hasMouseEvents = true;
    }
  }

  show(obj, tile_context, isClick = false, anchorEl = null) {
    if (this.isLocked && !isClick) return;
    clearTimeout(this.tooltip_task);

    if (!obj) {
      this.hide();
      return;
    }

    if (isClick) {
      this.isLocked = true;
    } else if (this.isLocked) {
      return;
    }

    this.current_obj = obj;
    this.current_tile_context = tile_context;
    this.needsLiveUpdates = this._shouldTooltipUpdateLive(obj, tile_context);

    if (!this.tooltip_showing) {
      this.$main.classList.add("tooltip_showing");
      this.$tooltip.classList.remove("hidden");
      this.tooltip_showing = true;
    }

    if (
      this.lastRenderedObj !== obj ||
      this.lastRenderedTileContext !== tile_context
    ) {
      this.update();
      this.lastRenderedObj = obj;
      this.lastRenderedTileContext = tile_context;
    }

    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const tooltipRect = this.$tooltip.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      let top = rect.top + scrollY - tooltipRect.height - 8;
      let left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;
      const margin = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (top < margin) {
        top = rect.bottom + scrollY + 8;
      }
      if (left < margin) left = margin;
      if (left + tooltipRect.width > viewportWidth - margin) {
        left = viewportWidth - tooltipRect.width - margin;
      }
      if (top + tooltipRect.height > viewportHeight - margin) {
        top = Math.max(margin, viewportHeight - tooltipRect.height - margin);
      }
      this.$tooltip.style.top = `${top}px`;
      this.$tooltip.style.left = `${left}px`;
      this.$tooltip.style.right = "auto";
      this.$tooltip.style.transform = "none";
    } else {
      this.$tooltip.style.top = "20px";
      this.$tooltip.style.left = "50%";
      this.$tooltip.style.right = "auto";
      this.$tooltip.style.transform = "translateX(-50%)";
    }
  }

  hide() {
    if (this.isLocked) return;
    clearTimeout(this.tooltip_task);
    this.tooltip_task = setTimeout(() => this._hide(), 200);
    this.lastRenderedObj = null;
    this.lastRenderedTileContext = null;
  }

  closeView() {
    this.isLocked = false;
    this._hide();
  }

  _hide() {
    this.current_obj = null;
    this.current_tile_context = null;
    if (this.tooltip_showing) {
      this.$main.classList.remove("tooltip_showing");
      this.$tooltip.classList.add("hidden");
      this.tooltip_showing = false;
    }
  }

  async update() {
    this.game.performance.markStart("tooltip_update_total");
    if (!this.tooltip_showing || !this.current_obj) {
      return;
    }

    let tooltipBody = null;

    // Try to use template loader first
    if (window.templateLoader && window.templateLoader.loaded) {
      tooltipBody = window.templateLoader.cloneTemplate(
        "tooltip-body-template"
      );
    }

    // Fallback: create tooltip structure manually if template not available
    if (!tooltipBody) {
      const fallbackDiv = document.createElement("div");
      fallbackDiv.innerHTML = `
        <div data-role="title" class="tooltip-title" style="font-size:1.1em;font-weight:bold;margin-bottom:0.5em;"></div>
        <div data-role="desktop-summary" class="tooltip-summary-row"></div>
        <p data-role="description"></p>
        <dl class="tooltip-stats" data-role="desktop-stats"></dl>
        <footer id="tooltip_actions"></footer>
      `;
      tooltipBody = fallbackDiv;
    }

    if (tooltipBody) {
      this.$tooltipContent.innerHTML = "";
      this.$tooltipContent.appendChild(tooltipBody);
    } else {
      this.$tooltipContent.innerHTML = "Error: Tooltip template not found.";
      return;
    }

    // Set the part name/title at the top
    const titleEl = this.$tooltipContent.querySelector('[data-role="title"]');
    if (titleEl && this.current_obj?.title) {
      titleEl.textContent = this.current_obj.title;
    }

    if (this.isMobile) {
      this.populateMobileTooltip();
    } else {
      this.populateDesktopTooltip();
    }
    this.updateActionButtons(this.current_obj);
    this.game.performance.markEnd("tooltip_update_total");
  }

  populateMobileTooltip() {
    const obj = this.current_obj;
    const tile = this.current_tile_context;
    const iconify = this.getIconifyFn();

    const titleEl = this.$tooltipContent.querySelector('[data-role="title"]');
    if (titleEl) titleEl.textContent = obj.title || obj.upgrade?.title;

    const stats = [];
    if (obj.upgrade) stats.push(`Level ${obj.level}/${obj.max_level}`);

    // Only show money costs in mobile stats, not EP costs
    if (obj.cost !== undefined || obj.upgrade?.cost !== undefined) {
      const cost = obj.cost ?? obj.upgrade?.cost;
      stats.push(
        `<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
          cost
        )}`
      );
    }
    if (
      tile?.display_power !== undefined ||
      obj.power !== undefined ||
      obj.base_power !== undefined
    ) {
      const power = tile?.display_power ?? obj.power ?? obj.base_power;
      if (power > 0)
        stats.push(
          `<img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(
            power
          )}`
        );
    }
    if (
      tile?.display_heat !== undefined ||
      obj.heat !== undefined ||
      obj.base_heat !== undefined
    ) {
      const heat = tile?.display_heat ?? obj.heat ?? obj.base_heat;
      if (heat > 0)
        stats.push(
          `<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(
            heat,
            0
          )}`
        );
    }
    if (obj.ticks > 0)
      stats.push(
        `<img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(
          obj.ticks
        )}`
      );

    const mobileStatsEl = this.$tooltipContent.querySelector(
      '[data-role="mobile-stats"]'
    );
    if (mobileStatsEl) mobileStatsEl.innerHTML = stats.join(" ");

    const descEl = this.$tooltipContent.querySelector(
      '[data-role="description"]'
    );
    if (descEl) {
      const description = obj.description || obj.upgrade?.description;
      if (description) {
        descEl.innerHTML = iconify(description);
        if (obj.upgrade) descEl.classList.add("is-inset");
      } else {
        descEl.innerHTML = "";
      }
    }

    const upgradeStatusEl = this.$tooltipContent.querySelector(
      '[data-role="mobile-upgrade-status"]'
    );
    if (upgradeStatusEl) {
      if (obj.upgrade) {
        if (obj.level >= obj.max_level)
          upgradeStatusEl.textContent = "Maximum Level Reached";
        else if (!obj.affordable)
          upgradeStatusEl.innerHTML =
            '<span class="tooltip-mobile-unaffordable">Cannot Afford Upgrade</span>';
        else upgradeStatusEl.textContent = "";
      } else {
        upgradeStatusEl.textContent = "";
      }
    }
  }

  populateDesktopTooltip() {
    const obj = this.current_obj;
    const tile = this.current_tile_context;
    const iconify = this.getIconifyFn();

    const titleEl = this.$tooltipContent.querySelector('[data-role="title"]');
    if (titleEl) titleEl.textContent = obj.title || obj.upgrade?.title;

    let summaryItems = [];
    let summaryPower = tile?.display_power ?? obj.power ?? obj.base_power;
    let summaryHeat = tile?.display_heat ?? obj.heat ?? obj.base_heat;

    // Only show money costs in desktop summary, not EP costs
    if (obj.cost !== undefined) {
      summaryItems.push(
        `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
          obj.cost
        )}</span>`
      );
    }
    if (summaryPower > 0)
      summaryItems.push(
        `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(
          summaryPower
        )}</span>`
      );
    if (summaryHeat > 0)
      summaryItems.push(
        `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(
          summaryHeat,
          0
        )}</span>`
      );
    if (obj.base_containment > 0 || obj.containment > 0)
      summaryItems.push(
        `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='max heat'>Max: ${fmt(
          obj.base_containment || obj.containment,
          0
        )}</span>`
      );
    if (obj.ticks > 0)
      summaryItems.push(
        `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(
          obj.ticks
        )}</span>`
      );

    const summaryEl = this.$tooltipContent.querySelector(
      '[data-role="desktop-summary"]'
    );
    if (summaryEl) summaryEl.innerHTML = summaryItems.join("");

    const descEl = this.$tooltipContent.querySelector(
      '[data-role="description"]'
    );
    if (descEl) {
      const description = obj.description || obj.upgrade?.description;
      if (description) {
        descEl.innerHTML = iconify(description).replace(/\.\s+/g, ".<br>");
        if (obj.upgrade) descEl.classList.add("is-inset");
      } else {
        descEl.innerHTML = "";
      }
    }

    const stats = this.getDetailedStats(obj, tile);
    const statsEl = this.$tooltipContent.querySelector(
      '[data-role="desktop-stats"]'
    );
    if (statsEl) {
      let statsHtml = "";
      for (const [key, value] of stats) {
        statsHtml += `<dt>${iconify(key)}</dt><dd>${iconify(value)}</dd>`;
      }
      statsEl.innerHTML = statsHtml;
    }
  }

  getIconifyFn() {
    return (str) => {
      if (!str) return str;
      return str
        .replace(
          /\bpower\b/gi,
          "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>"
        )
        .replace(
          /\bheat\b/gi,
          "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>"
        )
        .replace(
          /\bticks?\b/gi,
          (match) =>
            `${match} <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>`
        )
        .replace(
          /\$(\d+)/g,
          "<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'> $1"
        )
        .replace(
          /\bEP\b/g,
          "🧬 $&"
        );
    };
  }

  getDetailedStats(obj, tile) {
    const stats = new Map();
    if (obj.upgrade) {
      if (obj.level >= obj.max_level) {
        stats.set("", "MAX");
      }
      // Don't show EP costs in detailed stats, only on buy button
    } else if (
      obj.cost !== undefined &&
      obj.erequires &&
      !this.game.upgradeset.getUpgrade(obj.erequires)?.level
    ) {
      stats.set("", "LOCKED");
    }

    if (tile?.activated) {
      if (obj.containment) {
        const maxHeat = obj.containment || "∞";
        const maxHeatDisplay = maxHeat === "∞" ? maxHeat : fmt(maxHeat, 0);
        stats.set(
          "Heat",
          `${fmt(tile.heat_contained || 0, 0)} / ${maxHeatDisplay}`
        );
      }
      if (obj.category !== "cell") {
        let sell_value = this.calculateSellValue(obj, tile);
        stats.set(
          "Sells for",
          `<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
            Math.max(0, sell_value)
          )}`
        );
      }
      if (obj.category === "particle_accelerator") {
        stats.set("EP Chance", `${fmt(tile.display_chance, 2)}%`);
        stats.set(
          "EP Heat %",
          `${fmt(tile.display_chance_percent_of_total, 2)}% of max`
        );
      }
    }
    return stats;
  }

  calculateSellValue(obj, tile) {
    let sell_value = obj.cost;
    if (obj.ticks > 0) {
      sell_value = Math.ceil((tile.ticks / obj.ticks) * obj.cost);
    } else if (obj.containment > 0) {
      sell_value =
        obj.cost -
        Math.ceil((tile.heat_contained / obj.containment) * obj.cost);
    }
    return sell_value;
  }

  updateActionButtons(obj) {
    let actionsContainer =
      this.$tooltipContent.querySelector("#tooltip_actions");
    if (!actionsContainer) {
      actionsContainer = document.createElement("div");
      actionsContainer.id = "tooltip_actions";
      this.$tooltipContent.appendChild(actionsContainer);
    }
    actionsContainer.innerHTML = "";

    // Show buy button for upgrades regardless of locked state
    if (obj.upgrade && obj.level < obj.max_level) {
      const buyButton = document.createElement("button");
      let costText = "";

      // Handle cost display - check for EP costs first
      if (obj.current_ecost !== undefined || obj.ecost !== undefined || obj.base_ecost !== undefined) {
        const ecost = obj.current_ecost ?? obj.ecost ?? obj.base_ecost;
        costText = ` 🧬 ${fmt(ecost)} EP`;
      } else if (obj.current_cost !== undefined) {
        costText = ` <img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
          obj.current_cost
        )}`;
      } else if (obj.cost !== undefined) {
        costText = ` <img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
          obj.cost
        )}`;
      }

      buyButton.innerHTML = `Buy${costText} `;
      buyButton.className = "";
      buyButton.disabled = !obj.affordable;
      buyButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game.upgradeset.purchaseUpgrade(obj.id)) {
          this.game.upgradeset.check_affordability(this.game);
          this.update();
        }
      };
      actionsContainer.appendChild(buyButton);
    }
  }

  _shouldTooltipUpdateLive(obj, tile_context) {
    if (obj.upgrade) {
      return false;
    }
    if (tile_context && tile_context.activated) {
      return true;
    }
    return false;
  }

  updateUpgradeAffordability() {
    if (this.tooltip_showing && this.current_obj?.upgrade && this.isLocked) {
      this.update();
    }
  }
}
