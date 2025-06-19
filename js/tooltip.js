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

    // Listen for resize events to update mobile state
    window.addEventListener("resize", () => {
      const wasMobile = this.isMobile;
      this.isMobile = window.innerWidth <= 768;
      if (wasMobile !== this.isMobile && this.current_obj) {
        this.update(); // Re-render tooltip if mobile state changed
      }
    });

    const closeButton = document.createElement("button");
    closeButton.innerHTML = "×";
    closeButton.id = "tooltip_close_btn";
    closeButton.style.cssText =
      "position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border: 1px solid #555; background: #333; color: white; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 22px; z-index: 10;";
    closeButton.onclick = () => this.closeView();
    this.$tooltip.appendChild(closeButton);
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
    if (!this.tooltip_showing) {
      this.$main.classList.add("tooltip_showing");
      this.tooltip_showing = true;
    }
    this.$tooltip.querySelector("#tooltip_close_btn").style.display = "block";
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
      // Clamp to viewport with margin
      const margin = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      // If tooltip goes above, show below anchor
      if (top < margin) {
        top = rect.bottom + scrollY + 8;
      }
      // Clamp left/right
      if (left < margin) left = margin;
      if (left + tooltipRect.width > viewportWidth - margin) {
        left = viewportWidth - tooltipRect.width - margin;
      }
      // Clamp bottom
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
      this.tooltip_showing = false;
    }
  }

  update() {
    this.game.performance.markStart("tooltip_update_total");

    if (!this.tooltip_showing || !this.current_obj) {
      return;
    }
    const obj = this.current_obj;
    const tile = this.current_tile_context;
    let content = "";

    // Helper to inject icons
    const iconify = (str) => {
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
        );
    };

    if (this.isMobile) {
      // Mobile condensed view
      content = this.generateMobileTooltip(obj, tile, iconify);
    } else {
      // Desktop detailed view
      content = this.generateDesktopTooltip(obj, tile, iconify);
    }

    // Only update DOM if content changed
    if (this._lastTooltipContent !== content) {
      this.game.performance.markStart("tooltip_dom_update");
      this.$tooltipContent.innerHTML = content;
      this._lastTooltipContent = content;
      this.game.performance.markEnd("tooltip_dom_update");
    }

    this.updateActionButtons(obj);
    this.game.performance.markEnd("tooltip_update_total");
  }

  generateMobileTooltip(obj, tile, iconify) {
    const title = obj.title || (obj.upgrade && obj.upgrade.title);
    let content = `<div class="tooltip-title">${title}</div>`;

    // Compact stats row
    let stats = [];

    // Level for upgrades
    if (obj.upgrade) {
      stats.push(`Level ${obj.level}/${obj.max_level}`);
    }

    // Cost - Show for parts, upgrades and experimental research
    if (
      obj.cost !== undefined ||
      (obj.upgrade && obj.upgrade.cost !== undefined)
    ) {
      const cost = obj.cost ?? obj.upgrade?.cost;
      stats.push(
        `<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
          cost
        )}`
      );
    }

    // Power
    if (
      tile?.display_power !== undefined ||
      obj.power !== undefined ||
      obj.base_power !== undefined
    ) {
      const power = tile?.display_power ?? obj.power ?? obj.base_power;
      if (power > 0) {
        stats.push(
          `<img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(
            power
          )}`
        );
      }
    }

    // Heat
    if (
      tile?.display_heat !== undefined ||
      obj.heat !== undefined ||
      obj.base_heat !== undefined
    ) {
      const heat = tile?.display_heat ?? obj.heat ?? obj.base_heat;
      if (heat > 0) {
        stats.push(
          `<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(
            heat,
            0
          )}`
        );
      }
    }

    // Ticks
    if (obj.ticks > 0) {
      stats.push(
        `<img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(
          obj.ticks
        )}`
      );
    }

    if (stats.length > 0) {
      content += `<div class="tooltip-mobile-stats">${stats.join(" ")}</div>`;
    }

    // Add description for parts and upgrades
    const description =
      obj.description || (obj.upgrade && obj.upgrade.description);
    if (description) {
      const formattedDesc = iconify(description)
        .replace(/\.\s+/g, ". ")
        .replace(/\s+/g, " ")
        .trim();
      content += `<div class="tooltip-mobile-desc">${formattedDesc}</div>`;
    }

    // Add upgrade-specific info
    if (obj.upgrade) {
      if (obj.level >= obj.max_level) {
        content += `<div class="tooltip-mobile-upgrade">Maximum Level Reached</div>`;
      } else if (!obj.affordable) {
        content += `<div class="tooltip-mobile-upgrade tooltip-mobile-unaffordable">Cannot Afford Upgrade</div>`;
      }
    }

    return content;
  }

  generateDesktopTooltip(obj, tile, iconify) {
    const title = obj.title || (obj.upgrade && obj.upgrade.title);
    const description =
      obj.description || (obj.upgrade && obj.upgrade.description);
    let content = `<div class="tooltip-title">${title}</div>`;

    // Summary row
    let summary = '<div class="tooltip-summary-row">';
    let summaryPower = tile?.display_power ?? obj.power ?? obj.base_power;
    let summaryHeat = tile?.display_heat ?? obj.heat ?? obj.base_heat;

    if (obj.cost !== undefined) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
        obj.cost
      )}</span>`;
    }
    if (summaryPower > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(
        summaryPower
      )}</span>`;
    }
    if (summaryHeat > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(
        summaryHeat,
        0
      )}</span>`;
    }
    if (obj.base_containment > 0 || obj.containment > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='max heat'>Max: ${fmt(
        obj.base_containment || obj.containment,
        0
      )}</span>`;
    }
    if (obj.ticks > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(
        obj.ticks
      )}</span>`;
    }
    summary += "</div>";

    if (summary !== '<div class="tooltip-summary-row"></div>') {
      content += summary;
    }

    if (description) {
      const formattedDesc = iconify(description).replace(/\.\s+/g, ".<br>");
      content += `<div class="tooltip-desc">${formattedDesc}</div>`;
    }

    // Add detailed stats for desktop
    const stats = this.getDetailedStats(obj, tile);
    if (stats.size > 0) {
      content += '<dl class="tooltip-stats">';
      for (const [key, value] of stats) {
        content += `<dt>${iconify(key)}</dt><dd>${iconify(value)}</dd>`;
      }
      content += "</dl>";
    }

    return content;
  }

  getDetailedStats(obj, tile) {
    const stats = new Map();
    if (obj.upgrade) {
      if (obj.level >= obj.max_level) {
        stats.set("", "MAX");
      } else if (obj.ecost) {
        stats.set("", `${fmt(obj.current_ecost)} EP`);
      }
    } else if (
      obj.cost !== undefined &&
      obj.erequires &&
      !this.game.upgradeset.getUpgrade(obj.erequires)?.level
    ) {
      stats.set("", "LOCKED");
    }

    if (tile?.activated) {
      if (obj.containment) {
        stats.set(
          "Heat",
          `${fmt(tile.heat_contained, 0)} / ${fmt(obj.containment, 0)}`
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
      actionsContainer.style.marginTop = "0.5rem";
      actionsContainer.style.textAlign = "center";
      this.$tooltipContent.appendChild(actionsContainer);
    }
    actionsContainer.innerHTML = "";

    if (this.isLocked && obj.upgrade && obj.level < obj.max_level) {
      const buyButton = document.createElement("button");
      buyButton.textContent = "Buy";
      buyButton.className = "styled-button";
      buyButton.disabled = !obj.affordable;
      buyButton.onclick = () => {
        if (this.game.upgradeset.purchaseUpgrade(obj.id)) {
          this.game.upgradeset.check_affordability(this.game);
          this.update();
        }
      };
      actionsContainer.appendChild(buyButton);
    }
  }
}
