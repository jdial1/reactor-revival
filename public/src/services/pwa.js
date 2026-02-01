import { numFormat as fmt, safeGetItem, safeSetItem, safeRemoveItem, escapeHtml } from "../utils/util.js";
import dataService from "./dataService.js";
import { supabaseSave } from "./SupabaseSave.js";
import { settingsModal } from "../components/settingsModal.js";
import {
  createNewGameButton,
  createLoadGameButton,
  createLoadGameButtonFullWidth,
  createUploadToCloudButton,
  createLoadFromCloudButton,
  createGoogleSignInButton,
  createGoogleSignOutButton,
  createLoadGameUploadRow,
  createTooltipCloseButton,
  createUpgradeButton,
  createPartButton,
  createBuyButton
} from "../components/buttonFactory.js";
import {
  createCloudSaveButton,
  createLoadingButton,
  createGoogleSignInButtonWithIcon,
  createInstallButton,
} from "../components/buttonFactory.js";

// Load flavor messages
let flavorMessages = [];
dataService.loadFlavorText().then(messages => {
  flavorMessages = messages;
}).catch(error => {
  console.warn("Failed to load flavor text:", error);
  flavorMessages = ["Loading..."];
});

// Game setup presets
const DIFFICULTY_PRESETS = {
  easy: { base_money: 25, base_max_heat: 1500, base_max_power: 120, base_loop_wait: 1200, base_manual_heat_reduce: 2, power_overflow_to_heat_pct: 0 },
  medium: { base_money: 10, base_max_heat: 1000, base_max_power: 100, base_loop_wait: 1000, base_manual_heat_reduce: 1, power_overflow_to_heat_pct: 50 },
  hard: { base_money: 5, base_max_heat: 750, base_max_power: 80, base_loop_wait: 800, base_manual_heat_reduce: 0.5, power_overflow_to_heat_pct: 100 }
};

async function showTechTreeSelection(game, pageRouter, ui, splashManager) {
  let overlay = document.getElementById("game-setup-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "game-setup-overlay";
    overlay.className = "game-setup-overlay bios-overlay";
    document.body.appendChild(overlay);
  }

  const techTreeData = await dataService.loadTechTree();
  if (!techTreeData || techTreeData.length === 0) {
    startNewGameFlow(game, pageRouter, ui, splashManager, null);
    return;
  }

  overlay.innerHTML = "";
  if (!window.templateLoader) return;
  const screen = window.templateLoader.cloneTemplateElement("game-setup-template");
  if (!screen) return;

  const doctrineContainer = screen.querySelector(".doctrine-cards");
  const difficultyCards = screen.querySelectorAll(".difficulty-card");
  const startBtn = screen.querySelector(".setup-start-btn");
  const backBtn = screen.querySelector(".setup-back-btn");

  let selectedDoctrine = null;
  let selectedDifficulty = null;

  const updateStartButton = () => {
    const canStart = selectedDoctrine !== null && selectedDifficulty !== null;
    startBtn.disabled = !canStart;
  };

  techTreeData.forEach((tree) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "doctrine-card";
    card.dataset.treeId = tree.id;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", "false");

    const title = document.createElement("span");
    title.className = "doctrine-card-title";
    title.textContent = tree.title;

    const subtitle = document.createElement("span");
    subtitle.className = "doctrine-card-subtitle";
    subtitle.textContent = tree.subtitle;

    card.appendChild(title);
    card.appendChild(subtitle);

    card.onclick = () => {
      doctrineContainer.querySelectorAll(".doctrine-card").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-selected", "false");
      });
      card.classList.add("selected");
      card.setAttribute("aria-selected", "true");
      selectedDoctrine = tree.id;
      updateStartButton();
    };

    doctrineContainer.appendChild(card);
  });

  difficultyCards.forEach((card) => {
    card.onclick = () => {
      difficultyCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedDifficulty = card.dataset.difficulty;
      updateStartButton();
    };
  });

  if (backBtn) {
    backBtn.onclick = () => {
      overlay.classList.add("hidden");
      setTimeout(() => overlay.remove(), 300);
    };
  }

  if (startBtn) {
    startBtn.onclick = async () => {
      if (!selectedDoctrine || !selectedDifficulty) return;

      const preset = DIFFICULTY_PRESETS[selectedDifficulty];
      game.base_money = preset.base_money;
      game.base_loop_wait = preset.base_loop_wait;
      game.base_manual_heat_reduce = preset.base_manual_heat_reduce;
      game.reactor.base_max_heat = preset.base_max_heat;
      game.reactor.base_max_power = preset.base_max_power;
      game.reactor.power_overflow_to_heat_ratio = preset.power_overflow_to_heat_pct / 100;

      overlay.classList.add("hidden");
      setTimeout(() => overlay.remove(), 300);
      try {
        await startNewGameFlow(game, pageRouter, ui, splashManager, selectedDoctrine);
      } catch (error) {
        console.error("[GAME-SETUP] Failed to start game:", error);
        alert("Failed to start game. Please try again.");
      }
    };
  }

  overlay.appendChild(screen);
  overlay.classList.remove("hidden");
}

window.showTechTreeSelection = showTechTreeSelection;

async function startNewGameFlow(game, pageRouter, ui, splashManager, techTreeId) {
    try {
        if (splashManager) {
            splashManager.hide();
        }
        await new Promise((resolve) => setTimeout(resolve, 600));

        if (typeof window.clearAllGameDataForNewGame === "function") {
            window.clearAllGameDataForNewGame(game);
        } else {
            try {
                safeRemoveItem("reactorGameSave");
                for (let i = 1; i <= 3; i++) safeRemoveItem(`reactorGameSave_${i}`);
                safeRemoveItem("reactorCurrentSaveSlot");
                safeRemoveItem("reactorGameQuickStartShown");
                safeRemoveItem("google_drive_save_file_id");
                safeSetItem("reactorNewGamePending", "1");
            } catch (_) { }
            delete game._saved_objective_index;
        }

        try {
            await game.initialize_new_game_state();
        } catch (error) {
            console.warn("[TECH-TREE] Error during game initialization (non-fatal):", error);
        }

        if (techTreeId) {
            game.tech_tree = techTreeId;
            console.log(`[GAME] Started with tech tree: ${techTreeId}`);
        }

        if (typeof window.startGame === "function") {
            await window.startGame(pageRouter, ui, game);
        } else {
            await pageRouter.loadGameLayout();
            ui.initMainLayout();
            await pageRouter.loadPage("reactor_section");
            game.startSession();
            game.engine.start();
        }

        safeRemoveItem("reactorNewGamePending");
    } catch (error) {
        console.error("[TECH-TREE] Error in startNewGameFlow:", error);
        console.error("[TECH-TREE] Error stack:", error.stack);
        throw error;
    }
}

let deferredPrompt;
const installButton = window.domMapper?.get("pwa.installButton");

/**
 * Get list of critical UI icon assets that should be preloaded
 * @returns {string[]} Array of image paths to preload
 */
function getCriticalUiIconAssets() {
  return [
    // UI Icons (actual existing files)
    'img/ui/icons/icon_cash.png',
    'img/ui/icons/icon_heat.png',
    'img/ui/icons/icon_power.png',
    'img/ui/icons/icon_time.png',
    'img/ui/icons/icon_inlet.png',
    'img/ui/icons/icon_outlet.png',
    'img/ui/icons/icon_vent.png',
    'img/ui/icons/icon_cash_outline.svg',
    'img/ui/icons/icon_copy.svg',
    'img/ui/icons/icon_deselect.svg',
    'img/ui/icons/icon_dropper.svg',
    'img/ui/icons/icon_paste.svg',

    // Status Icons (actual existing files)
    'img/ui/status/status_bolt.png',
    'img/ui/status/status_infinity.png',
    'img/ui/status/status_plus.png',
    'img/ui/status/status_star.png',
    'img/ui/status/status_time.png',

    // Navigation Icons (actual existing files)
    'img/ui/nav/nav_experimental.png',
    'img/ui/nav/nav_normal.png',
    'img/ui/nav/nav_pause.png',
    'img/ui/nav/nav_play.png',
    'img/ui/nav/nav_renew.png',
    'img/ui/nav/nav_unrenew.png',

    // Border Images (actual existing files)
    'img/ui/borders/button/button_border.png',
    'img/ui/borders/button/button_border_alt.png',
    'img/ui/borders/button/button_border_alt_active.png',
    'img/ui/borders/button/button_border_alt_down.png',
    'img/ui/borders/button/button_border_alt_down_active.png',
    'img/ui/borders/button/small_button_down.png',
    'img/ui/borders/button/small_button_off.png',
    'img/ui/borders/button/small_button_on.png',
    'img/ui/borders/panel/medium_panel.png',
    'img/ui/borders/panel/panel_border.png',
    'img/ui/borders/panel/panel_border_first_first.png',
    'img/ui/borders/panel/panel_border_first_last.png',
    'img/ui/borders/panel/panel_border_last_first.png',
    'img/ui/borders/panel/panel_border_last_last.png',
    'img/ui/borders/panel/panel_border_last_middle.png',

    // Inner UI Elements (actual existing files)
    'img/ui/inner/inner_border.png',
    'img/ui/inner/inner_border_alt.png',
    'img/ui/inner/inner_border_alt_active.png',
    'img/ui/inner/inner_border_alt_down.png',
    'img/ui/inner/inner_border_alt_flip.png',
    'img/ui/inner/inner_border_alt_flip_active.png',
    'img/ui/inner/inner_border_alt_flip_down.png',

    // Flow Indicators (actual existing files)
    'img/ui/flow/flow-arrow-down.svg',
    'img/ui/flow/flow-arrow-left.svg',
    'img/ui/flow/flow-arrow-right.svg',
    'img/ui/flow/flow-arrow-up.svg',

    // Effects (actual existing files)
    'img/ui/effects/explosion_map.png',

    // Connector
    'img/ui/connector_border.png',

    // Base tile for splash background
    'img/ui/tile.png',

    // Critical part images (tier 1 for initial loading)
    'img/parts/cells/cell_1_1.png',
    'img/parts/cells/cell_1_2.png',
    'img/parts/cells/cell_1_4.png',
    'img/parts/accelerators/accelerator_1.png',
    'img/parts/capacitors/capacitor_1.png',
    'img/parts/coolants/coolant_cell_1.png',
    'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png',
    'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png',
    'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png',
    'img/parts/valves/valve_1_1.png',
    'img/parts/valves/valve_1_2.png',
    'img/parts/valves/valve_1_3.png',
    'img/parts/valves/valve_1_4.png'
  ];
}

/**
 * Warm the image cache by preloading critical UI assets
 * @param {string[]} imagePaths - Array of image paths to preload
 * @returns {Promise<void>}
 */
async function warmImageCache(imagePaths) {
  console.log(`[PWA] Warming image cache for ${imagePaths.length} critical assets...`);

  const loadPromises = imagePaths.map(async (imagePath) => {
    try {
      // Create a new Image object to trigger loading
      const img = new Image();

      // Set up promise-based loading
      const loadPromise = new Promise((resolve, reject) => {
        img.onload = () => {
          resolve({ success: true, path: imagePath });
        };
        img.onerror = (error) => {
          resolve({ success: false, path: imagePath, error });
        };
      });

      // Start loading the image
      img.src = imagePath;

      return loadPromise;
    } catch (error) {
      return { success: false, path: imagePath, error };
    }
  });

  try {
    // Wait for all images to load (or fail gracefully)
    const results = await Promise.allSettled(loadPromises);

    const successful = results.filter(result =>
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failed = results.filter(result =>
      result.status === 'fulfilled' && !result.value.success
    ).length;

    console.log(`[PWA] Image cache warming complete: ${successful} successful, ${failed} failed`);

    // Only log failed assets to keep console clean
    if (failed > 0) {
      const failedAssets = results
        .filter(result => result.status === 'fulfilled' && !result.value.success)
        .map(result => result.value.path);
      console.warn(`[PWA] Failed to preload: ${failedAssets.join(', ')}`);
    }
  } catch (error) {
    console.warn('[PWA] Image cache warming encountered an error:', error);
  }
}

/**
 * Preload all part images for a specific tier
 * @param {number} tier - The tier to preload (1-6)
 * @returns {Promise<void>}
 */
async function preloadTierImages(tier) {
  const tierImages = partImagesByTier[tier] || [];
  if (tierImages.length === 0) {
    console.warn(`[PWA] No images found for tier ${tier}`);
    return;
  }

  console.log(`[PWA] Preloading ${tierImages.length} images for tier ${tier}...`);

  const loadPromises = tierImages.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve(imagePath);
        img.onerror = () => resolve(imagePath); // Don't fail on individual image errors
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      console.warn(`[PWA] Error preloading tier ${tier} image ${imagePath}:`, error);
      return imagePath;
    }
  });

  await Promise.allSettled(loadPromises);
  console.log(`[PWA] Tier ${tier} images preloaded`);
}

/**
 * Preload all part images progressively (tier by tier)
 * @returns {Promise<void>}
 */
async function preloadAllPartImages() {
  console.log('[PWA] Starting progressive preload of all part images...');

  // Preload tier by tier to avoid overwhelming the browser
  for (let tier = 1; tier <= maxTier; tier++) {
    await preloadTierImages(tier);
    // Small delay between tiers to prevent blocking
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('[PWA] All part images preloaded');
}

// Splash Screen Manager
class SplashScreenManager {
  constructor() {
    this.splashScreen = null;
    this.statusElement = null;
    this.flavorElement = null;



    this.loadingSteps = [
      { id: "init", message: "Initializing reactor systems..." },
      { id: "ui", message: "Calibrating control panels..." },
      { id: "game", message: "Spinning up nuclear protocols..." },
      { id: "parts", message: "Installing reactor components..." },
      { id: "upgrades", message: "Analyzing technological blueprints..." },
      { id: "objectives", message: "Briefing mission parameters..." },
      { id: "engine", message: "Achieving critical mass..." },
      { id: "ready", message: "Reactor online - All systems nominal!" },
    ];
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.flavorInterval = null;

    if (!safeGetItem("reactor_user_id")) {
      safeSetItem("reactor_user_id", crypto.randomUUID());
      console.log("[SPLASH] Generated new User ID for leaderboard tracking.");
    }

    this.readyPromise = this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;

    this.initSocketConnection();

    // Listen for service worker messages
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      });
    }

    // Listen for beforeinstallprompt event and show install button
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.installPrompt = e;
      console.log("Install prompt captured");
      const btn = window.domMapper?.get("pwa.installButton");
      if (btn) btn.classList.remove("hidden");
    });
  }

  async initSocketConnection() {
    if (typeof io === 'undefined') {
      console.warn('[SPLASH] Socket.IO not available');
      return;
    }

    try {
      const { LEADERBOARD_CONFIG } = await import('./leaderboard-config.js');
      const apiUrl = LEADERBOARD_CONFIG.API_URL;
      
      this.socket = io(apiUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      this.socket.on('connect', () => {
        console.log('[SPLASH] Socket.IO connected');
      });

      this.socket.on('userCount', (count) => {
        this.userCount = count;
        this.updateUserCountDisplay();
      });

      this.socket.on('disconnect', () => {
        console.log('[SPLASH] Socket.IO disconnected');
      });

      this.socket.on('connect_error', (error) => {
        console.warn('[SPLASH] Socket.IO connection error:', error);
      });
    } catch (error) {
      console.warn('[SPLASH] Failed to initialize Socket.IO:', error);
    }
  }

  updateUserCountDisplay() {
    const userCountElement = document.getElementById('user-count-text');
    if (userCountElement) {
        userCountElement.textContent = `${this.userCount}`;
    }
  }

  /**
   * Wait for DOM to be ready, then load splash screen
   */
  async waitForDOMAndLoad() {
    // Wait for DOM if it's not ready yet
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }

    console.log("[SPLASH] DOM ready, loading splash screen...");
    return this.loadSplashScreen();
  }



  /**
   * Load splash screen HTML from pages folder
   */
  async loadSplashScreen() {
    try {
      const response = await fetch("./pages/splash.html");
      const html = await response.text();

      // Insert HTML into container
      const container = window.domMapper?.get("static.splashContainer");
      if (container) {
        container.innerHTML = html;

        // Map splash elements after they're loaded
        window.domMapper?.mapCategory("splash");

        // Initialize element references after HTML is loaded
        this.splashScreen = window.domMapper?.get("splash.screen");
        this.statusElement = window.domMapper?.get("splash.status");
        this.flavorElement = window.domMapper?.get("splash.flavor");

        // Initialize splash screen stats
        await this.initializeSplashStats();
        
        // Update user count display after splash loads
        this.updateUserCountDisplay();

        // Proactively warm the cache for critical UI icon assets so images never
        // disappear during gameplay due to network hiccups or memory pressure
        try {
          await warmImageCache(getCriticalUiIconAssets());

          // Also preload all part images in the background
          // This runs asynchronously and won't block the splash screen
          preloadAllPartImages().catch(error => {
            console.warn("[PWA] Background part image preloading failed:", error);
          });
        } catch (e) {
          console.warn("[PWA] Failed to warm image cache:", e);
        }

        // Generate the splash background now that the element exists
        if (this.splashScreen) {
          generateSplashBackground();
        }

        console.log("[SPLASH] Splash screen loaded successfully");
        return true;
      } else {
        throw new Error("Splash container not found");
      }
    } catch (error) {
      console.error("Error loading splash screen:", error);
      return false;
    }
  }



  async initializeSplashStats() {
    if (!this.splashScreen) return;

    let version = "Unknown";
    try {
      // Try multiple approaches to get the version
      const { getResourceUrl } = await import("../utils/util.js");
      const versionUrl = getResourceUrl("version.json");
      console.log("Fetching version from:", versionUrl);

      let versionResponse;
      try {
        versionResponse = await fetch(versionUrl);
      } catch (urlError) {
        console.warn("Primary URL failed, trying direct path:", urlError);
        versionResponse = await fetch("/version.json");
      }

      console.log("Version response status:", versionResponse.status);
      console.log("Version response headers:", versionResponse.headers.get('content-type'));

      if (!versionResponse.ok) {
        throw new Error(`HTTP ${versionResponse.status}: ${versionResponse.statusText}`);
      }

      const responseText = await versionResponse.text();
      console.log("Version response text:", responseText.substring(0, 100));

      const versionData = JSON.parse(responseText);
      version = versionData.version || "Unknown";
    } catch (error) {
      console.warn("Could not load version info:", error);

      // Try to get local version from cache as fallback
      try {
        const localVersion = await this.getLocalVersion();
        if (localVersion) {
          version = localVersion;
          console.log("Using local cached version:", localVersion);
        } else {
          // If cache is empty (development mode), try direct local fetch
          try {
            const directResponse = await fetch("./version.json");
            if (directResponse.ok) {
              const directData = await directResponse.json();
              version = directData.version || "Unknown";
              console.log("Using direct local version:", version);
            }
          } catch (directError) {
            console.warn("Could not load direct local version:", directError);

            // Final fallback: try absolute path
            try {
              const absoluteResponse = await fetch("/version.json");
              if (absoluteResponse.ok) {
                const absoluteData = await absoluteResponse.json();
                version = absoluteData.version || "Unknown";
                console.log("Using absolute path version:", version);
              }
            } catch (absoluteError) {
              console.warn("Could not load absolute path version:", absoluteError);
            }
          }
        }
      } catch (localError) {
        console.warn("Could not load local version:", localError);
      }
    }


    this.addSplashStats(version);


    this.startVersionChecking();
  }


  addSplashStats(version) {
    const existingBottomRow = this.splashScreen.querySelector('.splash-bottom-row');
    if (existingBottomRow) existingBottomRow.remove();

    const versionSection = document.createElement('div');
    versionSection.className = 'splash-version-section';
    versionSection.title = 'Click to check for updates';
    versionSection.style.cursor = 'pointer';

    // Add click handler to the entire section
    versionSection.onclick = () => {
      this.triggerVersionCheckToast();
    };

    const versionDiv = document.createElement('span');
    versionDiv.className = 'splash-version';
    versionDiv.textContent = `Version ${version}`;

    versionSection.appendChild(versionDiv);

    this.splashScreen.appendChild(versionSection);

    window.domMapper?.add('splash.version', versionDiv);

    window.domMapper?.mapCategory('splash');
  }

  // Return list of critical UI asset paths to pre-cache
  // (helper functions declared after class)





  formatTime(ms) {
    ms = Number(ms);
    if (Number.isNaN(ms) || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / (1000 * 60)) % 60;
    const h = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (d > 0)
      return `${d}<span class="time-unit">d</span> ${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    if (h > 0)
      return `${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    if (m > 0)
      return `${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    return `${s}<span class="time-unit">s</span>`;
  }

  formatDateTime(timestamp) {
    if (!timestamp) return "Unknown";
    const date = new Date(Number(timestamp) || timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return "Just now";
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    if (this.splashScreen) {
      this.splashScreen.style.display = 'none';
    }

    let cloudSaveSlots = [];
    let isCloudAvailable = false;

    if (window.supabaseAuth && window.supabaseAuth.isSignedIn()) {
        try {
            const rawCloudSaves = await supabaseSave.getSaves();
            cloudSaveSlots = rawCloudSaves.map(s => {
                let data = {};
                try { data = JSON.parse(s.save_data); } catch (e) {}
                return {
                    slot: s.slot_id,
                    exists: true,
                    lastSaveTime: parseInt(s.timestamp),
                    totalPlayedTime: data.total_played_time || 0,
                    currentMoney: data.current_money || 0,
                    exoticParticles: data.exotic_particles || 0,
                    data: data,
                    isCloud: true
                };
            });
            isCloudAvailable = true;
        } catch (e) {
            console.error("Failed to load cloud saves", e);
        }
    }

    const saveSlotScreen = document.createElement("main");
    saveSlotScreen.id = "save-slot-screen";
    saveSlotScreen.className = "splash-screen";
    saveSlotScreen.style.position = "fixed";
    saveSlotScreen.style.top = "0";
    saveSlotScreen.style.left = "0";
    saveSlotScreen.style.width = "100%";
    saveSlotScreen.style.height = "100%";
    saveSlotScreen.style.zIndex = "999";
    saveSlotScreen.style.display = "flex";
    saveSlotScreen.style.flexDirection = "column";
    saveSlotScreen.style.alignItems = "center";
    saveSlotScreen.style.justifyContent = "center";
    saveSlotScreen.style.textAlign = "center";
    
    let html = '';
    
    if (isCloudAvailable) {
        html += '<h2 class="splash-menu-header" style="font-size: 1rem; color: #4caf50;">CLOUD SAVES</h2>';
        html += this.generateSaveSlotHTML(cloudSaveSlots, true);
        html += '<h2 class="splash-menu-header" style="font-size: 1rem; color: #aaa; margin-top: 1rem;">LOCAL SAVES</h2>';
    }

    html += this.generateSaveSlotHTML(localSaveSlots, false);

    saveSlotScreen.innerHTML = `
      <h1 class="splash-title">LOAD GAME</h1>
      <div class="splash-menu-panel" style="overflow-y: auto; max-height: 80vh;">
        <div class="splash-start-options">
          ${html}
          <div class="splash-btn-row">
            <button class="splash-btn splash-btn-exit" id="back-to-splash">Back</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(saveSlotScreen);

    saveSlotScreen.querySelectorAll('button[data-slot]:not([disabled])').forEach(button => {
      button.addEventListener('click', async (e) => {
        const slot = parseInt(e.currentTarget.dataset.slot);
        const isCloud = e.currentTarget.dataset.isCloud === 'true';
        if (isCloud) {
            const save = cloudSaveSlots.find(s => s.slot === slot);
            if (save) {
                await this.loadFromData(save.data);
            }
        } else {
            await this.loadFromSaveSlot(slot);
        }
      });
    });

    saveSlotScreen.querySelector('#back-to-splash').addEventListener('click', () => {
      saveSlotScreen.remove();
      if (this.splashScreen) {
        this.splashScreen.style.display = '';
      }
    });
  }

  generateSaveSlotHTML(saveSlots, isCloud) {
    let html = '';
    for (let i = 1; i <= 3; i++) {
      const slotData = saveSlots.find(slot => slot.slot === i);
      const isEmpty = !slotData;
      
      const label = isCloud ? `Cloud Slot ${i}` : `Local Slot ${i}`;

      html += `
        <div class="save-slot-container">
          <button class="save-slot-button ${isEmpty ? 'save-slot-button-disabled' : 'save-slot-button-filled'}"
            data-slot="${i}"
            data-is-cloud="${isCloud}"
            ${isEmpty ? 'disabled' : ''}>
            ${isEmpty ?
              `<div class="save-slot-row-1"><span class="save-slot-slot">${label}</span></div><div class="save-slot-empty">Empty</div>` :
              `
              <div class="save-slot-row-1">
                <span class="save-slot-slot">${label}</span>
                <span class="save-slot-time">${this.formatDateTime(slotData.lastSaveTime)}</span>
              </div>
              <div class="save-slot-row-2">
                <span class="save-slot-money">$${this.formatNumber(Number(slotData.currentMoney))}</span>
                <span class="save-slot-ep">${this.formatNumber(Number(slotData.exoticParticles))} EP</span>
                <span class="save-slot-playtime">Played: ${this.formatTime(Number(slotData.totalPlayedTime))}</span>
              </div>
              `
            }
          </button>
        </div>
      `;
    }
    return html;
  }

  formatNumber(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return "0";
    if (n >= 1000000) {
      return (n / 1000000).toFixed(1) + "M";
    } else if (n >= 1000) {
      return (n / 1000).toFixed(1) + "K";
    }
    return n.toString();
  }

  async loadFromSaveSlot(slot) {
    try {
      console.log(`[DEBUG] Loading from save slot: ${slot}`);

      const saveSlotEl = document.getElementById("save-slot-screen");
      if (saveSlotEl) saveSlotEl.remove();

      if (window.splashManager) {
        
        window.splashManager.hide();
      }
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Load the save data directly
      if (window.game) {
        
        const loadSuccess = await window.game.loadGame(slot);
        console.log(`[DEBUG] Load result: ${loadSuccess}`);

        if (loadSuccess && window.pageRouter && window.ui) {
          
          // Call the startGame function that should be available globally
          if (typeof window.startGame === "function") {
            
            await window.startGame(
              window.pageRouter,
              window.ui,
              window.game
            );
          } else {
            console.error("startGame function not available globally");
            // Fallback: try to trigger the game start manually
            await window.pageRouter.loadGameLayout();
            window.ui.initMainLayout();
            await window.pageRouter.loadPage("reactor_section");
            window.game.tooltip_manager = new (
              await import("../components/tooltip.js")
            ).TooltipManager("#main", "#tooltip", window.game);
            window.game.engine = new (
              await import("../core/engine.js")
            ).Engine(window.game);
            await window.game.startSession();
            window.game.engine.start();
          }
        } else {
          console.error("Failed to load game or missing dependencies");
        }
      } else {
        console.error("Game instance not available");
      }
    } catch (error) {
      console.error("Error loading from save slot:", error);
    }
  }

  /**
  * Start version checking for updates
  */
  startVersionChecking() {
    // Store current version for comparison
    this.currentVersion = null;

    // Listen for service worker messages about new versions
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
          this.handleNewVersion(event.data.version, event.data.currentVersion);
        }
      });
    }

    // Initial version check
    this.checkForNewVersion();

    // Set up periodic version checking (every 30 seconds)
    this.versionCheckInterval = setInterval(() => {
      this.checkForNewVersion();
    }, 30000);
  }

  /**
   * Check for new version
   */
  async checkForNewVersion() {
    try {
      // First, get the current local version
      const localResponse = await fetch('./version.json', { cache: 'no-cache' });

      if (!localResponse.ok) {
        console.warn(`Local version check failed with status: ${localResponse.status}`);
        return;
      }

      const contentType = localResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`Local version response is not JSON. Content-Type: ${contentType}`);
        return;
      }

      const localVersionData = await localResponse.json();
      const currentLocalVersion = localVersionData.version;

      if (!currentLocalVersion) {
        console.warn('Local version data missing or invalid:', localVersionData);
        return;
      }

      if (this.currentVersion === null) {
        this.currentVersion = currentLocalVersion;
      }

      // Check the deployed version for the latest release
      const latestVersion = await this.checkDeployedVersion();

      if (latestVersion && this.isNewerVersion(latestVersion, currentLocalVersion)) {
        this.handleNewVersion(latestVersion, currentLocalVersion);
      }
    } catch (error) {
      console.warn('Failed to check for new version:', error);
    }
  }

  /**
   * Check deployed version for the latest release
   */
  async checkDeployedVersion() {
    try {
      // Check if we're online first
      if (!navigator.onLine) {
        console.log('Offline - skipping deployed version check');
        return null;
      }

      // Skip version check in development mode (localhost)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Development mode - skipping deployed version check');
        return null;
      }

      // Use current origin for version check
      const { getBasePath } = await import("../utils/util.js");
      const basePath = getBasePath();
      const versionUrl = `${window.location.origin}${basePath}/version.json`;

      const response = await fetch(versionUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn('Failed to check deployed version:', error);
    }
    return null;
  }

  /**
   * Get local version from cache or service worker
   */
  async getLocalVersion() {
    try {
      // First try to get from cache
      const cache = await caches.open("static-resources");
      const { getBasePath } = await import("../utils/util.js");
      const basePath = getBasePath();
      const versionUrl = `${basePath}/version.json`;
      const response = await cache.match(versionUrl);
      if (response) {
        const data = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn("Failed to get local version from cache:", error);
    }

    // If cache fails, try direct fetch as fallback
    try {
      const { getResourceUrl } = await import("../utils/util.js");
      const versionUrl = getResourceUrl("version.json");
      const response = await fetch(versionUrl, { cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn("Failed to get local version from direct fetch:", error);
    }

    // If direct fetch fails, try to get from service worker
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Request version from service worker
        return new Promise((resolve) => {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.type === 'VERSION_RESPONSE') {
              resolve(event.data.version);
            } else {
              resolve(null);
            }
          };

          navigator.serviceWorker.controller.postMessage({
            type: 'GET_VERSION'
          }, [messageChannel.port2]);

          // Timeout after 2 seconds
          setTimeout(() => resolve(null), 2000);
        });
      }
    } catch (error) {
      console.warn("Failed to get local version from service worker:", error);
    }

    return null;
  }


  /**
   * Compare if a version is newer than the current version
   * Handles timestamp-based version format (25_09_05-2127)
   */
  isNewerVersion(deployedVersion, localVersion) {
    if (!deployedVersion || !localVersion) {
      return false;
    }
    return deployedVersion > localVersion;
  }

  /**
   * Handle new version detection
   */
  handleNewVersion(newVersion, currentVersion = null) {
    console.log('New version detected:', newVersion, 'Current version:', currentVersion);

    // Check if we've already notified about this version
    const lastNotifiedVersion = safeGetItem('reactor-last-notified-version');
    if (lastNotifiedVersion === newVersion) {
      console.log('Already notified about version:', newVersion);
      return;
    }

    // Show toast notification
    this.showUpdateToast(newVersion, currentVersion || this.currentVersion);

    // Find the version section and add flashing class
    const versionSection = this.splashScreen?.querySelector('.splash-version-section');
    if (versionSection) {
      versionSection.classList.add('new-version');
      versionSection.title = `New version available: ${newVersion} (Current: ${currentVersion || this.currentVersion})`;

      // Stop flashing after 30 seconds but keep the clickable state
      setTimeout(() => {
        versionSection.classList.remove('new-version');
        versionSection.title = `New version available: ${newVersion} (Current: ${currentVersion || this.currentVersion})`;
      }, 30000);
    }

    // Update current version and mark as notified
    this.currentVersion = newVersion;
    safeSetItem('reactor-last-notified-version', newVersion);
  }

  /**
   * Show update notification modal
   */
  showUpdateNotification(newVersion, currentVersion) {
    // Create modal overlay
    const modal = document.createElement("div");
    modal.className = "update-notification-modal";
    modal.innerHTML = `
      <div class="update-notification-content">
        <h3>🚀 Update Available!</h3>
        <p>A new version of Reactor Revival is available:</p>
        <div class="version-comparison">
          <div class="version-item">
            <span class="version-label">Current:</span>
            <span class="version-value current">${escapeHtml(currentVersion)}</span>
          </div>
          <div class="version-item">
            <span class="version-label">Latest:</span>
            <span class="version-value latest">${escapeHtml(newVersion)}</span>
          </div>
        </div>
        <p class="update-instruction">
          To get the latest version, refresh your browser or check for updates.
        </p>
        <div class="update-actions">
          <button class="update-btn refresh" onclick="window.location.reload()">
            🔄 Refresh Now
          </button>
          <button class="update-btn dismiss" onclick="this.closest('.update-notification-modal').remove()">
            ✕ Dismiss
          </button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .update-notification-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Minecraft', monospace;
      }
      
      .update-notification-content {
        background: #2a2a2a;
        border: 2px solid #4a4a4a;
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        text-align: center;
        color: #fff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }
      
      .update-notification-content h3 {
        margin: 0 0 15px 0;
        color: #4CAF50;
        font-size: 1.2em;
      }
      
      .version-comparison {
        margin: 15px 0;
        display: flex;
        justify-content: space-around;
        gap: 20px;
      }
      
      .version-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
      }
      
      .version-label {
        font-size: 0.9em;
        color: #ccc;
      }
      
      .version-value {
        font-size: 1.1em;
        font-weight: bold;
        padding: 5px 10px;
        border-radius: 4px;
      }
      
      .version-value.current {
        background: #f44336;
        color: white;
      }
      
      .version-value.latest {
        background: #4CAF50;
        color: white;
      }
      
      .update-instruction {
        margin: 15px 0;
        font-size: 0.9em;
        line-height: 1.4;
      }
      
      .update-instruction a {
        color: #4CAF50;
        text-decoration: none;
      }
      
      .update-instruction a:hover {
        text-decoration: underline;
      }
      
      .update-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin-top: 20px;
      }
      
      .update-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Minecraft', monospace;
        font-size: 0.9em;
        transition: background-color 0.2s;
      }
      
      .update-btn.refresh {
        background: #4CAF50;
        color: white;
      }
      
      .update-btn.refresh:hover {
        background: #45a049;
      }
      
      .update-btn.dismiss {
        background: #666;
        color: white;
      }
      
      .update-btn.dismiss:hover {
        background: #777;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    // Auto-remove after 30 seconds if not interacted with
    setTimeout(() => {
      if (document.body.contains(modal)) {
        modal.remove();
      }
    }, 30000);
  }

  /**
   * Show update toast notification
   */
  showUpdateToast(_newVersion, _currentVersion) {
    // Remove any existing toast
    const existingToast = document.querySelector('.update-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'update-toast';
    toast.innerHTML = `
      <div class="update-toast-content">
        <div class="update-toast-message">
          <span class="update-toast-icon">🚀</span>
          <span class="update-toast-text">A new version is available!</span>
        </div>
        <button id="refresh-button" class="update-toast-button">Refresh</button>
        <button class="update-toast-close" onclick="this.closest('.update-toast').remove()">×</button>
      </div>
    `;

    // Add toast styles if not already present
    if (!document.querySelector('#update-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'update-toast-styles';
      style.textContent = `
        .update-toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #2a2a2a;
          border: 2px solid #4CAF50;
          border-radius: 8px;
          padding: 0;
          z-index: 10000;
          font-family: 'Minecraft', monospace;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          animation: toast-slide-up 0.3s ease-out;
          max-width: 400px;
          width: 90%;
        }

        .update-toast-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          gap: 12px;
        }

        .update-toast-message {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          color: #fff;
        }

        .update-toast-icon {
          font-size: 1.2em;
        }

        .update-toast-text {
          font-size: 0.9em;
          font-weight: 500;
        }

        .update-toast-button {
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-family: 'Minecraft', monospace;
          font-size: 0.8em;
          cursor: pointer;
          transition: background-color 0.2s;
          white-space: nowrap;
        }

        .update-toast-button:hover {
          background: #45a049;
        }

        .update-toast-close {
          background: transparent;
          color: #ccc;
          border: none;
          font-size: 1.2em;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .update-toast-close:hover {
          color: #fff;
        }

        @keyframes toast-slide-up {
          from {
            transform: translateX(-50%) translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .update-toast {
            bottom: 10px;
            left: 10px;
            right: 10px;
            transform: none;
            max-width: none;
            width: auto;
          }

          .update-toast-content {
            padding: 10px 12px;
            gap: 8px;
          }

          .update-toast-text {
            font-size: 0.8em;
          }

          .update-toast-button {
            padding: 6px 12px;
            font-size: 0.75em;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Add toast to page
    document.body.appendChild(toast);

    // Set up refresh button click handler
    const refreshButton = toast.querySelector('#refresh-button');
    refreshButton.addEventListener('click', () => {
      // Send message to service worker to skip waiting and activate new version
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      // Reload the page to apply the update
      window.location.reload();
    });

    // Auto-remove toast after 10 seconds
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove();
          }
        }, 300);
      }
    }, 10000);
  }

  /**
   * Trigger version check and show toast notification
   */
  async triggerVersionCheckToast() {
    console.log('Manual version check triggered via hotkey');

    try {
      // Get current version
      const currentVersion = await this.getLocalVersion() || "Unknown";
      console.log(`Local version detected: ${currentVersion}`);

      // Check for deployed version
      const deployedVersion = await this.checkDeployedVersion();
      console.log(`Deployed version detected: ${deployedVersion}`);

      if (deployedVersion && this.isNewerVersion(deployedVersion, currentVersion)) {
        this.showUpdateToast(deployedVersion, currentVersion);
        console.log(`Version check complete: New version ${deployedVersion} available (current: ${currentVersion})`);
      } else if (deployedVersion && deployedVersion === currentVersion) {
        this.showVersionCheckToast(`You're running the latest version: ${currentVersion}`, 'info');
        console.log(`Version check complete: Up to date (${currentVersion})`);
      } else if (deployedVersion && !this.isNewerVersion(deployedVersion, currentVersion) && deployedVersion !== currentVersion) {
        this.showVersionCheckToast(`Current version: ${currentVersion} (Deployed: ${deployedVersion})`, 'warning');
        console.log(`Version check complete: Current version ${currentVersion} is newer than deployed ${deployedVersion}`);
      } else {
        this.showVersionCheckToast(`Current version: ${currentVersion} (Unable to check for updates)`, 'warning');
        console.log(`Version check complete: Current version ${currentVersion} (deployed check failed)`);
      }
    } catch (error) {
      console.error('Version check failed:', error);
      this.showVersionCheckToast('Version check failed. Please try again later.', 'error');
    }
  }

  /**
   * Show version check toast notification
   */
  showVersionCheckToast(message, type = "info") {
    // Remove any existing toast
    const existingToast = document.querySelector(".version-check-toast");
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement("div");
    toast.className = "version-check-toast";
    toast.innerHTML = `
      <div class="version-check-toast-content">
        <div class="version-check-toast-message">
          <span class="version-check-toast-icon">${
            type === "info" ? "ℹ️" : type === "warning" ? "⚠️" : "❌"
          }</span>
          <span class="version-check-toast-text">${escapeHtml(message)}</span>
        </div>
        <button class="version-check-toast-close" onclick="this.closest('.version-check-toast').remove()">×</button>
      </div>
    `;

    // Add toast styles if not already present
    if (!document.querySelector('#version-check-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'version-check-toast-styles';
      style.textContent = `
        .version-check-toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #2a2a2a;
          border: 2px solid ${type === 'info' ? '#2196F3' : type === 'warning' ? '#FF9800' : '#f44336'};
          border-radius: 8px;
          padding: 0;
          z-index: 10000;
          font-family: 'Minecraft', monospace;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          animation: toast-slide-up 0.3s ease-out;
          max-width: 400px;
          width: 90%;
        }

        .version-check-toast-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          gap: 12px;
        }

        .version-check-toast-message {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .version-check-toast-icon {
          font-size: 1.2em;
        }

        .version-check-toast-text {
          color: #fff;
          font-size: 0.9em;
          line-height: 1.4;
        }

        .version-check-toast-close {
          background: transparent;
          color: #ccc;
          border: none;
          font-size: 1.2em;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .version-check-toast-close:hover {
          color: #fff;
        }

        @media (max-width: 480px) {
          .version-check-toast {
            bottom: 10px;
            left: 10px;
            right: 10px;
            transform: none;
            max-width: none;
            width: auto;
          }

          .version-check-toast-content {
            padding: 10px 12px;
            gap: 8px;
          }

          .version-check-toast-text {
            font-size: 0.8em;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Add toast to page
    document.body.appendChild(toast);

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove();
          }
        }, 300);
      }
    }, 5000);
  }

  /**
   * Clear version notification when user updates
   */
  clearVersionNotification() {
    safeRemoveItem('reactor-last-notified-version');
    const versionSection = this.splashScreen?.querySelector('.splash-version-section');
    if (versionSection) {
      versionSection.classList.remove('new-version');
      // Keep the click handler and cursor pointer for version checking
      versionSection.title = 'Click to check for updates';
    }
  }

  /**
   * Ensure splash screen is ready before executing methods
   */
  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    // Don't do anything if elements aren't ready yet
    if (!this.statusElement) {
      console.warn(
        "[SPLASH] Status element not ready, skipping update:",
        message
      );
      return;
    }

    this.statusElement.textContent = message;
    this.statusElement.classList.add("splash-element-visible");

    // Start showing flavor text when loading begins
    if (!this.flavorInterval && this.flavorElement) {
      this.startFlavorText();
    }
  }

  startFlavorText() {
    if (!this.flavorElement) {
      console.warn(
        "[SPLASH] Cannot start flavor text - flavor element not found"
      );
      return;
    }

    console.log(
      "[SPLASH] Flavor text element ready - will be controlled by loading steps"
    );


  }

  showRandomFlavorText() {
    if (!this.flavorElement) return;

    const randomIndex = Math.floor(Math.random() * flavorMessages.length);
    const message = flavorMessages[randomIndex];
    this.flavorElement.textContent = message;


  }

  stopFlavorText() {
    if (this.flavorInterval) {
      clearInterval(this.flavorInterval);
      this.flavorInterval = null;
    }
    if (this.flavorElement) {
      this.flavorElement.classList.remove("splash-element-visible");
      this.flavorElement.classList.add("splash-element-hidden");
    }
  }

  nextStep() {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      this.updateStatus(step.message);
    }
  }

  async setStep(stepId) {
    await this.ensureReady();
    const stepIndex = this.loadingSteps.findIndex((step) => step.id === stepId);
    if (stepIndex !== -1) {
      this.currentStep = stepIndex;
      const step = this.loadingSteps[this.currentStep];

      // Hide the status element and use flavor element for everything
      if (this.statusElement) {
        this.statusElement.classList.add("splash-element-hidden");
      }

      // Show flavor text instead of boring step messages
      if (flavorMessages && flavorMessages.length > 0 && this.flavorElement) {
        const randomIndex = Math.floor(Math.random() * flavorMessages.length);
        const flavorMessage = flavorMessages[randomIndex];
        this.flavorElement.textContent = flavorMessage;
        this.flavorElement.classList.remove("splash-element-hidden");
        this.flavorElement.classList.add("splash-element-visible");


      } else {
        // Fallback to status element with original message if no flavor text available
        if (this.statusElement) {
          this.statusElement.classList.add("splash-element-visible");
          this.statusElement.textContent = step.message;
        }


      }


    }
  }

  async setSubStep(message) {
    await this.ensureReady();

    // Hide status element and show flavor text instead
    if (this.statusElement) {
      this.statusElement.classList.add("splash-element-hidden");
    }

    if (flavorMessages && flavorMessages.length > 0 && this.flavorElement) {
      const randomIndex = Math.floor(Math.random() * flavorMessages.length);
      const flavorMessage = flavorMessages[randomIndex];
      this.flavorElement.textContent = flavorMessage;
      this.flavorElement.classList.remove("splash-element-hidden");
      this.flavorElement.classList.add("splash-element-visible");


    } else {
      // Fallback to status element
      if (this.statusElement) {
        this.statusElement.classList.add("splash-element-visible");
        this.statusElement.textContent = message;
      }
    }
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (this.splashScreen && !this.isReady) {
      this.stopFlavorText();
      const spinner = window.domMapper?.get("splash.spinner");
      if (spinner) spinner.classList.add("splash-element-hidden");
      if (this.statusElement) this.statusElement.classList.add("splash-element-hidden");
      // Ensure flavor text is visible when menu is shown
      if (this.flavorElement && flavorMessages && flavorMessages.length > 0) {
        if (!this.flavorElement.textContent) {
          const randomIndex = Math.floor(Math.random() * flavorMessages.length);
          this.flavorElement.textContent = flavorMessages[randomIndex];
        }
        this.flavorElement.classList.remove("splash-element-hidden");
        this.flavorElement.classList.add("splash-element-visible");
      }
      let startOptionsSection = window.domMapper?.get("splash.startOptions");
      if (!startOptionsSection) {
        startOptionsSection = document.createElement("div");
        startOptionsSection.id = "splash-start-options";
        this.splashScreen.querySelector('.splash-menu-panel').appendChild(startOptionsSection);
      }
      startOptionsSection.innerHTML = "";

      // Check for saves in new multi-slot format and old format
      let hasSave = false;
      let saveSlots = [];

      if (canLoadGame) {
        // Check new slot format first
        for (let i = 1; i <= 3; i++) {
          const slotSave = safeGetItem(`reactorGameSave_${i}`);
          if (slotSave) {
            try {
              const slotData = JSON.parse(slotSave);
              saveSlots.push({
                slot: i,
                exists: true,
                lastSaveTime: slotData.last_save_time || null,
                totalPlayedTime: slotData.total_played_time || 0,
                currentMoney: slotData.current_money || 0,
                exoticParticles: slotData.exotic_particles || 0,
                data: slotData
              });
              hasSave = true;
            } catch (e) {
              console.error(`Error parsing save slot ${i}:`, e);
            }
          }
        }

        // If no new format saves, check old format
        if (!hasSave) {
          const localSaveJSON = safeGetItem("reactorGameSave");
          if (localSaveJSON) {
            try {
              const oldSaveData = JSON.parse(localSaveJSON);
              saveSlots.push({
                slot: 'legacy',
                exists: true,
                lastSaveTime: oldSaveData.last_save_time || null,
                totalPlayedTime: oldSaveData.total_played_time || 0,
                currentMoney: oldSaveData.current_money || 0,
                exoticParticles: oldSaveData.exotic_particles || 0,
                data: oldSaveData
              });
              hasSave = true;
            } catch (e) {
              console.error("Error parsing legacy save:", e);
            }
          }
        }
      }

      let cloudSaveOnly = false;
      let cloudSaveData = null;
      if (!hasSave && window.googleDriveSave && window.googleDriveSave.isConfigured) {
        try {
          const isSignedIn = await window.googleDriveSave.checkAuth(true);
          if (isSignedIn) {
            const fileFound = await window.googleDriveSave.findSaveFile();
            if (fileFound) {
              cloudSaveOnly = true;
              try {
                cloudSaveData = await window.googleDriveSave.load();
              } catch {
                cloudSaveData = null;
              }
            }
          }
        } catch {
          // Ignore errors during cloud save check
        }
      }
      let skipCloudButton = false;
      // 1. Continue button (if save exists, loads most recent save)
      if (hasSave) {
        // Find the most recent save
        let mostRecentSave = null;
        let mostRecentTime = 0;

        for (const saveSlot of saveSlots) {
          if (saveSlot.lastSaveTime && saveSlot.lastSaveTime > mostRecentTime) {
            mostRecentTime = saveSlot.lastSaveTime;
            mostRecentSave = saveSlot;
          }
        }

        if (mostRecentSave) {
          const playedTimeStr = this.formatTime(mostRecentSave.totalPlayedTime || 0);
          const continueButton = createLoadGameButtonFullWidth(
            mostRecentSave.data,
            playedTimeStr,
            false,
            async () => {
              try {
                console.log(`[DEBUG] Continue button clicked - loading slot: ${mostRecentSave.slot}`);

                // Hide splash manager
                if (window.splashManager) {
                  
                  window.splashManager.hide();
                }
                await new Promise((resolve) => setTimeout(resolve, 600));

                // Load the save data directly
                if (window.game) {
                  
                  const loadSuccess = await window.game.loadGame(mostRecentSave.slot);
                  console.log(`[DEBUG] Load result: ${loadSuccess}`);

                  if (loadSuccess && window.pageRouter && window.ui) {
                    
                    // Call the startGame function that should be available globally
                    if (typeof window.startGame === "function") {
                      
                      await window.startGame(
                        window.pageRouter,
                        window.ui,
                        window.game
                      );
                    } else {
                      console.error("startGame function not available globally");
                      // Fallback: try to trigger the game start manually
                      await window.pageRouter.loadGameLayout();
                      window.ui.initMainLayout();
                      await window.pageRouter.loadPage("reactor_section");
                      window.game.tooltip_manager = new (
                        await import("../components/tooltip.js")
                      ).TooltipManager("#main", "#tooltip", window.game);
                      window.game.engine = new (
                        await import("../core/engine.js")
                      ).Engine(window.game);
                      await window.game.startSession();
                      window.game.engine.start();
                    }
                  } else {
                    console.error("Failed to load game or missing dependencies");
                  }
                } else {
                  console.error("Game instance not available");
                }
              } catch (error) {
                console.error("Error loading game:", error);
              }
            }
          );
          if (continueButton) {
            continueButton.classList.add("splash-btn-continue");
            const header = continueButton.querySelector(".load-game-header span");
            if (header) {
              header.textContent = "Continue";
            }
            const detailsElement = continueButton.querySelector(".load-game-details");
            if (detailsElement) {
              detailsElement.remove();
            }
            startOptionsSection.appendChild(continueButton);
          }
        }
      }

      // Handle cloud saves separately if they exist (cloud continue)
      if (cloudSaveOnly && cloudSaveData && !hasSave) {
        const playedTimeStr = this.formatTime(cloudSaveData.total_played_time || 0);
        const cloudLoadButton = createLoadGameButtonFullWidth(
          cloudSaveData,
          playedTimeStr,
          true,
          () => this.hide()
        );
        if (cloudLoadButton) {
          cloudLoadButton.classList.add("splash-btn-continue");
          const syncedLabel = cloudLoadButton.querySelector('.synced-label');
          if (syncedLabel) syncedLabel.remove();
          const header = cloudLoadButton.querySelector(".load-game-header span");
          if (header) {
            header.textContent = "Continue from Cloud";
          }
          const detailsElement = cloudLoadButton.querySelector(".load-game-details");
          if (detailsElement) {
            detailsElement.remove();
          }
          const labelElement = document.createElement("div");
          labelElement.className = "continue-label";
          labelElement.textContent = "";
          cloudLoadButton.appendChild(labelElement);
          startOptionsSection.appendChild(cloudLoadButton);
        }
        skipCloudButton = true;
      }

      // 2. Add spacer if we have a continue button
      if (hasSave || (cloudSaveOnly && cloudSaveData && !hasSave)) {
        const spacer = document.createElement("div");
        spacer.className = "splash-spacer";
        spacer.style.height = "1rem";
        startOptionsSection.appendChild(spacer);
      }

      // 3. New Game button
      const newGameButton = createNewGameButton(async () => {
        if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten.")) {
          return;
        }
        try {
          console.log("[TECH-TREE] New Game button clicked - showing tech tree selection");
          console.log("[TECH-TREE] Checking prerequisites:", {
            game: !!window.game,
            pageRouter: !!window.pageRouter,
            ui: !!window.ui,
            splashManager: !!this,
            templateLoader: !!window.templateLoader,
            dataService: !!window.dataService
          });
          if (window.game) {
            console.log("[TECH-TREE] Calling showTechTreeSelection...");
            await showTechTreeSelection(window.game, window.pageRouter, window.ui, this);
            console.log("[TECH-TREE] showTechTreeSelection returned");
          } else {
            console.error("[TECH-TREE] Game instance not available for tech tree selection");
          }
        } catch (error) {
          console.error("[TECH-TREE] Error showing tech tree selection:", error);
          console.error("[TECH-TREE] Error stack:", error.stack);
        }
      });
      if (newGameButton) {
        newGameButton.textContent = hasSave ? "New Game" : "New Game";
        startOptionsSection.appendChild(newGameButton);
      } else {
        console.error("Failed to create new game button - template may be missing");
      }

      // 4. Load Game button (always shown)
      const loadGameButton = document.createElement("button");
      loadGameButton.className = "splash-btn splash-btn-load";

      loadGameButton.innerHTML = `
        <div class="load-game-header">
          <span>Load Game</span>
        </div>
      `;

      loadGameButton.onclick = () => this.showSaveSlotSelection(saveSlots);
      startOptionsSection.appendChild(loadGameButton);
      
      const settingsButton = document.createElement("button");
      settingsButton.className = "splash-btn";
      settingsButton.textContent = "Settings";
      settingsButton.onclick = () => {
        settingsModal.show();
      };
      startOptionsSection.appendChild(settingsButton);
      const exitButton = document.createElement("button");
      exitButton.className = "splash-btn splash-btn-exit";
      exitButton.textContent = "Exit";
      exitButton.onclick = () => {
        if (confirm("Are you sure you want to exit?")) {
          window.close();
          if (window.opener) {
            window.opener.focus();
          } else {
            window.location.href = 'about:blank';
          }
        }
      };
      startOptionsSection.appendChild(exitButton);

      const supabaseAuthArea = document.createElement("div");
      supabaseAuthArea.id = "splash-supabase-auth";
      this.setupSupabaseAuth(supabaseAuthArea);
      const authRow = this.splashScreen.querySelector("#splash-auth-row");
      if (authRow) {
        authRow.innerHTML = "";
        authRow.appendChild(supabaseAuthArea);
      } else {
        supabaseAuthArea.style.marginTop = "1rem";
        startOptionsSection.appendChild(supabaseAuthArea);
      }
      
      startOptionsSection.classList.add("visible");
      setTimeout(() => startOptionsSection.classList.add("show"), 100);
      window.domMapper?.mapCategory("splashButtons");
      window.domMapper?.add("splash.startOptions", startOptionsSection);
    }
  }

  async setupSupabaseAuth(container) {
    if (window.googleDriveSave) {
      await window.googleDriveSave.checkAuth(true);
    }
    if (window.supabaseAuth && window.supabaseAuth.refreshToken && !window.supabaseAuth.isSignedIn()) {
      await window.supabaseAuth.refreshAccessToken();
    }

    const googleSignedIn = window.googleDriveSave && window.googleDriveSave.isSignedIn;
    let googleUserInfo = null;
    if (googleSignedIn) {
      googleUserInfo = window.googleDriveSave.getUserInfo();
      if (!googleUserInfo && window.googleDriveSave.authToken) {
        try {
          const userResponse = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=user",
            {
              headers: { Authorization: `Bearer ${window.googleDriveSave.authToken}` },
            }
          );
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.user) {
              googleUserInfo = {
                id: userData.user.permissionId || userData.user.emailAddress,
                email: userData.user.emailAddress,
                name: userData.user.displayName,
                imageUrl: userData.user.photoLink
              };
              window.googleDriveSave.userInfo = googleUserInfo;
              safeSetItem("google_drive_user_info", JSON.stringify(googleUserInfo));
            }
          }
        } catch (error) {
          console.error("Error fetching Google user info:", error);
        }
      }
    }
    
    const supabaseSignedIn = window.supabaseAuth && window.supabaseAuth.isSignedIn();
    const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;

    const isAnySignedIn = googleSignedIn || supabaseSignedIn;

    if (isAnySignedIn) {
      const signedInDiv = document.createElement("div");
      signedInDiv.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; border: 2px solid rgb(62, 207, 142); border-radius: 4px; background-color: rgba(62, 207, 142, 0.1);";
      
      let userEmail = "";
      let authIcon = "";
      
      if (googleUserInfo) {
        const fullEmail = googleUserInfo.email || "";
        userEmail = fullEmail.length > 10 ? fullEmail.substring(0, 10) + "..." : fullEmail;
        authIcon = `
          <svg width="16" height="16" viewBox="0 0 24 24" style="margin-right: 0.5rem; vertical-align: middle;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        `;
      } else if (supabaseUser) {
        const fullEmail = supabaseUser.email || "";
        userEmail = fullEmail.length > 10 ? fullEmail.substring(0, 10) + "..." : fullEmail;
        authIcon = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem; vertical-align: middle;">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        `;
      }
      
      if (userEmail) {
        const emailDisplay = document.createElement("div");
        emailDisplay.style.cssText = "display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 0.8rem; font-weight: bold; color: rgb(62, 207, 142); gap: 0.5rem;";
        
        const emailContent = document.createElement("div");
        emailContent.style.cssText = "display: flex; align-items: center; flex: 1; min-width: 0;";
        emailContent.innerHTML = authIcon;
        const emailSpan = document.createElement("span");
        emailSpan.style.cssText = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        emailSpan.textContent = userEmail;
        emailContent.appendChild(emailSpan);
        emailDisplay.appendChild(emailContent);
        
        const logoutBtn = document.createElement("button");
        logoutBtn.innerHTML = "✕";
        logoutBtn.style.cssText = "background-color: #d32f2f; color: white; border: 1px solid #b71c1c; border-radius: 4px; padding: 0.25rem 0.5rem; font-size: 1rem; cursor: pointer; font-weight: bold; flex-shrink: 0; line-height: 1; min-width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;";
        logoutBtn.addEventListener("click", async () => {
          if (supabaseSignedIn && window.supabaseAuth) {
            window.supabaseAuth.signOut();
          }
          if (googleSignedIn && window.googleDriveSave) {
            if (window.googleDriveSave.signOut) {
              await window.googleDriveSave.signOut();
            } else {
              window.googleDriveSave.isSignedIn = false;
              window.googleDriveSave.authToken = null;
              safeRemoveItem("google_drive_auth_token");
              safeRemoveItem("google_drive_user_info");
            }
          }
          container.innerHTML = "";
          await this.setupSupabaseAuth(container);
        });
        emailDisplay.appendChild(logoutBtn);
        
        signedInDiv.appendChild(emailDisplay);
      }
      
      container.appendChild(signedInDiv);
    } else {
      const buttonRow = document.createElement("div");
      buttonRow.className = "splash-auth-buttons";
      
      const googleBtn = document.createElement("button");
      googleBtn.className = "splash-btn splash-btn-google";
      googleBtn.style.flex = "1";
      googleBtn.innerHTML = `
        <div class="google-signin-container">
          <svg width="24" height="24" viewBox="0 0 24 24" class="google-icon">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span>Google</span>
        </div>
      `;
      googleBtn.addEventListener("click", async () => {
        if (window.googleDriveSave) {
          try {
            await window.googleDriveSave.signIn();
            await window.googleDriveSave.checkAuth(false);
            container.innerHTML = "";
            this.setupSupabaseAuth(container);
          } catch (error) {
            console.error("Google sign-in error:", error);
          }
        }
      });
      buttonRow.appendChild(googleBtn);

      const emailBtn = document.createElement("button");
      emailBtn.className = "splash-btn";
      emailBtn.style.flex = "1";
      emailBtn.textContent = "Email";
      buttonRow.appendChild(emailBtn);
      container.appendChild(buttonRow);

      const authForm = document.createElement("div");
      authForm.id = "splash-email-auth-form";
      authForm.style.display = "none";
      authForm.style.flexDirection = "column";
      authForm.style.gap = "0.5rem";
      authForm.innerHTML = `
        <input type="email" id="splash-supabase-email" placeholder="Email" class="pixel-input" style="padding: 0.5rem; font-size: 0.8rem;">
        <input type="password" id="splash-supabase-password" placeholder="Password" class="pixel-input" style="padding: 0.5rem; font-size: 0.8rem;">
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="splash-btn" id="splash-supabase-signin" style="flex: 1; min-width: 100px; background-color: #3ecf8e; border-color: #2b9e6b;">Sign In</button>
          <button class="splash-btn" id="splash-supabase-signup" style="flex: 1; min-width: 100px; background-color: #3ecf8e; border-color: #2b9e6b;">Sign Up</button>
          <button class="splash-btn" id="splash-supabase-reset" style="flex: 1; min-width: 100px; background-color: #3ecf8e; border-color: #2b9e6b;">Reset</button>
        </div>
        <div id="splash-supabase-message" style="font-size: 0.7rem; min-height: 1.5rem; text-align: center;"></div>
      `;
      container.appendChild(authForm);

      emailBtn.addEventListener("click", () => {
        const isVisible = authForm.style.display !== "none";
        authForm.style.display = isVisible ? "none" : "flex";
        const messageDiv = authForm.querySelector("#splash-supabase-message");
        if (messageDiv && !isVisible) {
          messageDiv.textContent = "";
        }
      });

      const emailInput = authForm.querySelector("#splash-supabase-email");
      const passwordInput = authForm.querySelector("#splash-supabase-password");
      const signInBtn = authForm.querySelector("#splash-supabase-signin");
      const signUpBtn = authForm.querySelector("#splash-supabase-signup");
      const resetBtn = authForm.querySelector("#splash-supabase-reset");
      const messageDiv = authForm.querySelector("#splash-supabase-message");

      const showMessage = (text, isError = false) => {
        if (messageDiv) {
          messageDiv.textContent = text;
          messageDiv.style.color = isError ? '#ff4444' : '#44ff44';
        }
      };

      if (signInBtn) {
        signInBtn.addEventListener("click", async () => {
          if (!emailInput || !passwordInput) return;
          
          const email = emailInput.value.trim();
          const password = passwordInput.value;
          
          if (!email || !password) {
            showMessage('Please enter email and password', true);
            return;
          }
          
          showMessage('Signing in...');
          const { data, error } = await window.supabaseAuth.signInWithPassword(email, password);
          
          if (error) {
            showMessage(error, true);
          } else {
            showMessage('Signed in successfully!');
            if (passwordInput) passwordInput.value = '';
            setTimeout(() => {
              container.innerHTML = "";
              this.setupSupabaseAuth(container);
            }, 1000);
          }
        });
      }

      if (signUpBtn) {
        signUpBtn.addEventListener("click", async () => {
          if (!emailInput || !passwordInput) return;
          
          const email = emailInput.value.trim();
          const password = passwordInput.value;
          
          if (!email || !password) {
            showMessage('Please enter email and password', true);
            return;
          }
          
          if (password.length < 6) {
            showMessage('Password must be at least 6 characters', true);
            return;
          }
          
          showMessage('Signing up...');
          const { data, error } = await window.supabaseAuth.signUp(email, password);
          
          if (error) {
            showMessage(error, true);
          } else {
            showMessage('Sign up successful! Please check your email to confirm your account.');
            if (passwordInput) passwordInput.value = '';
          }
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
          if (!emailInput) return;
          
          const email = emailInput.value.trim();
          
          if (!email) {
            showMessage('Please enter your email address', true);
            return;
          }
          
          showMessage('Sending password reset email...');
          const { data, error } = await window.supabaseAuth.resetPasswordForEmail(email);
          
          if (error) {
            showMessage(error, true);
          } else {
            showMessage('Password reset email sent! Please check your email.');
          }
        });
      }
    }
  }

  async setupGoogleDriveButtons(cloudButtonArea) {
    if (!window.googleDriveSave) {
      console.warn("GoogleDriveSave not initialized.");
      return;
    }
    // Check if Google Drive is properly configured
    if (!window.googleDriveSave.isConfigured()) {
      cloudButtonArea.innerHTML = "";
      return;
    }
    // If offline, show disabled button with tooltip and skip network calls
    if (!navigator.onLine) {
      cloudButtonArea.innerHTML = "";
      const signInBtn = createGoogleSignInButton(() => { });
      if (signInBtn) {
        signInBtn.disabled = true;
        signInBtn.title = "Requires an internet connection";
        cloudButtonArea.appendChild(signInBtn);
      }
      return;
    }
    // Show loading state while initializing
    cloudButtonArea.innerHTML = "";
    const loadingBtn = createLoadingButton("Checking ...");
    loadingBtn.classList.add("splash-btn-google"); // Ensure margin is consistent
    cloudButtonArea.appendChild(loadingBtn);
    try {
      const initialized = await window.googleDriveSave.init();
      if (!initialized) {
        cloudButtonArea.innerHTML = "";
        return;
      }
      // Check auth status without triggering popup
      const isSignedIn = await window.googleDriveSave.checkAuth(true);
      await this.updateGoogleDriveUI(isSignedIn, cloudButtonArea);
    } catch (error) {
      console.error("Failed to setup Google Drive buttons:", error);
      cloudButtonArea.innerHTML = "Google Drive Error";
    }
  }

  async updateGoogleDriveUI(isSignedIn, cloudButtonArea) {
    cloudButtonArea.innerHTML = "";
    if (isSignedIn) {
      // Check if there's a save file in the cloud
      try {
        await window.googleDriveSave.findSaveFile();
        const fileId = window.googleDriveSave.saveFileId;
        if (fileId) {
          const cloudBtn = createLoadFromCloudButton(async () => {
            try {
              
              const cloudSaveData = await window.googleDriveSave.load();
              if (cloudSaveData) {
                
                if (window.splashManager) {
                  
                  window.splashManager.hide();
                }
                await new Promise((resolve) => setTimeout(resolve, 600));
                if (window.pageRouter && window.ui && window.game) {
                  
                  window.game.applySaveState(cloudSaveData);
                  // Call the startGame function that should be available globally
                  if (typeof window.startGame === "function") {
                    
                    await window.startGame(
                      window.pageRouter,
                      window.ui,
                      window.game
                    );
                  } else {
                    console.error("startGame function not available globally");
                    // Fallback: try to trigger the game start manually
                    await window.pageRouter.loadGameLayout();
                    window.ui.initMainLayout();
                    await window.pageRouter.loadPage("reactor_section");
                    window.game.tooltip_manager = new (
                      await import("./tooltip.js")
                    ).TooltipManager("#main", "#tooltip", window.game);
                    window.game.engine = new (
                      await import("./engine.js")
                    ).Engine(window.game);
                    await window.game.startSession();
                    window.game.engine.start();
                  }
                } else {
                  console.error(
                    "[DEBUG] Required global objects not available:",
                    {
                      pageRouter: !!window.pageRouter,
                      ui: !!window.ui,
                      game: !!window.game,
                    }
                  );
                }
              } else {
                alert("Could not find a save file in Google Drive.");
              }
            } catch (error) {
              console.error("Failed to load from Google Drive:", error);
              alert(`Error loading from Google Drive: ${error.message}`);
            }
          });
          // Respect current connectivity immediately
          if (cloudBtn && !navigator.onLine) {
            cloudBtn.disabled = true;
            cloudBtn.title = "Requires an internet connection";
          }
          cloudButtonArea.appendChild(cloudBtn);
        } else {
          // No cloud save, show info
          const info = document.createElement("div");
          info.textContent = "No cloud save found.";
          cloudButtonArea.appendChild(info);
        }
      } catch {
        cloudButtonArea.innerHTML = "Cloud check failed.";
      }
    } else {
      // Not signed in, show Google Sign In button
      const signInBtn = createGoogleSignInButton(async () => {
        try {
          signInBtn.disabled = true;
          signInBtn.querySelector("span").textContent = "Signing in...";
          await window.googleDriveSave.signIn();
          await this.updateGoogleDriveUI(true, cloudButtonArea);
        } catch {
          signInBtn.querySelector("span").textContent = "Sign in Failed";
          setTimeout(() => {
            signInBtn.querySelector("span").textContent = "Google Sign In";
            signInBtn.disabled = false;
          }, 2000);
        }
      });
      // Respect current connectivity immediately
      if (signInBtn && !navigator.onLine) {
        signInBtn.disabled = true;
        signInBtn.title = "Requires an internet connection";
      }
      cloudButtonArea.appendChild(signInBtn);
    }
  }

  hide() {
    
    
    

    if (this.splashScreen && !this.isReady) {
      
      this.isReady = true;

      // Stop flavor text rotation
      this.stopFlavorText();

      // Stop version checking
      if (this.versionCheckInterval) {
        clearInterval(this.versionCheckInterval);
        this.versionCheckInterval = null;
      }

      // Clear any error timeout
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }

      
      this.splashScreen.classList.add("fade-out");
      setTimeout(() => {
        
        this.splashScreen.classList.add("hidden");
        console.log(
          "[DEBUG] Splash screen classes:",
          this.splashScreen.className
        );
        // Notify service worker that splash is hidden
        if (
          "serviceWorker" in navigator &&
          navigator.serviceWorker.controller
        ) {
          navigator.serviceWorker.controller.postMessage({
            type: "SPLASH_HIDDEN",
          });
        }
      }, 500);
    } else {
      
    }
  }

  show() {
    if (this.splashScreen) {
      this.splashScreen.classList.remove("hidden", "fade-out");
      this.isReady = false;
    }
  }

  showError(message, autoHide = true) {
    this.updateStatus(`Error: ${message}`);

    if (autoHide) {
      // Auto-hide error after 3 seconds
      this.errorTimeout = setTimeout(() => {
        this.hide();
      }, 3000);
    }
  }

  // Force hide splash screen (for emergency cases)
  forceHide() {
    if (this.splashScreen) {
      this.isReady = true;
      this.splashScreen.classList.add("hidden", "fade-out");
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }
    }
  }

  // Show loading state on cloud save button
  showCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;

    loadFromCloudButton.classList.add("visible", "cloud-loading");
    const loadingButton = createLoadingButton("Checking...");
    loadFromCloudButton.innerHTML = loadingButton.innerHTML;
    loadFromCloudButton.disabled = true;
  }

  // Hide loading state on cloud save button
  hideCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;

    loadFromCloudButton.classList.remove("cloud-loading");
    loadFromCloudButton.disabled = false;
    // The actual content will be set by the calling function based on whether a save was found
  }

  // Show loading state during Google Drive initialization
  showGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.add("visible", "google-loading");
      const loadingButton = createLoadingButton("Initializing...");
      signInButton.innerHTML = loadingButton.innerHTML;
      signInButton.disabled = true;
    }

    if (loadFromCloudButton) {
      loadFromCloudButton.classList.remove("visible");
    }
  }

  // Hide loading state after Google Drive initialization
  hideGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.remove("google-loading");
      signInButton.disabled = false;
      // Reset button content to normal Google Sign In button
      const newButton = createGoogleSignInButtonWithIcon();
      signInButton.innerHTML = newButton.innerHTML;
    }
  }

  // Refresh save options after upload/download operations
  async refreshSaveOptions() {
    await this.showStartOptions(!!safeGetItem("reactorGameSave"));
  }
}

// Global splash screen manager instance
window.splashManager = new SplashScreenManager();

// Configuration (can be overridden)
window.reactorConfig = window.reactorConfig || {};



function enable() {
  safeSetItem("debug-splash", "true");
  console.log(
    "[SPLASH DEBUG] Debug mode enabled. Reload the page to see slower loading with showcased flavor text."
  );
  console.log(
    "[SPLASH DEBUG] Or visit: " +
    window.location.origin +
    window.location.pathname +
    "?debug-splash"
  );
}

// Debug Google Drive functionality
async function checkGoogleDrive() {
  
  console.log("- Google Drive Save exists:", !!window.googleDriveSave);
  console.log("- Is signed in:", window.googleDriveSave?.isSignedIn);
  console.log(
    "- Local save (reactorGameSave):",
    window.safeGetItem("reactorGameSave") ? "EXISTS" : "NONE"
  );

  if (window.googleDriveSave?.isSignedIn) {
    try {
      const localSaveInfo =
        await window.googleDriveSave.offerLocalSaveUpload();
      console.log("- Local save info:", localSaveInfo);

      const fileId = await window.googleDriveSave.findSaveFile();
      console.log("- Cloud save file ID:", fileId);
    } catch (error) {
      console.error("- Error during check:", error);
    }
  }
}

// Test cloud save detection after upload
async function testCloudSaveDetection() {
  console.log("=== Cloud Save Detection Test ===");

  if (!window.googleDriveSave?.isSignedIn) {
    console.error("❌ Not signed in to Google Drive");
    return;
  }

  console.log("🔍 Step 1: Clear cached file ID and search for cloud save...");
  window.googleDriveSave.saveFileId = null;

  const foundFile = await window.googleDriveSave.findSaveFile();
  console.log("- File found:", foundFile);
  console.log("- File ID:", window.googleDriveSave.saveFileId);

  console.log("🔄 Step 2: Refresh save options...");
  if (window.splashManager) {
    await window.splashManager.refreshSaveOptions();
    console.log("- Save options refreshed");
  }

  console.log("✅ Test complete");
}

// Test basic Google Drive API operations
async function testBasicOperations() {
  console.log("=== Manual Basic Operations Test ===");

  if (!window.googleDriveSave?.isSignedIn) {
    console.error("❌ Not signed in to Google Drive");
    return;
  }

  try {
    const result = await window.googleDriveSave.testBasicFileOperations();
    console.log("Test result:", result ? "✅ PASSED" : "❌ FAILED");
  } catch (error) {
    console.error("❌ Test error:", error);
  }
}

// Debug: List all files to see where saves are going
async function listAllFiles() {
  console.log("=== Listing All Drive Files ===");

  if (!window.googleDriveSave?.isSignedIn) {
    console.error("❌ Not signed in to Google Drive");
    return;
  }

  try {
    // List files in root
    console.log("📁 Files in root:");
    const rootResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name contains 'reactor'&fields=files(id,name,parents,createdTime)",
      {
        headers: {
          Authorization: `Bearer ${window.googleDriveSave.authToken}`,
        },
      }
    );

    if (rootResponse.ok) {
      const rootData = await rootResponse.json();
      console.log("Root files:", rootData.files);
    }

    // List files in appDataFolder
    console.log("📁 Files in appDataFolder:");
    const appResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=parents in 'appDataFolder'&fields=files(id,name,parents,createdTime)",
      {
        headers: {
          Authorization: `Bearer ${window.googleDriveSave.authToken}`,
        },
      }
    );

    if (appResponse.ok) {
      const appData = await appResponse.json();
      console.log("AppData files:", appData.files);
    }
  } catch (error) {
    console.error("❌ Error listing files:", error);
  }
}

// OAuth troubleshooting helper
function diagnoseOAuth() {
  console.log("=== OAuth Diagnostic Report ===");
  console.log("Current URL:", window.location.href);
  console.log("Origin:", window.location.origin);
  console.log("Protocol:", window.location.protocol);
  console.log("Port:", window.location.port);

  console.log("\n=== Google Drive Config ===");
  if (window.googleDriveSave) {
    console.log("- Google Drive Save:", "✅ Loaded");
    console.log(
      "- Configuration:",
      window.googleDriveSave.isConfigured() ? "✅ Valid" : "❌ Invalid"
    );
  } else {
    console.log("- Google Drive Save:", "❌ Not loaded");
  }

  console.log("\n=== Required URLs for Google Cloud Console ===");
  console.log("Add these to 'Authorized JavaScript origins':");
  console.log(`- ${window.location.origin}`);
  if (window.location.port !== "8080") {
    console.log("- http://localhost:8080");
    console.log("- http://127.0.0.1:8080");
  }

  console.log("\n=== Next Steps ===");
  console.log(
    "1. Go to Google Cloud Console > APIs & Services > Credentials"
  );
  console.log("2. Edit your OAuth 2.0 Client ID");
  console.log("3. Add the URLs above to 'Authorized JavaScript origins'");
  console.log("4. Make sure Google Drive API is enabled");
  console.log("5. Check OAuth consent screen is configured");
  console.log("6. Try signing in again");
}

// Test save state transitions
async function testSaveFlow() {
  console.log("=== Save Flow Test ===");
  console.log("Before operation:");
  console.log(
    "- Local save exists:",
    !!safeGetItem("reactorGameSave")
  );
  console.log(
    "- Signed into Google Drive:",
    window.googleDriveSave?.isSignedIn
  );

  if (window.googleDriveSave?.isSignedIn) {
    try {
      const cloudFileId = await window.googleDriveSave.findSaveFile();
      console.log("- Cloud save exists:", !!cloudFileId);

      if (window.splashManager) {
        await window.splashManager.refreshSaveOptions();
        console.log("- Save options refreshed");
      }
    } catch (error) {
      console.error("- Error checking cloud save:", error);
    }
  }
}

// Test Google Drive permissions specifically
async function testPermissions() {
  console.log("=== Google Drive Permissions Test ===");

  if (!window.googleDriveSave) {
    console.error("❌ GoogleDriveSave not available");
    return;
  }

  console.log("✅ GoogleDriveSave available");
  console.log("- Configured:", window.googleDriveSave.isConfigured());
  console.log("- Signed in:", window.googleDriveSave.isSignedIn);
  console.log("- Auth token present:", !!window.googleDriveSave.authToken);
  console.log("- Current save file ID:", window.googleDriveSave.saveFileId);

  if (window.googleDriveSave.isSignedIn) {
    try {
      console.log("🔍 Testing file list permissions...");

      // Test if we can list files (basic permission check)
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?pageSize=1",
        {
          headers: {
            Authorization: `Bearer ${window.googleDriveSave.authToken}`,
          },
        }
      );

      if (response.ok) {
        console.log("✅ File listing permissions: OK");
        const data = await response.json();
        console.log("- Can access", data.files?.length || 0, "files");
      } else {
        console.error("❌ File listing permissions: FAILED");
        console.error("- Status:", response.status, response.statusText);
        const errorText = await response.text();
        console.error("- Error:", errorText);
      }

      // Test if we can access the current save file
      if (window.googleDriveSave.saveFileId) {
        console.log("🔍 Testing save file access...");
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${window.googleDriveSave.saveFileId}`,
          {
            headers: {
              Authorization: `Bearer ${window.googleDriveSave.authToken}`,
            },
          }
        );

        if (fileResponse.ok) {
          console.log("✅ Save file access: OK");
          const fileData = await fileResponse.json();
          console.log("- File name:", fileData.name);
          console.log("- File size:", fileData.size);
          console.log("- Created:", fileData.createdTime);
          console.log("- Modified:", fileData.modifiedTime);
        } else {
          console.error("❌ Save file access: FAILED");
          console.error(
            "- Status:",
            fileResponse.status,
            fileResponse.statusText
          );
          const errorText = await fileResponse.text();
          console.error("- Error:", errorText);
        }
      }
    } catch (error) {
      console.error("❌ Permission test failed:", error);
    }
  } else {
    console.log("ℹ️ Not signed in - sign in first to test permissions");
  }
}

// Force clear all Google Drive authentication
function resetAuth() {
  console.log("=== Resetting Google Drive Authentication ===");

  if (window.googleDriveSave) {
    console.log("🔄 Signing out and clearing all auth data...");
    window.googleDriveSave.signOut();
    window.googleDriveSave.isSignedIn = false;
    window.googleDriveSave.authToken = null;
    window.googleDriveSave.saveFileId = null;
    console.log("✅ Auth data cleared");
  }

  // Clear any gapi tokens
  if (window.gapi && window.gapi.client) {
    try {
      window.gapi.client.setToken(null);
      console.log("✅ GAPI tokens cleared");
    } catch (error) {
      console.log("ℹ️ No GAPI tokens to clear");
    }
  }

  console.log("✅ Authentication reset complete");
  console.log("ℹ️ Refresh the page and sign in again with fresh permissions");
}

function disable() {
  safeRemoveItem("debug-splash");
  console.log(
    "[SPLASH DEBUG] Debug mode disabled. Reload the page for normal loading speed."
  );
}
function showRandomFlavor() {
  if (window.splashManager && window.splashManager.flavorElement) {
    window.splashManager.showRandomFlavorText();
  } else {
    console.log(
      "[SPLASH DEBUG] Splash manager or flavor element not available"
    );
  }
}
function listFlavors() {
  console.log("[SPLASH DEBUG] Available flavor messages:");
  flavorMessages.forEach((msg, index) => {
    console.log(`  ${index + 1}. ${msg}`);
  });
}

// Add keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && window.splashManager) {
    window.splashManager.forceHide();
  }

  // Ctrl+Shift+V: Trigger version check and show toast
  if (e.ctrlKey && e.shiftKey && e.key === "V") {
    e.preventDefault();
    if (window.splashManager) {
      window.splashManager.triggerVersionCheckToast();
    }
  }
});

// Note: beforeinstallprompt is now handled in SplashScreenManager
// to provide install option on the splash screen

if (installButton) {
  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installButton.classList.add("hidden");
    }
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA was installed");
  deferredPrompt = null;
  if (installButton) {
    installButton.classList.add("hidden");
  }
});

// --- Group part images by tier ---
const partImagesByTier = {
  1: [
    'img/parts/accelerators/accelerator_1.png',
    'img/parts/capacitors/capacitor_1.png',
    'img/parts/cells/cell_1_1.png',
    'img/parts/cells/cell_1_2.png',
    'img/parts/cells/cell_1_4.png',
    'img/parts/coolants/coolant_cell_1.png',
    'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png',
    'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png',
    'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png',
  ],
  2: [
    'img/parts/accelerators/accelerator_2.png',
    'img/parts/capacitors/capacitor_2.png',
    'img/parts/cells/cell_2_1.png',
    'img/parts/cells/cell_2_2.png',
    'img/parts/cells/cell_2_4.png',
    'img/parts/coolants/coolant_cell_2.png',
    'img/parts/exchangers/exchanger_2.png',
    'img/parts/inlets/inlet_2.png',
    'img/parts/outlets/outlet_2.png',
    'img/parts/platings/plating_2.png',
    'img/parts/reflectors/reflector_2.png',
    'img/parts/vents/vent_2.png',
  ],
  3: [
    'img/parts/accelerators/accelerator_3.png',
    'img/parts/capacitors/capacitor_3.png',
    'img/parts/cells/cell_3_1.png',
    'img/parts/cells/cell_3_2.png',
    'img/parts/cells/cell_3_4.png',
    'img/parts/coolants/coolant_cell_3.png',
    'img/parts/exchangers/exchanger_3.png',
    'img/parts/inlets/inlet_3.png',
    'img/parts/outlets/outlet_3.png',
    'img/parts/platings/plating_3.png',
    'img/parts/reflectors/reflector_3.png',
    'img/parts/vents/vent_3.png',
  ],
  4: [
    'img/parts/accelerators/accelerator_4.png',
    'img/parts/capacitors/capacitor_4.png',
    'img/parts/cells/cell_4_1.png',
    'img/parts/cells/cell_4_2.png',
    'img/parts/cells/cell_4_4.png',
    'img/parts/coolants/coolant_cell_4.png',
    'img/parts/exchangers/exchanger_4.png',
    'img/parts/inlets/inlet_4.png',
    'img/parts/outlets/outlet_4.png',
    'img/parts/platings/plating_4.png',
    'img/parts/reflectors/reflector_4.png',
    'img/parts/vents/vent_4.png',
  ],
  5: [
    'img/parts/accelerators/accelerator_5.png',
    'img/parts/capacitors/capacitor_5.png',
    'img/parts/coolants/coolant_cell_5.png',
    'img/parts/exchangers/exchanger_5.png',
    'img/parts/inlets/inlet_5.png',
    'img/parts/outlets/outlet_5.png',
    'img/parts/platings/plating_5.png',
    'img/parts/cells/cell_5_1.png',
    'img/parts/cells/cell_5_2.png',
    'img/parts/cells/cell_5_4.png',
    'img/parts/reflectors/reflector_5.png',
    'img/parts/vents/vent_5.png',
  ],
  6: [
    'img/parts/accelerators/accelerator_6.png',
    'img/parts/capacitors/capacitor_6.png',
    'img/parts/cells/cell_6_1.png',
    'img/parts/cells/cell_6_2.png',
    'img/parts/cells/cell_6_4.png',
    'img/parts/cells/xcell_1_1.png',
    'img/parts/cells/xcell_1_2.png',
    'img/parts/cells/xcell_1_4.png',
    'img/parts/coolants/coolant_cell_6.png',
    'img/parts/exchangers/exchanger_6.png',
    'img/parts/inlets/inlet_6.png',
    'img/parts/outlets/outlet_6.png',
    'img/parts/platings/plating_6.png',
    'img/parts/reflectors/reflector_6.png',
    'img/parts/vents/vent_6.png',
  ],
};
const maxTier = 6;
const splashStartTime = Date.now();
let splashBgInterval = null;

function getSplashTierAndFill() {
  const elapsedMin = (Date.now() - splashStartTime) / 60000;
  // Tier: start at 1, increase to 6 over 15 minutes (linear)
  const avgTier = Math.min(1 + (elapsedMin / 15) * (maxTier - 1), maxTier);
  // Fill: start at 3%, increase to 80% over 15 minutes (linear)
  const fillPct = Math.min(0.03 + (elapsedMin / 15) * (0.80 - 0.03), 0.80);
  return { avgTier, fillPct };
}

function pickTier(avgTier) {
  // Weighted random: higher chance for lower tiers, but mean = avgTier
  // Use a normal distribution centered at avgTier, clamp to [1, maxTier]
  let tier = Math.round(randNormal(avgTier, 1.1));
  tier = Math.max(1, Math.min(maxTier, tier));
  return tier;
}

function randNormal(mean, stddev) {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + stddev * num;
}

function generateSplashBackground() {
  const tileImg = new window.Image();
  tileImg.src = 'img/ui/tile.png';

  const canvas = document.createElement('canvas');
  const tileSize = 64;
  const gridW = 25, gridH = 25;
  canvas.width = tileSize * gridW;
  canvas.height = tileSize * gridH;
  const ctx = canvas.getContext('2d');

  tileImg.onload = () => {
    // Draw base tiles
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        ctx.drawImage(tileImg, x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    // --- Dynamic tier/fill logic ---
    const { avgTier, fillPct } = getSplashTierAndFill();
    const totalPartsToPlace = Math.floor(gridW * gridH * fillPct);
    const partLoadPromises = [];
    for (let i = 0; i < totalPartsToPlace; i++) {
      const px = Math.floor(Math.random() * gridW);
      const py = Math.floor(Math.random() * gridH);
      const tier = pickTier(avgTier);
      const tierParts = partImagesByTier[tier] || partImagesByTier[1];
      const partImg = new window.Image();
      const randomPartSrc = tierParts[Math.floor(Math.random() * tierParts.length)];
      partImg.src = randomPartSrc;
      const loadPromise = new Promise(resolve => {
        partImg.onload = () => {
          ctx.drawImage(partImg, px * tileSize + 8, py * tileSize + 8, tileSize - 16, tileSize - 16);
          resolve();
        };
        partImg.onerror = () => {
          console.warn(`Failed to load splash background part image: ${randomPartSrc}`);
          resolve();
        };
      });
      partLoadPromises.push(loadPromise);
    }
    Promise.all(partLoadPromises).then(() => {
      const splashEl = document.getElementById('splash-screen');
      if (splashEl) {
        splashEl.style.backgroundImage = `url('${canvas.toDataURL()}')`;
        splashEl.style.backgroundRepeat = 'repeat';
        splashEl.style.backgroundSize = '';
        // Ensure animation works on all devices
        splashEl.style.animation = 'splash-bg-scroll 120s linear infinite';
        // Schedule next update in 1 minute
        if (splashBgInterval) clearTimeout(splashBgInterval);
        splashBgInterval = setTimeout(generateSplashBackground, 60000);
        console.log("Splash screen background with parts generated and applied.");
      }
    }).catch(error => {
      console.error("An unexpected error occurred during splash background part loading:", error);
    });
  };

  tileImg.onerror = () => {
    console.error("Failed to load base tile image: 'img/ui/tile.png'. Dynamic background with parts will not be fully rendered.");
  };
}

// CSS animation handles the background scrolling automatically

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('splash-screen')) {
    generateSplashBackground();
  } else {
    console.warn("Splash screen element not found, skipping dynamic background generation.");
  }
});

let wakeLock = null;

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log('[PWA] Screen Wake Lock active');
    
    document.addEventListener('visibilitychange', async () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    });
  } catch (err) {
    console.log(`[PWA] Wake Lock failed: ${err.name}, ${err.message}`);
  }
}

export function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
    console.log('[PWA] Screen Wake Lock released');
  }
}

// Background capabilities and push helpers
async function registerPeriodicSync() {
  try {
    if ('serviceWorker' in navigator) {
      const ready = await navigator.serviceWorker.ready;
      if ('periodicSync' in ready) {
        const tags = await ready.periodicSync.getTags();
        if (!tags.includes('reactor-periodic-sync')) {
          const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (perm.state === 'granted') {
            await ready.periodicSync.register('reactor-periodic-sync', { minInterval: 60 * 60 * 1000 });
            console.log('[PWA] Periodic sync registered');
          }
        }
      }
    }
  } catch (e) {
    console.log('[PWA] Periodic sync unavailable:', e?.message || e);
  }
}

async function registerOneOffSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const ready = await navigator.serviceWorker.ready;
      await ready.sync.register('reactor-sync');
      console.log('[PWA] One-off sync registered');
    }
  } catch (e) {
    console.log('[PWA] One-off sync unavailable:', e?.message || e);
  }
}

// Push notifications disabled on GitHub Pages hosting (no backend available)

// -----------------------------
// Connectivity-aware Google Drive UI state
// -----------------------------
(function setupConnectivityUI() {
  function updateGoogleDriveButtonState() {
    const isOnline = navigator.onLine;
    const selectors = [
      "#splash-load-cloud-btn",
      "#splash-google-signin-btn", // legacy/mistyped id (keep for safety)
      "#splash-google-signout-btn", // legacy/mistyped id (keep for safety)
      "#splash-signin-btn",
      "#splash-signout-btn",
      "#splash-upload-option-btn",
    ];
    selectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.disabled = !isOnline;
        el.title = isOnline ? "Requires Google Drive permissions" : "Requires an internet connection";
      }
    });
    // Also disable any dynamically created cloud buttons in splash area
    const cloudArea = document.getElementById("splash-cloud-button-area");
    if (cloudArea) {
      cloudArea.querySelectorAll("button").forEach((btn) => {
        btn.disabled = !isOnline;
        btn.title = isOnline ? btn.title || "" : "Requires an internet connection";
      });
    }
  }

  // Initial check (after DOM content is ready)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateGoogleDriveButtonState, { once: true });
  } else {
    updateGoogleDriveButtonState();
  }

  // Listen for connection changes
  window.addEventListener("online", updateGoogleDriveButtonState);
  window.addEventListener("offline", updateGoogleDriveButtonState);
})();



// Help function to show available hotkeys
window.showHotkeyHelp = function () {
  console.log(`
Version Check Hotkeys Available:
  Ctrl+Shift+V  - Trigger version check and show toast notification
  Escape        - Force hide splash screen (debug)
  `);
};