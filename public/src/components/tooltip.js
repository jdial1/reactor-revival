import { numFormat as fmt } from "../utils/util.js";
import { applyMobileTooltipPosition, clearDesktopTooltipPosition } from "./tooltip/tooltipPositioning.js";
import { populateMobileTooltip, populateDesktopTooltip } from "./tooltip/tooltipContentRenderer.js";
import { logger } from "../utils/logger.js";
import { BaseComponent } from "./BaseComponent.js";

export class TooltipManager extends BaseComponent {
  constructor(main_element_selector, tooltip_element_selector, game) {
    super();
    this.$main = document.querySelector(main_element_selector);
    this.$tooltip = document.querySelector(tooltip_element_selector);
    this.$tooltipContent = document.getElementById("tooltip_data");
    this.game = game;

    if (!this.$main || !this.$tooltip || !this.$tooltipContent) {
      logger.log('error', 'ui', 'TooltipManager: A required element was not found.');
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
    this._resizeHandler = () => {
      const wasMobile = this.isMobile;
      this.isMobile = window.innerWidth <= 768;
      if (wasMobile !== this.isMobile && this.current_obj) {
        this.update();
      }
      const isDesktop = window.innerWidth > 768;
      if (isDesktop) {
        if (!this.$tooltip._hasMouseEvents) {
          this.$tooltip._mouseEnterHandler = () => clearTimeout(this.tooltip_task);
          this.$tooltip._mouseLeaveHandler = () => {
            if (!this.isLocked) this.hide();
          };
          this.$tooltip.addEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
          this.$tooltip.addEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
          this.$tooltip._hasMouseEvents = true;
        }
      } else {
        if (this.$tooltip._hasMouseEvents) {
          this.$tooltip.removeEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
          this.$tooltip.removeEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
          this.$tooltip._hasMouseEvents = false;
        }
      }
    };
    this._tooltipClickHandler = (e) => {
      if (e.target.id === "tooltip_close_btn") this.closeView();
    };

    window.addEventListener("resize", this._resizeHandler);
    this.$tooltip.addEventListener("click", this._tooltipClickHandler);

    if (window.innerWidth > 768) {
      this.$tooltip._mouseEnterHandler = () => clearTimeout(this.tooltip_task);
      this.$tooltip._mouseLeaveHandler = () => {
        if (!this.isLocked) this.hide();
      };
      this.$tooltip.addEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
      this.$tooltip.addEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
      this.$tooltip._hasMouseEvents = true;
    }
  }

  teardown() {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this._resizeHandler);
    }
    if (this.$tooltip) {
      this.$tooltip.removeEventListener("click", this._tooltipClickHandler);
      if (this.$tooltip._hasMouseEvents) {
        this.$tooltip.removeEventListener("mouseenter", this.$tooltip._mouseEnterHandler);
        this.$tooltip.removeEventListener("mouseleave", this.$tooltip._mouseLeaveHandler);
        this.$tooltip._hasMouseEvents = false;
      }
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
      this.isVisible = true;
      this.$main.classList.add("tooltip_showing");
      this.setElementVisible(this.$tooltip, true);
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

    if (window.innerWidth > 768) {
      clearDesktopTooltipPosition(this.$tooltip);
    } else {
      applyMobileTooltipPosition(this.$tooltip);
    }
  }

  reposition() {
    if (this.tooltip_showing && this.current_obj && window.innerWidth <= 768) {
      this.show(this.current_obj, this.current_tile_context, this.isLocked, null);
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
      this.isVisible = false;
      this.$main.classList.remove("tooltip_showing");
      this.setElementVisible(this.$tooltip, false);
      this.tooltip_showing = false;
    }
  }

  async update() {
    this.game.performance.markStart("tooltip_update_total");
    if (!this.tooltip_showing || !this.current_obj) {
      return;
    }

    let tooltipBody = null;

    if (window.templateLoader?.loaded) {
      tooltipBody = window.templateLoader.cloneTemplate(
        "tooltip-body-template"
      );
    }

    if (!tooltipBody) {
      const fallbackDiv = document.createElement("div");
      fallbackDiv.innerHTML = `
        <div data-role="title" class="tooltip-title" style="margin-bottom: 0.5em;font-size: 1.1em;font-weight: bold;"></div>
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

    const titleEl = this.$tooltipContent.querySelector('[data-role="title"]');
    if (titleEl && this.current_obj?.title) {
      titleEl.textContent = this.current_obj.title;
    }

    if (this.isMobile) {
      populateMobileTooltip(this.$tooltipContent, this.current_obj, this.current_tile_context, this.game);
    } else {
      populateDesktopTooltip(this.$tooltipContent, this.current_obj, this.current_tile_context, this.game);
    }
    this.updateActionButtons(this.current_obj);
    this.game.performance.markEnd("tooltip_update_total");
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

    if (obj.upgrade && obj.level < obj.max_level) {
      const buyButton = document.createElement("button");
      let costText = "";

      if (obj.current_ecost !== undefined) {
        costText = ` 🧬 ${fmt(obj.current_ecost)} EP`;
      } else if (obj.ecost !== undefined) {
        costText = ` 🧬 ${fmt(obj.ecost)} EP`;
      } else if (obj.base_ecost !== undefined) {
        costText = ` 🧬 ${fmt(obj.base_ecost)} EP`;
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
          if (this.game.audio) this.game.audio.play('upgrade');
          this.game.upgradeset.check_affordability(this.game);
          this.update();
        } else {
          if (this.game.audio) this.game.audio.play('error');
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
