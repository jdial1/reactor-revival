// DOM Element Mapping Utility
// Provides a centralized way to access DOM elements and reduces getElementById calls

class DOMMapper {
  constructor() {
    this.elements = new Map();
    this.selectors = {
      // Static elements that exist at startup
      static: {
        splashContainer: "#splash-container",
        wrapper: "#wrapper",
      },

      // Splash screen elements (loaded dynamically)
      splash: {
        screen: "#splash-screen",
        status: "#splash-status",
        flavor: "#splash-flavor",
        spinner: ".splash-spinner",
        startOptions: ".splash-start-options",
        version: ".splash-version",
        stats: ".splash-stats",
      },

      // Splash buttons (created dynamically)
      splashButtons: {
        newGame: "#splash-new-game-btn",
        loadGame: "#splash-load-game-btn",
        loadCloud: "#splash-load-cloud-btn",
        uploadOption: "#splash-upload-option-btn",
        signIn: "#splash-signin-btn",
        signOut: "#splash-signout-btn",
      },

      // Main UI elements (loaded when game starts)
      ui: {
        reactor: "#reactor",
        reactorWrapper: "#reactor_wrapper",
        bottomNav: "#bottom_nav",
        mainTopNav: "#main_top_nav",
        splashCloseBtn: "#splash_close_btn",
      },

      // Game controls (loaded when game starts)
      controls: {
        autoSellToggle: "#auto_sell_toggle",
        autoBuyToggle: "#auto_buy_toggle",
        timeFluxToggle: "#time_flux_toggle",
        heatControlToggle: "#heat_control_toggle",
        pauseToggle: "#pause_toggle",
        reduceHeatBtnInfoBar: "#reduce_heat_btn_info_bar",
        sellBtnInfoBar: "#sell_btn_info_bar",
        rebootBtn: "#reboot_btn",
        refundBtn: "#refund_btn",
        fullscreenToggle: "#fullscreen_toggle",
      },

      // Debug elements (loaded when game starts)
      debug: {
        copyStateBtn: "#copy_state_btn",
        debugRefreshBtn: "#debug_refresh_btn",
      },

      // Tooltip elements (loaded when game starts)
      tooltip: {
        tooltip: "#tooltip",
        tooltipContent: "#tooltip_content",
        tooltipActions: "#tooltip_actions",
        tooltipCloseBtn: "#tooltip_close_btn",
      },

      // Parts panel (loaded when game starts)
      parts: {
        panel: "#parts_panel",
        panelBody: "#parts_panel_body",
        panelToggle: "#parts_panel_toggle",
      },

      // PWA elements (may exist at startup)
      pwa: {
        installButton: "#install_pwa_btn",
      },
    };
  }

  /**
   * Initialize DOM mapping - call this after DOM is ready
   */
  async init() {
    console.log("[DOM] Initializing DOM element mapping...");

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }

    // Map only static elements initially
    this.mapStaticElements();

    console.log(`[DOM] Mapped ${this.elements.size} static elements`);
    return this;
  }

  /**
   * Map only static elements that exist at startup
   */
  mapStaticElements() {
    for (const [name, selector] of Object.entries(this.selectors.static)) {
      const element = document.querySelector(selector);
      const key = `static.${name}`;

      if (element) {
        this.elements.set(key, element);
      } else {
        console.warn(`[DOM] Static element not found: ${selector} (${key})`);
      }
    }
  }

  /**
   * Map all elements defined in selectors
   */
  mapAllElements() {
    for (const [category, categorySelectors] of Object.entries(
      this.selectors
    )) {
      // Skip static elements as they're already mapped
      if (category === "static") continue;

      for (const [name, selector] of Object.entries(categorySelectors)) {
        const element = document.querySelector(selector);
        const key = `${category}.${name}`;

        if (element) {
          this.elements.set(key, element);
        } else {
          console.warn(`[DOM] Element not found: ${selector} (${key})`);
        }
      }
    }
  }

  /**
   * Map elements for a specific category
   */
  mapCategory(category) {
    if (!this.selectors[category]) {
      console.warn(`[DOM] Unknown category: ${category}`);
      return;
    }

    for (const [name, selector] of Object.entries(this.selectors[category])) {
      const element = document.querySelector(selector);
      const key = `${category}.${name}`;

      if (element) {
        this.elements.set(key, element);
        console.log(`[DOM] Mapped ${key}`);
      } else {
        console.warn(`[DOM] Element not found: ${selector} (${key})`);
      }
    }
  }

  /**
   * Get an element by its mapped key
   */
  get(key) {
    return this.elements.get(key);
  }

  /**
   * Get multiple elements by category
   */
  getCategory(category) {
    const categoryElements = {};
    for (const [key, element] of this.elements.entries()) {
      if (key.startsWith(`${category}.`)) {
        const name = key.split(".")[1];
        categoryElements[name] = element;
      }
    }
    return categoryElements;
  }

  /**
   * Check if an element exists
   */
  has(key) {
    return this.elements.has(key);
  }

  /**
   * Add a new element to the mapping
   */
  add(key, element) {
    if (element) {
      this.elements.set(key, element);
    }
  }

  /**
   * Remove an element from the mapping
   */
  remove(key) {
    this.elements.delete(key);
  }

  /**
   * Refresh mapping for dynamic content
   */
  refresh() {
    this.mapAllElements();
  }

  /**
   * Get all mapped elements
   */
  getAll() {
    return Object.fromEntries(this.elements);
  }

  /**
   * Debug: List all mapped elements
   */
  debug() {
    console.log("[DOM] Mapped elements:");
    for (const [key, element] of this.elements.entries()) {
      console.log(`  ${key}:`, element);
    }
  }
}

// Global DOM mapper instance
window.domMapper = new DOMMapper();

// Initialize on startup
window.domMapper.init().catch(console.error);

export default window.domMapper;
