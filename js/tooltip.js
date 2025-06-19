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
    const title = obj.title || (obj.upgrade && obj.upgrade.title);
    if (obj.updateDescription) {
      obj.updateDescription(tile);
    }
    const description =
      obj.description || (obj.upgrade && obj.upgrade.description);

    // Helper to inject icons
    const iconify = (str) => {
      if (!str) return str;
      return (
        str
          // Power icon
          .replace(
            /\bpower\b/gi,
            "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>"
          )
          // Heat icon
          .replace(
            /\bheat\b/gi,
            "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>"
          )
          // Tick/clock icon
          .replace(
            /\bticks?\b/gi,
            (match) =>
              `${match} <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>`
          )
          // Cash icon
          .replace(
            /\$(\d+)/g,
            "<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'> $1"
          )
      );
    };

    // Summary row for power, heat, max_heat, cost
    let summary = '<div class="tooltip-summary-row">';
    // Use tile.display_power/display_heat for cells if available, else fallback
    let summaryPower = null;
    let summaryHeat = null;
    if (tile && tile.display_power !== undefined) {
      summaryPower = tile.display_power;
    } else if (obj.power !== undefined) {
      summaryPower = obj.power;
    } else if (obj.base_power !== undefined) {
      summaryPower = obj.base_power;
    }
    if (tile && tile.display_heat !== undefined) {
      summaryHeat = tile.display_heat;
    } else if (obj.heat !== undefined) {
      summaryHeat = obj.heat;
    } else if (obj.base_heat !== undefined) {
      summaryHeat = obj.base_heat;
    }

    // Cost
    if (obj.cost !== undefined) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(
        obj.cost
      )}</span>`;
    }
    summary += "</div>";

    // Power (created/generated)
    if (summaryPower > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'> ${fmt(
        summaryPower
      )}</span>`;
    }
    // Heat (created/generated)
    if (summaryHeat > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'> ${fmt(
        summaryHeat,
        0
      )}</span>`;
    }
    // Max Heat (containment)
    let addedMaxHeat = false;
    if (obj.base_containment > 0 || obj.containment > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='max heat'> Max: ${fmt(
        obj.base_containment || obj.containment,
        0
      )}</span>`;
      addedMaxHeat = true;
    }

    // Durability
    if (obj.ticks > 0) {
      summary += `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(
        obj.ticks
      )}</span>`;
    }

    content += `<div class="tooltip-title">${title}</div>`;
    if (summary !== '<div class="tooltip-summary-row"></div>') {
      content += summary;
    }
    if (description) {
      // Insert <br> after each period followed by a space for better sentence wrapping
      const formattedDesc = iconify(description).replace(/\.\s+/g, ".<br>");
      content += `<div class="tooltip-desc">${formattedDesc}</div>`;
    }
    const stats = new Map();
    if (obj.upgrade) {
      if (obj.level >= obj.max_level) {
        stats.set("", "MAX");
      } else if (obj.ecost) {
        stats.set("", `${fmt(obj.current_ecost)} EP`);
      }
    } else if (obj.cost !== undefined) {
      if (
        obj.erequires &&
        !this.game.upgradeset.getUpgrade(obj.erequires)?.level
      ) {
        stats.set("", "LOCKED");
      }
    }
    if (tile && tile.activated) {
      if (obj.containment)
        stats.set(
          "Heat",
          `${fmt(tile.heat_contained, 0)} / ${fmt(obj.containment, 0)}`
        );
      if (obj.category !== "cell") {
        let sell_value = obj.cost;
        if (obj.ticks > 0) {
          sell_value = Math.ceil((tile.ticks / obj.ticks) * obj.cost);
        } else if (obj.containment > 0) {
          sell_value =
            obj.cost -
            Math.ceil((tile.heat_contained / obj.containment) * obj.cost);
        }
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
    if (stats.size > 0) {
      content += '<dl class="tooltip-stats">';
      for (const [key, value] of stats) {
        content += `<dt>${iconify(key)}</dt><dd>${iconify(value)}</dd>`;
      }
      content += "</dl>";
    }

    // Only update DOM if content changed
    if (this._lastTooltipContent !== content) {
      this.game.performance.markStart("tooltip_dom_update");
      this.$tooltipContent.innerHTML = content;
      this._lastTooltipContent = content;
      this.game.performance.markEnd("tooltip_dom_update");
    }

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

    if (this.isLocked) {
      if (obj.upgrade && obj.level < obj.max_level) {
        const buyButton = document.createElement("button");
        buyButton.textContent = "Buy";
        buyButton.className = "styled-button";
        buyButton.disabled = !obj.affordable;
        buyButton.onclick = () => {
          console.log(
            `Buy button clicked for upgrade: ${obj.id} (level ${
              obj.level + 1
            }, cost: ${obj.current_cost || obj.current_ecost})`
          );
          if (this.game.upgradeset.purchaseUpgrade(obj.id)) {
            console.log(
              `Successfully purchased upgrade: ${obj.id} -> level ${obj.level}`
            );
            // Ensure all upgrades update their affordability before re-rendering
            this.game.upgradeset.check_affordability(this.game);
            this.update();
          } else {
            console.log(
              `Failed to purchase upgrade: ${obj.id} - insufficient funds or other error`
            );
          }
        };
        actionsContainer.appendChild(buyButton);
      }
    }

    this.game.performance.markEnd("tooltip_update_total");
  }
}
