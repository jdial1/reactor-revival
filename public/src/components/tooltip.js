import { numFormat as fmt } from "../utils/util.js";

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

    // Desktop: Use CSS positioning for horizontal layout above top nav
    if (window.innerWidth > 768) {
      // For desktop, let CSS handle positioning (top: 0, centered)
      this.$tooltip.style.top = "";
      this.$tooltip.style.left = "";
      this.$tooltip.style.right = "";
      this.$tooltip.style.transform = "";
    } else {
      // Mobile: position tooltip to avoid parts panel overlap
      const tooltipEl = this.$tooltip;
      const partsPanel = document.getElementById("parts_section");
      const margin = 8;
      const sidePadding = 8;
      const gap = 8;

      // Position above the parts panel
      const top = margin;

      // Check if parts panel is open (not collapsed)
      const isPartsPanelOpen = partsPanel && !partsPanel.classList.contains("collapsed");
      const partsPanelWidth = isPartsPanelOpen && partsPanel 
        ? partsPanel.getBoundingClientRect().width 
        : 0;

      // Calculate left position: start after parts panel if open, otherwise use side padding
      const leftPosition = isPartsPanelOpen 
        ? partsPanelWidth + gap 
        : sidePadding;

      // Calculate right padding (always maintain side padding on right)
      const rightPadding = sidePadding;
      const viewportWidth = window.innerWidth;
      const maxWidth = viewportWidth - leftPosition - rightPadding;

      // Set positioning to prevent overflow and overlap
      tooltipEl.style.left = `${leftPosition}px`;
      tooltipEl.style.right = `${rightPadding}px`;
      tooltipEl.style.width = "";
      tooltipEl.style.maxWidth = `${maxWidth}px`;
      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.transform = "none";
      tooltipEl.style.boxSizing = "border-box";
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
    if (obj.upgrade) {
      const isMaxed = obj.level >= obj.max_level;
      stats.push(isMaxed ? "MAX" : `Level ${obj.level}/${obj.max_level}`);
    }

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
    if (mobileStatsEl) {
      if (obj.upgrade) {
        mobileStatsEl.style.display = '';
        mobileStatsEl.innerHTML = stats.join(" ");
      } else {
        mobileStatsEl.style.display = 'none';
        mobileStatsEl.innerHTML = '';
      }
    }

    const descEl = this.$tooltipContent.querySelector(
      '[data-role="description"]'
    );
    if (descEl) {
      const description = obj.description || obj.upgrade?.description;
      if (description) {
        descEl.innerHTML = this._formatDescriptionBulleted(description, iconify);
        if (obj.upgrade) descEl.classList.add("is-inset");
      } else {
        descEl.innerHTML = "";
      }
    }

    // Insert upgrade bonuses (mobile)
    const mobileBonusLines = this.getUpgradeBonusLines(obj, tile);
    if (mobileBonusLines.length > 0) {
      let bonusEl = this.$tooltipContent.querySelector('[data-role="bonus-lines"]');
      if (!bonusEl) {
        bonusEl = document.createElement('div');
        bonusEl.setAttribute('data-role', 'bonus-lines');
        bonusEl.className = 'tooltip-bonuses';
        descEl?.insertAdjacentElement('afterend', bonusEl);
      }
      // No section header; we only show the lines

      bonusEl.innerHTML = mobileBonusLines
        .map(line => `<div class="tooltip-bonus-line">${this._colorizeBonus(line)}</div>`)
        .join("");
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
    if (summaryEl) {
      if (obj.upgrade) {
        summaryEl.style.display = '';
        summaryEl.innerHTML = summaryItems.join("");
      } else {
        summaryEl.style.display = 'none';
        summaryEl.innerHTML = '';
      }
    }

    const descEl = this.$tooltipContent.querySelector(
      '[data-role="description"]'
    );
    if (descEl) {
      const description = obj.description || obj.upgrade?.description;
      if (description) {
        descEl.innerHTML = this._formatDescriptionBulleted(description, iconify);
        if (obj.upgrade) descEl.classList.add("is-inset");
      } else {
        descEl.innerHTML = "";
      }
    }

    // Insert upgrade bonuses (desktop)
    const bonusLines = this.getUpgradeBonusLines(obj, tile);
    if (bonusLines.length > 0) {
      let bonusEl = this.$tooltipContent.querySelector('[data-role="bonus-lines"]');
      if (!bonusEl) {
        bonusEl = document.createElement('div');
        bonusEl.setAttribute('data-role', 'bonus-lines');
        bonusEl.className = 'tooltip-bonuses';
        descEl?.insertAdjacentElement('afterend', bonusEl);
      }
      // No section header; we only show the lines
      bonusEl.innerHTML = bonusLines
        .map(line => `<div class="tooltip-bonus-line">${this._colorizeBonus(line)}</div>`)
        .join("");
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
      const withIcons = str
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
        .replace(/\bEP\b/g, "🧬 $&");

      // Highlight numbers preceding power/heat/tick terms after icon injection
      // Support compact units like 4K, 19M, 58B, and scientific e-notation
      const numWithUnit = "(?:\\d[\\d,.]*?(?:\\s*[kKmMbBtTqQ])?|\\d[\\d,.]*?(?:e[+\\-]?\\d+)?)";
      const rePower = new RegExp(`(\\b${numWithUnit}\\b)\\s+(power)\\s+(<img[^>]+alt=['\" ]power['\"][^>]*>)`, 'gi');
      const reHeat = new RegExp(`(\\b${numWithUnit}\\b)\\s+(heat)\\s+(<img[^>]+alt=['\" ]heat['\"][^>]*>)`, 'gi');
      const reTick = new RegExp(`(\\b${numWithUnit}\\b)\\s+(ticks?)\\s+(<img[^>]+alt=['\" ]tick['\"][^>]*>)`, 'gi');
      return withIcons
        .replace(rePower, '<span class="num power-num">$1</span> $2 $3')
        .replace(reHeat, '<span class="num heat-num">$1</span> $2 $3')
        .replace(reTick, '<span class="num tick-num">$1</span> $2 $3');
    };
  }

  // Convert a paragraph description into bulleted lines.
  // - Splits on sentence boundaries
  // - Trims whitespace
  // - Ignores empty results
  // - Applies the provided iconify function to each bullet item
  _formatDescriptionBulleted(description, iconifyFn) {
    const raw = String(description || "").trim();
    // Remove trailing periods from the entire description first
    const cleaned = raw.replace(/\.+$/, '');
    // Split on period + whitespace before an uppercase, digit or '(' to keep prior logic
    const parts = cleaned
      .split(/\.\s+(?=[A-Z(0-9])/g)
      .map(s => s.trim())
      .filter(Boolean)
      // Remove any remaining trailing periods from each part
      .map(s => s.replace(/\.+$/, ''));

    if (parts.length === 0) return '';

    const bullets = parts
      .map(line => `<div class="tooltip-bullet">${iconifyFn(line)}</div>`)
      .join("");

    return bullets;
  }

  // Wrap numeric deltas in pos/neg spans for colorizing
  _colorizeBonus(line) {
    if (!line) return line;
    // Replace patterns like +123%, -45%, +12/tick, etc.
    let result = line
      .replace(/([+][0-9]+(?:\.[0-9]+)?%?)/g, '<span class="pos">$1</span>')
      .replace(/([-][0-9]+(?:\.[0-9]+)?%?)/g, '<span class="neg">$1</span>')
      .replace(/([+][0-9]+(?:\.[0-9]+)?(?:\/[a-z]+)?)/gi, '<span class="pos">$1</span>')
      .replace(/([-][0-9]+(?:\.[0-9]+)?(?:\/[a-z]+)?)/gi, '<span class="neg">$1</span>');

    // Process multi-word terms first to avoid double-processing
    result = result.replace(/\b(venting|max heat|transfer|EP heat cap)\b/gi, (m) =>
      this.getIconifyFn()(m)
    );

    // Show text and icon together for key terms in bonus lines (exclude heat that's part of "max heat")
    result = result
      .replace(/\bpower\b/gi, "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>")
      .replace(/(?<!max\s)\bheat\b/gi, "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>")
      .replace(/\bduration\b/gi, "$& <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='time'>");
    return result;
  }

  // Build human-readable upgrade bonus lines that affect the given part
  getUpgradeBonusLines(obj, tile) {
    const lines = [];
    if (!obj || obj.upgrade) return lines;
    const upg = (id) => this.game.upgradeset.getUpgrade(id)?.level || 0;

    // Helper to format percent increase from a multiplier (e.g., 2^n)
    const pctFromMultiplier = (mult) => Math.round((mult - 1) * 100);
    // Helper to show explicit multiplicative scaling for doubling-style upgrades
    const multX = (level) => `x${Math.pow(2, level)}`;
    const stripPrefixes = (title) => (title || '').replace(/^(Basic |Advanced |Super |Wonderous |Ultimate )/, '');

    switch (obj.category) {
      case 'vent': {
        const tev = upg('improved_heat_vents'); // Thermal Emission Coating
        if (tev > 0) {
          const pct = tev * 100;
          lines.push(`+${pct}% venting`);
          lines.push(`+${pct}% max heat`);
        }
        const fh = upg('fluid_hyperdynamics');
        if (fh > 0) {
          const mult = Math.pow(2, fh);
          const pct = pctFromMultiplier(mult);
          lines.push(`+${pct}% venting`);
        }
        const fp = upg('fractal_piping');
        if (fp > 0) {
          const mult = Math.pow(2, fp);
          const pct = pctFromMultiplier(mult);
          lines.push(`+${pct}% max heat`);
        }
        const av = upg('active_venting');
        if (av > 0 && tile) {
          // Count adjacent capacitors similar to Part.getEffectiveVentValue
          let capCount = 0;
          if (tile.containmentNeighborTiles) {
            for (const neighbor of tile.containmentNeighborTiles) {
              if (neighbor.part && neighbor.part.category === 'capacitor') {
                capCount += neighbor.part.part.level || 1;
              }
            }
          }
          const pct = av * capCount;
          if (pct > 0) {
            lines.push(`+${pct}% venting from ${capCount} capacitor neighbors`);
          }
        }
        break;
      }
      case 'heat_exchanger': {
        const ihe = upg('improved_heat_exchangers');
        if (ihe > 0) lines.push(`<span class="pos">+${ihe * 100}%</span> transfer, <span class="pos">+${ihe * 100}%</span> max heat`);
        const fh = upg('fluid_hyperdynamics');
        if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> transfer`);
        const fp = upg('fractal_piping');
        if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
        break;
      }
      case 'heat_inlet':
      case 'heat_outlet': {
        const ihe = upg('improved_heat_exchangers');
        if (ihe > 0) lines.push(`<span class="pos">+${ihe * 100}%</span> transfer, <span class="pos">+${ihe * 100}%</span> max heat`);
        const fp = upg('fractal_piping');
        if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
        break;
      }
      case 'capacitor': {
        const iw = upg('improved_wiring');
        if (iw > 0) lines.push(`<span class="pos">+${iw * 100}%</span> power capacity, <span class="pos">+${iw * 100}%</span> max heat`);
        const qb = upg('quantum_buffering');
        if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> power capacity and max heat`);
        break;
      }
      case 'coolant_cell': {
        const icc = upg('improved_coolant_cells');
        if (icc > 0) lines.push(`<span class="pos">+${icc * 100}%</span> max heat`);
        const uc = upg('ultracryonics');
        if (uc > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, uc))}%</span> max heat`);
        break;
      }
      case 'reflector': {
        const ird = upg('improved_reflector_density');
        if (ird > 0) lines.push(`<span class="pos">+${ird * 100}%</span> duration`);
        const inr = upg('improved_neutron_reflection');
        if (inr > 0) lines.push(`<span class="pos">+${inr}%</span> power reflection`);
        const fsr = upg('full_spectrum_reflectors');
        if (fsr > 0) lines.push(`<span class="pos">+${fsr * 100}%</span> base power reflection`);
        break;
      }
      case 'reactor_plating': {
        const ia = upg('improved_alloys');
        if (ia > 0) lines.push(`<span class="pos">+${ia * 100}%</span> reactor max heat`);
        const qb = upg('quantum_buffering');
        if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> reactor max heat`);
        break;
      }
      case 'particle_accelerator': {
        const lvl = obj.level || 1;
        const id = lvl === 6 ? 'improved_particle_accelerators6' : 'improved_particle_accelerators1';
        const ipa = upg(id);
        if (ipa > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, ipa))}%</span> EP heat cap`);
        break;
      }
      case 'cell': {
        // Show multiplicative effect for cell-specific upgrades to avoid misleading huge % values
        const powerUpg = this.game.upgradeset.getUpgrade(`${obj.type}1_cell_power`);
        if (powerUpg?.level > 0) lines.push(`<span class="pos">+${(Math.pow(2, powerUpg.level) - 1) * 100}%</span> power`);
        const tickUpg = this.game.upgradeset.getUpgrade(`${obj.type}1_cell_tick`);
        if (tickUpg?.level > 0) lines.push(`<span class="pos">+${(Math.pow(2, tickUpg.level) - 1) * 100}%</span> duration`);
        const perpUpg = this.game.upgradeset.getUpgrade(`${obj.type}1_cell_perpetual`);
        if (perpUpg?.level > 0) lines.push(`Auto-replacement enabled`);

        // Global experimental boosts that affect cells
        const infused = upg('infused_cells');
        if (infused > 0) lines.push(`<span class="pos">+${(Math.pow(2, infused) - 1) * 100}%</span> power`);
        const unleashed = upg('unleashed_cells');
        if (unleashed > 0) lines.push(`<span class="pos">+${(Math.pow(2, unleashed) - 1) * 100}%</span> power and heat`);
        if (obj.type === 'protium') {
          const unstable = upg('unstable_protium');
          if (unstable > 0) {
            const durPct = Math.round((1 - 1 / Math.pow(2, unstable)) * 100);
            const totalPct = (Math.pow(2, unstable) - 1) * 100;
            lines.push(`<span class="pos">+${totalPct}%</span> power and heat, <span class="neg">-${durPct}%</span> duration`);
          }
        }
        break;
      }
      default:
        break;
    }
    return lines;
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
      // SHOW HEAT if containment > 0 OR if heat is present (for infinite buffer parts like outlets)
      if (obj.containment || tile.heat_contained > 0) {
        const maxHeat = obj.containment || "∞";
        const maxHeatDisplay = maxHeat === "∞" ? maxHeat : fmt(maxHeat, 0);
        stats.set(
          "Heat",
          `${fmt(tile.heat_contained || 0, 0)} / ${maxHeatDisplay}`
        );

        // Show segment information for heat components (simplified)
        if (this.game.engine && this.game.engine.heatManager) {
          const segment = this.game.engine.heatManager.getSegmentForTile(tile);
          if (segment) {
            const segmentFullness = segment.fullnessRatio * 100;
            stats.set(
              "Segment",
              `${fmt(segmentFullness, 1)}% full`
            );

            // Show segment cooling rate for vents
            if (obj.category === "vent" && segment.vents.length > 0) {
              let totalVentRate = 0;
              for (const vent of segment.vents) {
                totalVentRate += vent.getEffectiveVentValue();
              }
              stats.set(
                "Cooling",
                `${fmt(totalVentRate, 1)}/tick`
              );
            }

            // Show segment transfer rate for outlets/inlets (simplified)
            if (obj.category === "heat_outlet" && segment.outlets.length > 0) {
              let totalOutletRate = 0;
              for (const outlet of segment.outlets) {
                totalOutletRate += outlet.getEffectiveTransferValue();
              }
              const reactorFullness = this.game.reactor.max_heat > 0 ?
                this.game.reactor.current_heat / this.game.reactor.max_heat : 0;
              const effectiveTransferRate = totalOutletRate * reactorFullness * (1 - segment.fullnessRatio);
              stats.set(
                "Transfer",
                `${fmt(effectiveTransferRate, 1)}/tick`
              );
            }

            if (obj.category === "heat_inlet" && segment.inlets.length > 0) {
              let totalInletRate = 0;
              for (const inlet of segment.inlets) {
                totalInletRate += inlet.getEffectiveTransferValue();
              }
              const reactorFullness = this.game.reactor.max_heat > 0 ?
                this.game.reactor.current_heat / this.game.reactor.max_heat : 0;
              const effectiveTransferRate = totalInletRate * segment.fullnessRatio * (1 - reactorFullness);
              stats.set(
                "Transfer",
                `${fmt(effectiveTransferRate, 1)}/tick`
              );
            }
          }
        }
      }

      // Always show transfer rate for outlets/inlets to confirm they are functional
      if (obj.category === "heat_outlet" || obj.category === "heat_inlet") {
        if (!stats.has("Transfer")) {
          const transferVal = tile.getEffectiveTransferValue();
          stats.set("Max Transfer", `${fmt(transferVal, 1)}/tick`);
        }
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
