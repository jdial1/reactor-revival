import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import { BlueprintSchema, LegacyGridSchema } from "../../utils/utils_constants.js";
import { repeat, styleMap, numFormat as fmt, logger, classMap, StorageUtils, serializeSave, escapeHtml, unsafeHTML, toNumber, formatTime, getPartImagePath, toDecimal } from "../../utils/utils_constants.js";
import { MODAL_IDS } from "../ui_modals.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";
import { runCheckAffordability, calculateSectionCounts } from "../../core/upgrades_system.js";
import { UpgradeCard, CloseButton, PartButton } from "../buttonFactory.js";
import { BlueprintService } from "../../core/parts_system.js";
import { setDecimal, preferences } from "../../core/store.js";
import { MOBILE_BREAKPOINT_PX, REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR } from "../../utils/utils_constants.js";
import { leaderboardService } from "../../services/services_cloud.js";
import { BaseComponent } from "../../core/reactor_state.js";
import { HeatVisualsUI, GridInteractionUI, ParticleEffectsUI, VisualEventRendererUI } from "./ui_visuals.js";
import { MeltdownUI, ClipboardUI } from "./ui_tools.js";
import { requestWakeLock, releaseWakeLock } from "../../services/services_pwa.js";
import { InfoBarUI, MobileInfoBarUI, PageSetupUI, PartsPanelUI, ControlDeckUI, NavIndicatorsUI, TabSetupUI } from "./ui_panels.js";

export {
  mergeComponents,
  renderComponentIcons,
  ComponentRenderingUI,
  runPopulateUpgradeSection,
  updateSectionCountsState,
  mountSectionCountsReactive,
  UpgradesUI,
  clipToGrid,
  setupCopyAction,
  setupPasteAction,
  serializeReactor,
  deserializeReactor,
  calculateLayoutCostBreakdown,
  calculateLayoutCost,
  renderLayoutPreview,
  buildPartSummary,
  buildAffordableSet,
  filterLayoutByCheckedTypes,
  calculateCurrentSellValue,
  buildAffordableLayout,
  buildPasteState,
  validatePasteResources,
  getCostBreakdown,
  getCompactLayout,
  myLayoutsTemplate,
} from "./ui_upgrades.js";
import { setupCopyAction, setupPasteAction } from "./ui_upgrades.js";

const TOAST_DURATION_MS = 2000;

class CopyPasteUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('CopyPaste', this);
    this._blueprint = null;
  }

  _getBlueprint() {
    if (!this._blueprint && this.ui.game) {
      this._blueprint = new BlueprintService(this.ui.game);
    }
    return this._blueprint;
  }

  init() {
    const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
    const toggleBtn = document.getElementById("reactor_copy_paste_toggle");
    const copyBtn = document.getElementById("reactor_copy_btn");
    const pasteBtn = document.getElementById("reactor_paste_btn");
    const deselectBtn = document.getElementById("reactor_deselect_btn");
    const dropperBtn = document.getElementById("reactor_dropper_btn");
    const modal = document.getElementById("reactor_copy_paste_modal");
    const modalTitle = document.getElementById("reactor_copy_paste_modal_title");
    const modalText = document.getElementById("reactor_copy_paste_text");
    const modalCost = document.getElementById("reactor_copy_paste_cost");
    const closeBtn = document.getElementById("reactor_copy_paste_close_btn");
    const confirmBtn = document.getElementById("reactor_copy_paste_confirm_btn");

    this._setupToggleCollapse(copyPasteBtns, toggleBtn);
    if (!copyBtn || !pasteBtn || !modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) {
      logger.log('warn', 'ui', 'Copy/paste UI elements not found, skipping initialization');
      return;
    }
    this._setupDeselect(deselectBtn);
    this._setupDropper(dropperBtn);

    const refs = { copyBtn, pasteBtn, modal, modalTitle, modalText, modalCost, closeBtn, confirmBtn };
    const bp = () => this._getBlueprint();
    setupCopyAction(this.ui, bp, refs);
    setupPasteAction(this.ui, bp, refs);

    this._setupMyLayouts();
    this._setupSandboxButton();
    if (closeBtn) closeBtn.onclick = this.ui.modalOrchestrationUI.hideModal.bind(this.ui.modalOrchestrationUI);
  }

  open(data) {
    if (typeof this.ui._showPasteModalWithData === "function") {
      this.ui._showPasteModalWithData(data ?? "");
    }
  }

  _setupToggleCollapse(copyPasteBtns, toggleBtn) {
    if (!toggleBtn || !copyPasteBtns) return;
    const uiState = this.ui.uiState;
    toggleBtn.onclick = () => {
      if (uiState) uiState.copy_paste_collapsed = !uiState.copy_paste_collapsed;
      else {
        copyPasteBtns.classList.toggle("collapsed");
        StorageUtils.set("reactor_copy_paste_collapsed", copyPasteBtns.classList.contains("collapsed"));
      }
    };
    if (!uiState && StorageUtils.get("reactor_copy_paste_collapsed") === true) {
      copyPasteBtns.classList.add("collapsed");
    }
  }

  _setupDeselect(deselectBtn) {
    if (!deselectBtn) return;
    deselectBtn.onclick = () => {
      document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
      this.ui.stateManager.setClickedPart(null);
    };
  }

  _setupDropper(dropperBtn) {
    const ui = this.ui;
    if (!dropperBtn) return;
    dropperBtn.onclick = () => {
      ui._dropperModeActive = !ui._dropperModeActive;
      dropperBtn.classList.toggle("on", ui._dropperModeActive);
      if (ui._dropperModeActive) {
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        const reactorEl = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
        if (reactorEl && !ui._dropperPointerHandler) {
          ui._dropperPointerHandler = (e) => {
            const tile = ui.gridCanvasRenderer ? ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY) : null;
            if (tile?.part) {
              document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
              ui.stateManager.setClickedPart(tile.part, { skipOpenPanel: true });
              if (tile.part.$el) tile.part.$el.classList.add("part_active");
              ui._dropperModeActive = false;
              dropperBtn.classList.remove("on");
              reactorEl.removeEventListener("pointerdown", ui._dropperPointerHandler, true);
              ui._dropperPointerHandler = null;
            }
          };
          (ui.gridCanvasRenderer?.getCanvas() || reactorEl).addEventListener("pointerdown", ui._dropperPointerHandler, true);
        }
      } else if (ui._dropperPointerHandler) {
        const reactorEl = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
        if (reactorEl) (ui.gridCanvasRenderer?.getCanvas() || reactorEl).removeEventListener("pointerdown", ui._dropperPointerHandler, true);
        ui._dropperPointerHandler = null;
      }
    };
  }

  _setupMyLayouts() {
    const ui = this.ui;
    const myLayoutsBtn = document.getElementById("reactor_my_layouts_btn");
    if (!myLayoutsBtn) return;
    myLayoutsBtn.onclick = () => ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS);
  }

  _setupSandboxButton() {
    const ui = this.ui;
    const root = document.getElementById("reactor_sandbox_btn_root");
    if (!root || !ui.uiState) return;
    if (this._sandboxUnmount) {
      this._sandboxUnmount();
      this._sandboxUnmount = null;
    }
    if (ui.game) ui.uiState.copy_paste_display = { isSandbox: !!ui.game.isSandbox };
    const template = () => {
      const isSandbox = ui.uiState.copy_paste_display.isSandbox;
      const icon = isSandbox ? "\u23EE" : "\u{1F9EA}";
      const title = isSandbox ? "Return to Splash" : "Enter Sandbox";
      return html`
        <button id="reactor_sandbox_btn" title=${title} tabindex="0" aria-label="Sandbox" class=${classMap({ on: isSandbox })} @click=${() => ui.sandboxUI.toggleSandbox()}>
          <span class="emoji-icon">${icon}</span>
        </button>
      `;
    };
    this._sandboxUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["copy_paste_display"] }],
      template,
      root
    );
  }

  setupCopyStateButton() {
    const ui = this.ui;
    const copyStateBtn = document.getElementById("copy_state_btn");
    if (!copyStateBtn || !ui.uiState) return;
    const defaultLabel = "Copy State";
    if (this._copyStateUnmount) {
      this._copyStateUnmount();
      this._copyStateUnmount = null;
    }
    const renderFn = () => {
      const label = ui.uiState.copy_state_feedback ?? defaultLabel;
      return html`${label}`;
    };
    this._copyStateUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["copy_state_feedback"] }],
      renderFn,
      copyStateBtn
    );
    copyStateBtn.onclick = async () => {
      const gameStateObject = await ui.game.saveManager.getSaveState();
      const gameStateString = serializeSave(gameStateObject);
      navigator.clipboard
        .writeText(gameStateString)
        .then(() => {
          ui.uiState.copy_state_feedback = "Copied!";
          setTimeout(() => {
            ui.uiState.copy_state_feedback = null;
          }, TOAST_DURATION_MS);
        })
        .catch((err) => {
          logger.log('error', 'ui', 'Failed to copy game state: ', err);
          ui.uiState.copy_state_feedback = "Error!";
          setTimeout(() => {
            ui.uiState.copy_state_feedback = null;
          }, TOAST_DURATION_MS);
        });
    };
  }

  pasteReactorLayout(layout, options = {}) {
    const ui = this.ui;
    if (!layout || !ui.game || !ui.game.tileset || !ui.game.partset) return;
    ui.game.action_pasteLayout(layout, options);
    ui.gridCanvasRenderer?.markStaticDirty();
    ui.coreLoopUI.runUpdateInterfaceLoop();
  }
}

class SandboxUI {
  constructor(ui) {
    this.ui = ui;
  }

  toggleSandbox() {
    if (!this.ui.game) return;
    if (this.ui.game.isSandbox) {
      window.location.href = window.location.origin + window.location.pathname;
    } else {
      this.enterSandbox();
    }
  }

  compactTo2DLayout(compact) {
    if (!compact || !compact.size || !compact.parts) return null;
    const { rows, cols } = compact.size;
    const layout = [];
    for (let r = 0; r < rows; r++) {
      layout[r] = [];
      for (let c = 0; c < cols; c++) layout[r][c] = null;
    }
    compact.parts.forEach((p) => {
      if (p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols) {
        layout[p.r][p.c] = { id: p.id, t: p.t, lvl: p.lvl || 1 };
      }
    });
    return layout;
  }

  enterSandbox() {
    const ui = this.ui;
    if (!ui.game || ui.game.isSandbox) return;
    const layout = getCompactLayout(ui.game);
    if (!layout) return;
    ui.game._mainState = {
      layout,
      money: ui.game.state.current_money,
      ep: ui.game.state.current_exotic_particles,
      rows: ui.game.rows,
      cols: ui.game.cols
    };
    ui.game.tileset.tiles_list.forEach((tile) => {
      if (tile.enabled && tile.part) tile.clearPart();
    });
    if (ui.game._sandboxState?.layout) {
      const prevSuppress = ui.game._suppressPlacementCounting;
      ui.game._suppressPlacementCounting = true;
      const layout2D = this.compactTo2DLayout(ui.game._sandboxState.layout);
      if (layout2D && (ui.game._sandboxState.rows === ui.game.rows && ui.game._sandboxState.cols === ui.game.cols)) {
        ui.copyPaste.pasteReactorLayout(layout2D, { skipCostDeduction: true });
      } else if (layout2D && (ui.game._sandboxState.rows !== ui.game.rows || ui.game._sandboxState.cols !== ui.game.cols)) {
        ui.game.rows = ui.game._sandboxState.rows;
        ui.game.cols = ui.game._sandboxState.cols;
        ui.copyPaste.pasteReactorLayout(layout2D, { skipCostDeduction: true });
      }
      ui.game._suppressPlacementCounting = prevSuppress;
    }
    ui.game.isSandbox = true;
    ui.game.reactor.current_heat = 0;
    ui.game.reactor.current_power = 0;
    ui.stateManager.setVar("exotic_particles", Infinity);
    ui.stateManager.setVar("current_heat", 0);
    ui.stateManager.setVar("current_power", 0);
    document.body.classList.add("reactor-sandbox");
    ui.partsPanelUI.unlockAllPartsForTesting();
    ui.game.upgradeset.check_affordability(ui.game);
    ui.coreLoopUI.runUpdateInterfaceLoop();
    if (ui.uiState?.copy_paste_display) ui.uiState.copy_paste_display = { isSandbox: true };
  }

  exitSandbox() {
    const ui = this.ui;
    if (!ui.game || !ui.game.isSandbox || !ui.game._mainState) return;
    const layout = getCompactLayout(ui.game);
    const hasParts = (layout?.parts?.length ?? 0) > 0;
    if (hasParts && typeof confirm === "function" && confirm("Save blueprint layout before exiting? You can add it to My Layouts.")) {
      const defaultName = `Sandbox ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
      ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, JSON.stringify(layout, null, 2));
    }
    ui.game._sandboxState = {
      layout,
      rows: ui.game.rows,
      cols: ui.game.cols
    };
    const main = ui.game._mainState;
    if (main.rows !== ui.game.rows || main.cols !== ui.game.cols) {
      ui.game.rows = main.rows;
      ui.game.cols = main.cols;
    }
    ui.game.tileset.tiles_list.forEach((tile) => {
      if (tile.enabled && tile.part) tile.clearPart();
    });
    const prevSuppress = ui.game._suppressPlacementCounting;
    ui.game._suppressPlacementCounting = true;
    const layout2D = this.compactTo2DLayout(main.layout);
    if (layout2D) ui.copyPaste.pasteReactorLayout(layout2D, { skipCostDeduction: true });
    ui.game._suppressPlacementCounting = prevSuppress;
    const moneyVal = (main.money != null && typeof main.money.gt === "function") ? main.money : toDecimal(main.money ?? 0);
    const epVal = (main.ep != null && typeof main.ep.gt === "function") ? main.ep : toDecimal(main.ep ?? 0);
    setDecimal(ui.game.state, "current_money", moneyVal);
    ui.game.exoticParticleManager.exotic_particles = epVal;
    setDecimal(ui.game.state, "current_exotic_particles", epVal);
    ui.game.isSandbox = false;
    ui.stateManager.setVar("exotic_particles", main.ep);
    document.body.classList.remove("reactor-sandbox");
    ui.game.reactor.updateStats();
    ui.coreLoopUI.runUpdateInterfaceLoop();
    if (ui.uiState?.copy_paste_display) ui.uiState.copy_paste_display = { isSandbox: false };
  }

  initializeSandboxUpgradeButtons() {
    const ui = this.ui;
    const upgradesBuyAll = document.getElementById("upgrades_buy_all_btn");
    const upgradesClearAll = document.getElementById("upgrades_clear_all_btn");
    const researchBuyAll = document.getElementById("research_buy_all_btn");
    const researchClearAll = document.getElementById("research_clear_all_btn");
    if (upgradesBuyAll && ui.game?.upgradeset) {
      upgradesBuyAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.purchaseAllUpgrades();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
    if (upgradesClearAll && ui.game?.upgradeset) {
      upgradesClearAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.clearAllUpgrades();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
    if (researchBuyAll && ui.game?.upgradeset) {
      researchBuyAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.purchaseAllResearch();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
    if (researchClearAll && ui.game?.upgradeset) {
      researchClearAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.clearAllResearch();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
  }
}

function getAuthState() {
  const googleSignedIn = !!(window.googleDriveSave && window.googleDriveSave.isSignedIn);
  const supabaseSignedIn = !!(window.supabaseAuth && window.supabaseAuth.isSignedIn());
  return { googleSignedIn, supabaseSignedIn, isSignedIn: googleSignedIn || supabaseSignedIn };
}

function modalOverlay(id, onOutsideClick) {
  const modal = document.createElement("div");
  modal.id = id;
  modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;";
  modal.addEventListener("click", (e) => { if (e.target === modal) onOutsideClick(); });
  return modal;
}

async function performSignOut(modal, googleSignedIn, supabaseSignedIn, onComplete) {
  if (supabaseSignedIn && window.supabaseAuth) window.supabaseAuth.signOut();
  if (googleSignedIn && window.googleDriveSave) {
    if (window.googleDriveSave.signOut) await window.googleDriveSave.signOut();
    else {
      window.googleDriveSave.isSignedIn = false;
      window.googleDriveSave.authToken = null;
      StorageUtils.remove("google_drive_auth_token");
    }
  }
  onComplete();
  modal.remove();
}

class UserAccountUI {
  constructor(ui) {
    this.ui = ui;
    this._buttonAbortController = null;
  }

  setupUserAccountButton() {
    const ui = this.ui;
    const root = document.getElementById("user_account_btn_root");
    if (!root || !ui.uiState) return;

    this.teardownUserAccountButton();
    this._buttonAbortController = new AbortController();
    const { signal } = this._buttonAbortController;

    this._syncUserAccountDisplay();
    const clickHandler = () => this.handleUserAccountClick();

    if (this._userAccountUnmount) {
      this._userAccountUnmount();
      this._userAccountUnmount = null;
    }
    const template = () => {
      const { icon, title } = ui.uiState.user_account_display ?? { icon: "🔐", title: "Sign In" };
      return html`
        <button id="user_account_btn" title=${title} aria-label=${title} @click=${clickHandler}>${icon}</button>
      `;
    };
    this._userAccountUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["user_account_display"] }],
      template,
      root
    );
    const userAccountBtnMobile = document.getElementById("user_account_btn_mobile");
    if (userAccountBtnMobile) userAccountBtnMobile.addEventListener("click", clickHandler, { signal });

    if (window.googleDriveSave) {
      this._originalCheckAuth = window.googleDriveSave.checkAuth.bind(window.googleDriveSave);
      window.googleDriveSave.checkAuth = async (...args) => {
        const result = await this._originalCheckAuth(...args);
        this.updateUserAccountIcon();
        return result;
      };
    }
    if (window.supabaseAuth) {
      this._originalSignOut = window.supabaseAuth.signOut.bind(window.supabaseAuth);
      window.supabaseAuth.signOut = (...args) => {
        this._originalSignOut(...args);
        this.updateUserAccountIcon();
      };
    }
  }

  teardownUserAccountButton() {
    if (this._userAccountUnmount) {
      this._userAccountUnmount();
      this._userAccountUnmount = null;
    }
    if (this._buttonAbortController) {
      this._buttonAbortController.abort();
      this._buttonAbortController = null;
    }
    if (window.googleDriveSave && this._originalCheckAuth) {
      window.googleDriveSave.checkAuth = this._originalCheckAuth;
      this._originalCheckAuth = null;
    }
    if (window.supabaseAuth && this._originalSignOut) {
      window.supabaseAuth.signOut = this._originalSignOut;
      this._originalSignOut = null;
    }
  }

  _syncUserAccountDisplay() {
    const { isSignedIn } = getAuthState();
    const icon = isSignedIn ? "👤" : "🔐";
    const title = isSignedIn ? "Account (Signed In)" : "Sign In";
    if (this.ui.uiState?.user_account_display) {
      this.ui.uiState.user_account_display = { icon, title };
    }
  }

  updateUserAccountIcon() {
    this._syncUserAccountDisplay();
  }

  handleUserAccountClick() {
    const { isSignedIn } = getAuthState();
    if (isSignedIn) this.ui.modalOrchestrator.showModal(MODAL_IDS.PROFILE);
    else this.ui.modalOrchestrator.showModal(MODAL_IDS.LOGIN);
  }

  getDoctrineInfo() {
    const game = this.ui.game;
    if (!game?.tech_tree || !game?.upgradeset?.treeList) return null;
    const doctrine = game.upgradeset.treeList.find((t) => t.id === game.tech_tree);
    return doctrine ? { id: doctrine.id, title: doctrine.title, subtitle: doctrine.subtitle } : null;
  }

  renderDoctrineTreeViewer() {
    const { game } = this.ui;
    const container = document.getElementById("doctrine_tree_viewer_content");
    const article = document.getElementById("doctrine_tree_viewer");
    if (!container || !article) return;
    if (!game?.upgradeset?.treeList?.length) {
      article.classList.add("hidden");
      return;
    }
    article.classList.remove("hidden");
    const currentId = game.tech_tree || null;
    const cost = game.RESPER_DOCTRINE_EP_COST ?? 50;
    const canRespec = !!game.tech_tree && (game.state.current_exotic_particles ?? 0) >= cost;
    const respecLabel = `Respec doctrine (${cost} EP)`;
    const respecTitle = canRespec
      ? "Reset doctrine and that path's upgrades; costs Exotic Particles"
      : (game.tech_tree ? `Requires ${cost} Exotic Particles` : "No doctrine selected");
    const tpl = html`
      ${repeat(
        game.upgradeset.treeList,
        (t) => t.id,
        (tree) => {
          const isCurrent = tree.id === currentId;
          const label = isCurrent ? "Your doctrine" : "Locked";
          const names = (tree.upgrades || []).map((id) => game.upgradeset.getUpgrade(id)?.title ?? id);
          return html`
            <div class="doctrine-tree-block" data-doctrine=${tree.id} style="border-left: 3px solid ${tree.color || "#666"}; margin-bottom: 0.75rem; padding: 0.5rem 0 0.5rem 0.75rem;">
              <div style="font-size: 0.7rem; font-weight: bold; color: ${isCurrent ? "rgb(200 220 180)" : "rgb(120 120 120)"};">${tree.title}</div>
              <div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.35rem;">${label}</div>
              <ul style="font-size: 0.6rem; color: rgb(170 180 160); margin: 0; padding-left: 1.25rem; list-style: disc;">
                ${names.slice(0, 24).map((name) => html`<li>${name}</li>`)}
                ${names.length > 24 ? html`<li style="color: rgb(120 130 110);">+${names.length - 24} more</li>` : ""}
              </ul>
            </div>
          `;
        }
      )}
      <div class="doctrine-respec-row">
        <button id="respec_doctrine_btn" class="pixel-btn nav-btn" type="button" title=${respecTitle} ?disabled=${!canRespec} @click=${() => {
          if (!game?.respecDoctrine?.()) return;
          this.renderDoctrineTreeViewer();
          this.ui.stateManager.setVar("current_exotic_particles", game.state.current_exotic_particles);
        }}>${respecLabel}</button>
      </div>
    `;
    render(tpl, container);
  }

  getReactorClassification() {
    const reactor = this.ui.game?.reactor;
    return reactor ? reactor.getClassification() : null;
  }

  showProfileModal() {
    const { googleSignedIn, supabaseSignedIn } = getAuthState();
    const { game } = this.ui;
    const googleUserInfo = googleSignedIn ? window.googleDriveSave.getUserInfo() : null;
    const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;
    const doctrineInfo = this.getDoctrineInfo();
    const classification = this.getReactorClassification();
    const r = game?.reactor;

    const modal = modalOverlay("user_login_modal", () => modal.remove());
    const content = document.createElement("div");
    content.className = "nav-auth-modal nav-auth-terminal";
    content.style.cssText = "max-width: 440px; max-height: 90vh; overflow-y: auto;";
    modal.appendChild(content);

    const onClose = () => modal.remove();
    const onLogout = () => performSignOut(modal, googleSignedIn, supabaseSignedIn, () => this.updateUserAccountIcon());

    const accountText = googleUserInfo?.email ? "Signed in with Google · " + googleUserInfo.email : supabaseUser?.email ? "Signed in with Email · " + supabaseUser.email : "Signed in";

    const tpl = html`
      ${CloseButton(modal, onClose)}
      <h2 style="margin: 0 0 1rem; font-size: 1rem; color: rgb(200 220 180); font-family: inherit;">Profile</h2>
      <div style="font-size: 0.7rem; margin-bottom: 1rem; color: rgb(180 190 170);">${accountText}</div>
      ${doctrineInfo ? html`
        <div style="margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid rgb(60 60 60);">
          <div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.25rem;">Doctrine</div>
          <div style="font-size: 0.75rem; color: rgb(200 220 180);">${doctrineInfo.title}</div>
          <div style="font-size: 0.5rem; color: rgb(120 130 110);">${doctrineInfo.subtitle || ""}</div>
        </div>
      ` : ""}
      ${classification ? html`
        <div style="margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid rgb(60 60 60);">
          <div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.25rem;">Reactor classification</div>
          <div style="font-size: 0.7rem; color: rgb(74 222 128); font-weight: bold; margin-bottom: 0.25rem;">${classification.classification}</div>
          <div style="font-size: 0.5rem; color: rgb(150 160 140); line-height: 1.4;">${classification.summary}</div>
        </div>
      ` : ""}
      ${r ? html`
        <div style="margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid rgb(60 60 60);">
          <div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.35rem;">Reactor stats</div>
          <div style="font-size: 0.55rem; color: rgb(180 190 170); display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 1rem; line-height: 1.5;">
            <span>Max heat</span><span>${fmt(Number(r.max_heat) || 0, 0)}</span>
            <span>Max power</span><span>${fmt(Number(r.max_power) || 0, 0)}</span>
            <span>Heat gen/tick</span><span>${fmt(Number(r.stats_heat_generation) || 0, 0)}</span>
            <span>Vent</span><span>${fmt(Number(r.stats_vent) || 0, 0)}</span>
            <span>Net heat/tick</span><span>${fmt(Number(r.stats_net_heat) || 0, 0)}</span>
            <span>Inlet</span><span>${fmt(Number(r.stats_inlet) || 0, 0)}</span>
            <span>Outlet</span><span>${fmt(Number(r.stats_outlet) || 0, 0)}</span>
          </div>
        </div>
      ` : ""}
      <button class="splash-btn splash-btn-exit" style="width: 100%;" @click=${onLogout}>Sign Out</button>
    `;
    render(tpl, content);
    document.body.appendChild(modal);
  }

  showLoginModal() {
    let removeModal;
    const modal = modalOverlay("user_login_modal", () => removeModal?.());
    const content = document.createElement("div");
    content.className = "nav-auth-modal nav-auth-terminal";
    modal.appendChild(content);

    const onGoogleClick = async () => {
      if (!window.googleDriveSave) return;
      try {
        await window.googleDriveSave.signIn();
        await window.googleDriveSave.checkAuth(false);
        this.updateUserAccountIcon();
        removeModal();
      } catch (error) {
        logger.error("Google sign-in error:", error);
      }
    };
    const onEmailToggle = () => {
      const form = content.querySelector("#nav-email-auth-form");
      if (form) form.classList.toggle("hidden");
    };
    const getCredentials = () => {
      const emailInput = content.querySelector("#nav-supabase-email");
      const passwordInput = content.querySelector("#nav-supabase-password");
      return { email: emailInput?.value.trim(), password: passwordInput?.value };
    };
    removeModal = () => {
      this._loginModalFeedbackUnmount?.();
      this._loginModalFeedbackUnmount = null;
      modal.remove();
    };
    const showMessage = (text, isError) => {
      this.ui.uiState.user_account_feedback = { text, isError };
    };
    const onSignIn = async () => {
      const { email, password } = getCredentials();
      if (!email || !password) { showMessage("Please enter email and password", true); return; }
      showMessage("Signing in...");
      const { error } = await window.supabaseAuth.signInWithPassword(email, password);
      if (error) { showMessage(error, true); return; }
      showMessage("Signed in successfully!");
      const pw = content.querySelector("#nav-supabase-password");
      if (pw) pw.value = "";
      setTimeout(() => { this.updateUserAccountIcon(); removeModal(); }, 1000);
    };
    const onSignUp = async () => {
      const { email, password } = getCredentials();
      if (!email || !password) { showMessage("Please enter email and password", true); return; }
      if (password.length < 6) { showMessage("Password must be at least 6 characters", true); return; }
      showMessage("Signing up...");
      const { error } = await window.supabaseAuth.signUp(email, password);
      if (error) { showMessage(error, true); return; }
      showMessage("Sign up successful! Please check your email to confirm your account.");
      const pw = content.querySelector("#nav-supabase-password");
      if (pw) pw.value = "";
    };
    const onReset = async () => {
      const { email } = getCredentials();
      if (!email) { showMessage("Please enter your email address", true); return; }
      showMessage("Sending password reset email...");
      const { error } = await window.supabaseAuth.resetPasswordForEmail(email);
      if (error) { showMessage(error, true); return; }
      showMessage("Password reset email sent! Please check your email.");
    };

    const tpl = html`
      ${CloseButton(modal, removeModal)}
      <div class="nav-auth-terminal-prompt">> AWAITING OPERATOR CREDENTIALS</div>
      <div class="nav-auth-options">
        <button class="splash-btn nav-auth-option-btn" @click=${onGoogleClick}>
          <span class="splash-auth-comms-icon">[G]</span> Sign in with Google
        </button>
        <button class="splash-btn nav-auth-option-btn" @click=${onEmailToggle}>
          <span class="splash-auth-comms-icon">[M]</span> Sign in with Email
        </button>
      </div>
      <div id="nav-email-auth-form" class="nav-auth-email-form hidden">
        <input type="email" id="nav-supabase-email" placeholder="Email" class="pixel-input nav-auth-input">
        <input type="password" id="nav-supabase-password" placeholder="Password" class="pixel-input nav-auth-input">
        <div class="splash-auth-form-actions">
          <button class="splash-btn splash-auth-form-btn" @click=${onSignIn}>Sign In</button>
          <button class="splash-btn splash-auth-form-btn" @click=${onSignUp}>Sign Up</button>
          <button class="splash-btn splash-auth-form-btn" @click=${onReset}>Reset</button>
        </div>
        <div id="nav-supabase-message" class="splash-auth-message"></div>
      </div>
    `;
    render(tpl, content);
    document.body.appendChild(modal);
    this.ui.uiState.user_account_feedback = { text: "", isError: false };
    const msgEl = content.querySelector("#nav-supabase-message");
    if (msgEl) {
      this._loginModalFeedbackUnmount = ReactiveLitComponent.mountMulti(
        [{ state: this.ui.uiState, keys: ["user_account_feedback"] }],
        () => {
          const { text, isError } = this.ui.uiState?.user_account_feedback ?? { text: "", isError: false };
          return html`<span style=${styleMap({ color: isError ? "#ff4444" : "#44ff44" })}>${text}</span>`;
        },
        msgEl
      );
    }
  }

  showLogoutModal() {
    const { googleSignedIn, supabaseSignedIn } = getAuthState();
    const googleUserInfo = googleSignedIn ? window.googleDriveSave.getUserInfo() : null;
    const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;
    const provider = googleUserInfo ? "Google" : supabaseUser ? "Email" : null;
    const email = googleUserInfo?.email || supabaseUser?.email || null;

    const modal = modalOverlay("user_logout_modal", () => modal.remove());
    const content = document.createElement("div");
    content.className = "nav-auth-modal";
    modal.appendChild(content);

    const onLogout = () => performSignOut(modal, googleSignedIn, supabaseSignedIn, () => this.updateUserAccountIcon());

    const tpl = html`
      ${CloseButton(modal, () => modal.remove())}
      ${provider ? html`<div style="font-size: 0.8rem; margin-bottom: 1rem;">Signed in with ${provider}</div>` : ""}
      ${email ? html`<div style="font-size: 0.7rem; opacity: 0.8; margin-bottom: 1rem;">${email}</div>` : ""}
      <button class="splash-btn" style="background: #d32f2f; border-color: #b71c1c; width: 100%;" @click=${onLogout}>Sign Out</button>
    `;
    render(tpl, content);
    document.body.appendChild(modal);
  }
}

class PerformanceUI {
  constructor(ui) {
    this.ui = ui;
    this._fpsHistory = [];
    this._tpsHistory = [];
    this._lastFrameTime = performance.now();
    this._lastTickTime = performance.now();
    this._frameCount = 0;
    this._tickCount = 0;
    this._performanceUpdateInterval = null;
    this._unmount = null;
  }

  startPerformanceTracking() {
    if (this._performanceUpdateInterval) return;
    this._performanceUpdateInterval = setInterval(() => {
      this._updatePerformanceStats();
    }, 1000);
    this._mountPerformanceDisplay();
  }

  stopPerformanceTracking() {
    if (this._performanceUpdateInterval) {
      clearInterval(this._performanceUpdateInterval);
      this._performanceUpdateInterval = null;
    }
    if (this._unmount) {
      this._unmount();
      this._unmount = null;
    }
  }

  recordFrame() {
    const now = performance.now();
    this._frameCount++;
    if (now - this._lastFrameTime >= 1000) {
      const fps = this._frameCount;
      this._fpsHistory.push(fps);
      if (this._fpsHistory.length > 10) this._fpsHistory.shift();
      this._frameCount = 0;
      this._lastFrameTime = now;
    }
  }

  recordTick() {
    const now = performance.now();
    this._tickCount++;
    if (now - this._lastTickTime >= 1000) {
      const tps = this._tickCount;
      this._tpsHistory.push(tps);
      if (this._tpsHistory.length > 10) this._tpsHistory.shift();
      this._tickCount = 0;
      this._lastTickTime = now;
    }
  }

  _updatePerformanceStats() {
    const ui = this.ui;
    if (!ui.uiState) return;
    const avgFPS =
      this._fpsHistory.length > 0
        ? Math.round(this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length)
        : 0;
    const avgTPS =
      this._tpsHistory.length > 0
        ? Math.round(this._tpsHistory.reduce((a, b) => a + b, 0) / this._tpsHistory.length)
        : 0;
    ui.uiState.performance_stats = {
      fps: avgFPS,
      tps: avgTPS,
      fps_color: avgFPS >= 55 ? "#4CAF50" : avgFPS >= 45 ? "#FF9800" : "#F44336",
      tps_color: avgTPS >= 30 ? "#4CAF50" : avgTPS >= 20 ? "#FF9800" : "#F44336",
    };
  }

  _performanceDisplayTemplate() {
    const stats = this.ui.uiState?.performance_stats ?? { fps: 0, tps: 0, fps_color: "#4CAF50", tps_color: "#4CAF50" };
    return html`
      <strong title="Tick Rate">
        <img src="img/ui/icons/icon_time.png" alt="TPS" class="icon-inline" />
        <span id="tps_display" style="color: ${stats.tps_color}">${stats.tps}</span>
      </strong>
    `;
  }

  _mountPerformanceDisplay() {
    const ui = this.ui;
    const engineStatus = document.getElementById("engine_status");
    if (!engineStatus || !ui.uiState) return;
    const firstLi = engineStatus.querySelector("li:first-child");
    if (!firstLi) return;
    this._unmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["performance_stats"] }],
      () => this._performanceDisplayTemplate(),
      firstLi
    );
  }
}


class ModalOrchestrationUI {
  constructor(ui) {
    this.ui = ui;
    this._contextModalHandler = null;
  }

  subscribeToContextModalEvents(game) {
    if (!game?.on) return;
    this._contextModalHandler = (payload) => this.ui.modalOrchestrator.showModal(MODAL_IDS.CONTEXT, payload);
    game.on("showContextModal", this._contextModalHandler);
  }

  unsubscribeContextModal(game) {
    if (game?.off && this._contextModalHandler) game.off("showContextModal", this._contextModalHandler);
    this._contextModalHandler = null;
  }

  showChapterCelebration(chapterIndex) {
    const names = ["First Fission", "Scaling Production", "High-Energy Systems", "The Experimental Frontier"];
    const name = names[chapterIndex] || `Chapter ${chapterIndex + 1}`;
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "alert");
    render(html`
      <div class="chapter-celebration-overlay chapter-celebration-visible">
        <div class="chapter-celebration-content">
          <div class="chapter-celebration-badge">Chapter Complete</div>
          <h2 class="chapter-celebration-title">${name}</h2>
        </div>
      </div>
    `, overlay);
    document.body.appendChild(overlay);
    if (this.ui.game?.audio) this.ui.game.audio.play("upgrade");
    const inner = overlay.querySelector(".chapter-celebration-overlay");
    const t = setTimeout(() => {
      if (inner) inner.classList.remove("chapter-celebration-visible");
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 400);
    }, 3200);
    overlay._celebrationTimer = t;
  }

  initializeSellAllButton() {
    const sellAllBtn = document.getElementById("reactor_sell_all_btn");
    if (sellAllBtn) {
      sellAllBtn.onclick = () => {
        if (!this.ui.game || !this.ui.game.tileset) return;

        const wasPaused = this.ui.stateManager.getVar("pause");
        this.ui.stateManager.setVar("pause", true);

        const existingSummary = this.buildExistingPartSummary();

        let checkedTypes = {};
        existingSummary.forEach(item => { checkedTypes[item.id] = true; });

        this.ui.modalOrchestrator.showModal(MODAL_IDS.COPY_PASTE, {
          action: "sell",
          summary: existingSummary,
          checkedTypes,
          previousPauseState: wasPaused,
        });
      };
    }
  }

  buildExistingPartSummary() {
    const ui = this.ui;
    if (!ui.game || !ui.game.tileset || !ui.game.tileset.tiles_list) return [];

    const summary = {};
    ui.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) {
        const key = `${tile.part.id}|${tile.part.level || 1}`;
        if (!summary[key]) {
          summary[key] = {
            id: tile.part.id,
            type: tile.part.type,
            lvl: tile.part.level || 1,
            title: tile.part.title || tile.part.id,
            unitPrice: tile.part.cost,
            count: 0,
            total: 0,
            tileIds: []
          };
        }
        summary[key].count++;
        summary[key].total += tile.calculateSellValue?.() ?? tile.part.cost;
        summary[key].tileIds.push(tile.id);
      }
    });

    return Object.values(summary);
  }

  hideModal() {
    this.ui.modalOrchestrator.hideModal(MODAL_IDS.COPY_PASTE);
  }
}


const MOBILE_ONLY_IDS = new Set([
  "control_deck_power_btn", "control_deck_heat_btn", "control_deck_money", "control_deck_power", "control_deck_heat",
  "mobile_passive_top_bar", "mobile_passive_ep", "mobile_passive_money_value", "mobile_passive_pause_btn",
]);

const REACTOR_LAZY_IDS = new Set([
  "info_power", "mobile_passive_ep", "mobile_passive_money_value", "mobile_passive_pause_btn",
  "control_deck_power_btn", "control_deck_heat_btn", "control_deck_money", "control_deck_power", "control_deck_heat",
]);

const pageElements = {
  global: [
    "main", "info_bar", "info_heat", "info_power", "info_money", "info_heat_denom", "info_power_denom",
    "info_bar_heat_btn", "info_bar_power_btn", "info_heat_desktop", "info_power_desktop", "info_money_desktop",
    "info_heat_denom_desktop", "info_power_denom_desktop", "info_bar_heat_btn_desktop", "info_bar_power_btn_desktop",
    "info_ep", "info_ep_desktop", "info_ep_value", "info_ep_value_desktop", "parts_tab_contents",
    "cells", "reflectors", "capacitors", "vents", "heatExchangers", "heatInlets", "heatOutlets", "coolantCells",
    "reactorPlatings", "particleAccelerators", "overflowValves", "topupValves", "checkValves",
    "objectives_toast_btn", "objectives_toast_title", "reactor_control_deck", "control_deck_power_btn",
    "control_deck_heat_btn", "control_deck_money", "control_deck_power", "control_deck_heat",
    "mobile_passive_top_bar", "mobile_passive_ep", "mobile_passive_money_value", "mobile_passive_pause_btn",
    "control_deck_build_fab", "tooltip", "tooltip_data", "basic_overview_section", "modal-root",
    "bottom_nav", "main_top_nav", "reboot_btn", "refund_btn", "respec_doctrine_btn", "fullscreen_toggle", "settings_btn", "splash_close_btn"
  ],
  reactor_section: ["reactor", "reactor_background", "reactor_wrapper", "reactor_section", "parts_section", "meltdown_banner"],
  upgrades_section: ["upgrades_section", "upgrades_content_wrapper", "cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades", "vent_upgrades", "exchanger_upgrades", "debug_section", "debug_toggle_btn", "debug_variables"],
  experimental_upgrades_section: ["experimental_upgrades_section", "experimental_upgrades_content_wrapper", "exotic_particles_display", "current_exotic_particles", "total_exotic_particles", "experimental_laboratory", "experimental_boost", "experimental_particle_accelerators", "experimental_cells", "experimental_cells_boost", "experimental_parts"],
  about_section: ["about_section"],
  privacy_policy_section: ["privacy_policy_section"],
  soundboard_section: ["soundboard_section", "sound_warning_intensity", "sound_warning_value"]
};

class CoreLoopUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('CoreLoop', this);
  }

  processUpdateQueue() {
    this._syncDisplayValuesFromState();
    this.applyStateToDom();
  }

  _syncDisplayValuesFromState() {
    const ui = this.ui;
    const game = ui.game;
    if (!game?.state || !ui.displayValues) return;
    const s = game.state;
    const d = ui.displayValues;
    const toNum = (v) => (v != null && typeof v.toNumber === "function" ? v.toNumber() : Number(v ?? 0));
    if (d.money) d.money.target = toNum(s.current_money);
    if (d.heat) d.heat.target = toNum(s.current_heat);
    if (d.power) d.power.target = toNum(s.current_power);
    if (d.ep) d.ep.target = toNum(game.exoticParticleManager?.exotic_particles ?? s.current_exotic_particles ?? 0);
  }

  updateRollingNumbers(dt) {
    const ui = this.ui;
    if (!ui.displayValues) return;
    const LERP_SPEED = 8;
    const lerp = (obj, epsilon = 0.06) => {
      if (!obj || typeof obj.current !== "number" || typeof obj.target !== "number") return;
      const diff = obj.target - obj.current;
      if (Math.abs(diff) < epsilon) obj.current = obj.target;
      else obj.current += diff * Math.min(1, (dt / 1000) * LERP_SPEED);
    };
    lerp(ui.displayValues.money);
    lerp(ui.displayValues.heat);
    lerp(ui.displayValues.power, 0.02);
    lerp(ui.displayValues.ep);
  }

  cacheDOMElements(pageId = null) {
    const ui = this.ui;
    let elementsToCache = [...pageElements.global];
    if (pageId && pageElements[pageId]) {
      elementsToCache = [...elementsToCache, ...pageElements[pageId]];
    }
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    const onReactorPage = pageId === "reactor_section";
    elementsToCache.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        ui.DOMElements[id] = el;
        const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        ui.DOMElements[camelCaseKey] = el;
      } else if (
        pageElements.global.includes(id) &&
        !(MOBILE_ONLY_IDS.has(id) && !isMobile) &&
        !(REACTOR_LAZY_IDS.has(id) && !onReactorPage)
      ) {
        logger.log('warn', 'ui', `Global element with id '${id}' not found in DOM.`);
      }
    });
    return true;
  }

  getElement(id) {
    const ui = this.ui;
    if (ui.DOMElements[id]) return ui.DOMElements[id];
    const el = document.getElementById(id);
    if (el) {
      ui.DOMElements[id] = el;
      const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      ui.DOMElements[camelCaseKey] = el;
      return el;
    }
    return null;
  }

  getTutorialTarget(stepKey) {
    const ui = this.ui;
    if (!ui.game) return null;
    const mobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    switch (stepKey) {
      case "place_cell": {
        const slots = ui.stateManager?.getQuickSelectSlots?.() ?? [];
        const uraniumSlotIndex = slots.findIndex((s) => s.partId === "uranium1");
        const idx = uraniumSlotIndex >= 0 ? uraniumSlotIndex : 0;
        return document.querySelector(`.quick-select-slot[data-index="${idx}"]`);
      }
      case "place_on_reactor":
        return this.getElement("reactor_wrapper") || document.getElementById("reactor_wrapper");
      case "see_heat_rise":
        return document.getElementById("control_deck_heat_btn")?.offsetParent ? document.getElementById("control_deck_heat_btn") : document.getElementById("info_bar_heat_btn_desktop");
      case "sell_power":
        return document.getElementById("control_deck_power_btn")?.offsetParent ? document.getElementById("control_deck_power_btn") : document.getElementById("info_bar_power_btn_desktop");
      case "place_vent":
        return mobile ? document.querySelector(".quick-select-slot[data-index=\"1\"]") : document.getElementById("part_btn_vent1");
      case "claim_objective": {
        const toast = document.getElementById("objectives_toast_btn");
        if (!toast?.classList.contains("is-complete")) return null;
        return toast.classList.contains("is-expanded") ? toast.querySelector(".objectives-claim-pill") || toast : toast;
      }
      default:
        return null;
    }
  }

  getTutorialGridTile(stepKey) {
    const ui = this.ui;
    if (stepKey !== "place_on_reactor" || !ui.game) return null;
    const g = ui.gridCanvasRenderer;
    if (!g) return null;
    const rows = g.getRows();
    const cols = g.getCols();
    if (!rows || !cols) return null;
    return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
  }

  getTileRectInViewport(row, col) {
    const ui = this.ui;
    const g = ui.gridCanvasRenderer;
    const canvas = g?.getCanvas();
    if (!canvas || row == null || col == null) return null;
    const rect = canvas.getBoundingClientRect();
    const rows = g.getRows();
    const cols = g.getCols();
    if (!rows || !cols) return null;
    const width = rect.width / cols;
    const height = rect.height / rows;
    return {
      top: rect.top + row * height,
      left: rect.left + col * width,
      width,
      height,
      bottom: rect.top + (row + 1) * height,
      right: rect.left + (col + 1) * width,
    };
  }

  getDisplayValue(game, configKey) {
    const state = game?.state;
    const reactor = game?.reactor;
    if (!state) return undefined;
    if (configKey === "exotic_particles") return game?.exoticParticleManager?.exotic_particles;
    if (configKey === "total_heat") return state.stats_heat_generation;
    if (configKey === "heat_controlled") return state.heat_controlled ?? reactor?.heat_controlled;
    if (configKey === "auto_sell_multiplier") return reactor?.auto_sell_multiplier;
    if (configKey === "vent_multiplier_eff") return state.vent_multiplier_eff ?? reactor?.vent_multiplier_eff;
    if (configKey === "manual_override_mult") return reactor?.manual_override_mult;
    if (configKey === "override_end_time") return reactor?.override_end_time;
    if (configKey === "power_to_heat_ratio") return reactor?.power_to_heat_ratio;
    if (configKey === "flux_accumulator_level") return reactor?.flux_accumulator_level;
    return state[configKey];
  }

  applyStateToDom() {
    const ui = this.ui;
    const game = ui.game;
    const config = ui.var_objs_config;
    if (!config || !game?.state) return;
    for (const configKey of Object.keys(config)) {
      const val = this.getDisplayValue(game, configKey);
      if (val === undefined) continue;
      const cfg = config[configKey];
      if (cfg) cfg.onupdate?.(val);
    }
  }

  applyStateToDomForKeys(keys) {
    const ui = this.ui;
    const game = ui.game;
    const config = ui.var_objs_config;
    if (!config || !game) return;
    for (const configKey of keys) {
      const cfg = config[configKey];
      if (!cfg) continue;
      const val = this.getDisplayValue(game, configKey);
      if (val === undefined) continue;
      cfg.onupdate?.(val);
    }
  }

  initVarObjsConfig() {
    this.ui.controlDeckUI.initVarObjsConfig();
  }

  runUpdateInterfaceLoop(timestamp = 0) {
    const ui = this.ui;
    if (ui._updateLoopStopped || typeof document === 'undefined' || !document) return;
    if (typeof document.getElementById !== 'function') return;

    if (!ui._lastUiTime) ui._lastUiTime = timestamp;
    const dt = timestamp - ui._lastUiTime;
    ui._lastUiTime = timestamp;

    ui._firstFrameSyncDone = true;
    if (ui.particleSystem && ui._particleCtx) {
      ui.particleSystem.update(dt);
      ui._particleCtx.clearRect(0, 0, ui._particleCanvas.width, ui._particleCanvas.height);
      ui.particleSystem.draw(ui._particleCtx);
    }

    if (timestamp - ui.last_interface_update > ui.update_interface_interval) {
      ui.last_interface_update = timestamp;
      ui.performanceUI.recordFrame();

      if (ui.gridCanvasRenderer && ui.game) {
        ui.gridCanvasRenderer.render(ui.game);
      }

      const onReactorPage = ui.game?.router?.currentPageId === "reactor_section";
      const engineShouldBeRunning = ui.game && !ui.game.paused && onReactorPage;
      if (engineShouldBeRunning && ui.game?.engine && !ui.game.engine.running) {
        if (!ui._reactorFailedModalShown) {
          ui._reactorFailedModalShown = true;
          ui.modalOrchestrator?.showModal(MODAL_IDS.REACTOR_FAILED_TO_START, { game: ui.game });
        }
      } else if (ui.game?.engine?.running || ui.game?.paused || !onReactorPage) {
        ui._reactorFailedModalShown = false;
      }

      if (ui.game) {
        ui.navIndicatorsUI.updateLeaderboardIcon();
      }

      if (ui.game?.tooltip_manager?.tooltip_showing && ui.game?.tooltip_manager?.needsLiveUpdates) {
        ui.game.tooltip_manager.update();
      }

      ui.heatVisualsUI.drawHeatFlowOverlay();
    }

    ui.update_interface_task = requestAnimationFrame((ts) => ui.coreLoopUI.runUpdateInterfaceLoop(ts));
  }
}


function handleSpacePause(ui, e) {
  if (!e.target.matches("input, textarea, [contenteditable]")) {
    e.preventDefault();
    if (ui.uiState) ui.uiState.is_paused = !ui.uiState.is_paused;
    else {
      const currentPauseState = ui.stateManager.getVar("pause");
      ui.stateManager.setVar("pause", !currentPauseState);
    }
  }
}

function cheatAddMoney(ui, amount) {
  ui.game.markCheatsUsed();
  ui.game.addMoney(amount);
  ui.navIndicatorsUI.updateLeaderboardIcon();
}

function handleExoticParticleCheat(ui) {
  ui.game.grantCheatExoticParticle(1);
  ui.navIndicatorsUI.updateLeaderboardIcon();
  ui.stateManager.setVar("exotic_particles", ui.game.exoticParticleManager.exotic_particles);
  ui.stateManager.setVar("total_exotic_particles", ui.game.state.total_exotic_particles);
  ui.stateManager.setVar("current_exotic_particles", ui.game.state.current_exotic_particles);
  ui.game.upgradeset.check_affordability(ui.game);
}

function handleCompleteObjectiveCheat(ui) {
  if (ui.game.objectives_manager && ui.game.objectives_manager.current_objective_def) {
    ui.game.objectives_manager.current_objective_def.completed = true;
    ui.stateManager.handleObjectiveCompleted();
    const displayObjective = {
      ...ui.game.objectives_manager.current_objective_def,
      title: typeof ui.game.objectives_manager.current_objective_def.title === "function"
        ? ui.game.objectives_manager.current_objective_def.title()
        : ui.game.objectives_manager.current_objective_def.title,
      completed: true
    };
    ui.stateManager.handleObjectiveLoaded(displayObjective, ui.game.objectives_manager.current_objective_index);
  }
}

function handleAddTimeTicks(ui) {
  logger.log('debug', 'ui', 'CTRL+0 pressed');
  if (ui.game.engine) ui.game.engine.addTimeTicks(1000);
}

const MONEY_CHEATS = { "1": 10, "2": 100, "3": 1000, "4": 10000, "5": 100000, "6": 1000000, "7": 10000000, "8": 100000000 };

const CTRL_KEY_HANDLERS = {
  "9": (ui, e) => {
    e.preventDefault();
    ui.game.markCheatsUsed();
    ui.startCtrl9MoneyIncrease();
    ui.navIndicatorsUI.updateLeaderboardIcon();
  },
  "e": (ui, e) => { e.preventDefault(); handleExoticParticleCheat(ui); },
  "E": (ui, e) => { e.preventDefault(); handleExoticParticleCheat(ui); },
  "x": (ui, e) => { e.preventDefault(); handleCompleteObjectiveCheat(ui); },
  "X": (ui, e) => { e.preventDefault(); handleCompleteObjectiveCheat(ui); },
  "u": (ui, e) => { e.preventDefault(); ui.partsPanelUI.unlockAllPartsForTesting(); },
  "U": (ui, e) => { e.preventDefault(); ui.partsPanelUI.unlockAllPartsForTesting(); },
  "h": (ui, e) => { e.preventDefault(); ui.gridController.clearReactorHeat(); },
  "H": (ui, e) => { e.preventDefault(); ui.gridController.clearReactorHeat(); },
  "0": (ui, e) => { e.preventDefault(); handleAddTimeTicks(ui); },
};

function setupKeyboardShortcuts(ui) {
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      handleSpacePause(ui, e);
      return;
    }
    if (!e.ctrlKey) return;
    const amount = MONEY_CHEATS[e.key];
    if (amount != null) {
      e.preventDefault();
      cheatAddMoney(ui, amount);
      return;
    }
    const handler = CTRL_KEY_HANDLERS[e.key];
    if (handler) handler(ui, e);
  });
}

function setupCtrl9Handlers(ui) {
  document.addEventListener("keyup", (e) => {
    if (e.ctrlKey && e.key === "9") {
      ui.stopCtrl9MoneyIncrease();
    }
  });
}

function startCtrl9MoneyIncrease(ui) {
  stopCtrl9MoneyIncrease(ui);
  ui.ctrl9HoldStartTime = Date.now();
  ui.game.addMoney(ui.ctrl9BaseAmount);
  ui.ctrl9MoneyInterval = setInterval(() => {
    const holdDuration = Date.now() - ui.ctrl9HoldStartTime;
    const secondsHeld = holdDuration / 1000;
    const exponentialAmount = Math.floor(ui.ctrl9BaseAmount * Math.pow(ui.ctrl9ExponentialRate, secondsHeld));
    ui.game.addMoney(exponentialAmount);
  }, ui.ctrl9IntervalMs);
}

function stopCtrl9MoneyIncrease(ui) {
  if (ui.ctrl9MoneyInterval) {
    clearInterval(ui.ctrl9MoneyInterval);
    ui.ctrl9MoneyInterval = null;
  }
  ui.ctrl9HoldStartTime = null;
}


const setupNavGroup = (ui, signal) => {
  const setupNav = (container) => {
    if (!container) return;
    container.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-page]");
      if (btn?.dataset.page) ui.game.router.loadPage(btn.dataset.page);
    }, { signal });
  };
  const coreLoop = ui.registry?.get?.("CoreLoop");
  const getEl = (id) => coreLoop?.getElement?.(id) ?? ui.DOMElements?.[id] ?? document.getElementById(id);
  setupNav(getEl("bottom_nav"));
  setupNav(getEl("main_top_nav"));
};

const setupPrestigeListeners = (ui, signal) => {
  const coreLoop = ui.registry?.get?.("CoreLoop");
  const getEl = (id) => coreLoop?.getElement?.(id) ?? ui.DOMElements?.[id] ?? document.getElementById(id);
  getEl("reboot_btn")?.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.PRESTIGE, { mode: "refund" }), { signal });
  getEl("refund_btn")?.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.PRESTIGE, { mode: "prestige" }), { signal });
};

const setupDoctrineAndMiscListeners = (ui, signal) => {
  const getEl = (id) => ui.registry?.get?.("CoreLoop")?.getElement?.(id) ?? ui.DOMElements?.[id] ?? document.getElementById(id);
  getEl("respec_doctrine_btn")?.addEventListener("click", () => {
    if (!ui.game?.respecDoctrine?.()) return;
    ui.userAccountUI.renderDoctrineTreeViewer();
    ui.stateManager.setVar("current_exotic_particles", ui.game.state.current_exotic_particles);
  }, { signal });
  
  const fullscreenButton = ui.coreLoopUI.getElement("fullscreen_toggle");
  if (fullscreenButton && ui.uiState) {
    ui._fullscreenReactiveUnmount?.();
    fullscreenButton.addEventListener("click", () => ui.deviceFeatures.toggleFullscreen(), { signal });
    document.addEventListener("fullscreenchange", () => ui.deviceFeatures.updateFullscreenButtonState(), { signal });
    ui.deviceFeatures.updateFullscreenButtonState();
    ui._fullscreenReactiveUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["fullscreen_display"] }],
      () => {
        const d = ui.uiState?.fullscreen_display ?? { icon: "⛶", title: "Toggle Fullscreen" };
        if (fullscreenButton.title !== d.title) fullscreenButton.title = d.title;
        fullscreenButton.textContent = d.icon ?? "⛶";
        return null;
      },
      fullscreenButton
    );
  } else if (fullscreenButton) {
    fullscreenButton.addEventListener("click", () => ui.deviceFeatures.toggleFullscreen(), { signal });
    document.addEventListener("fullscreenchange", () => ui.deviceFeatures.updateFullscreenButtonState(), { signal });
    ui.deviceFeatures.updateFullscreenButtonState();
  }

  const settingsBtn = ui.coreLoopUI.getElement("settings_btn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS), { signal });
  }

  const splashCloseBtn = ui.coreLoopUI.getElement("splash_close_btn");
  if (splashCloseBtn) {
    splashCloseBtn.addEventListener("click", () => {
      window.location.href = window.location.origin + window.location.pathname;
    }, { signal });
  }
};

function setupNavListeners(ui) {
  if (ui._navAbortController) ui._navAbortController.abort();
  ui._navAbortController = new AbortController();
  const { signal } = ui._navAbortController;

  setupNavGroup(ui, signal);
  setupPrestigeListeners(ui, signal);
  setupDoctrineAndMiscListeners(ui, signal);

  ui.partsPanelUI.updatePartsPanelBodyClass();
}

function setupResizeListeners(ui) {
  if (ui._resizeAbortController) ui._resizeAbortController.abort();
  ui._resizeAbortController = new AbortController();
  const { signal } = ui._resizeAbortController;

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const reactor = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
      if (ui.game && reactor && typeof window !== "undefined") {
        if (ui.game.updateBaseDimensions) ui.game.updateBaseDimensions();
        ui.gridScaler.resize();
      }
      ui.game?.ui?.stateManager?.checkObjectiveTextScrolling();
      ui._resizeParticleCanvas?.();
      ui.mobileInfoBarUI?.updateControlDeckValues?.();
    }, 100);
  }, { signal });

  if (window.visualViewport) {
    let viewportTimeout;
    window.visualViewport.addEventListener("resize", () => {
      clearTimeout(viewportTimeout);
      viewportTimeout = setTimeout(() => {
        const reactor = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
        if (ui.game && reactor && typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
          if (ui.game.updateBaseDimensions) ui.game.updateBaseDimensions();
          ui.gridScaler.resize();
        }
        ui._resizeParticleCanvas?.();
      }, 150);
    }, { signal });
  }
}


const layoutViewTemplate = (layoutJson, stats, game, onClose) => {
  try {
    const parsed = JSON.parse(layoutJson);
    const validation = BlueprintSchema.safeParse(parsed);
    if (!validation.success) {
      logger.log("error", "ui", "Invalid blueprint format:", validation.error);
      return html`
        <div class="layout-view-modal-overlay" style="position: fixed; z-index: 10000; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.9);" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div class="layout-view-error" style="color: #fff; padding: 20px;">Invalid layout format</div>
        </div>
      `;
    }
    const { size, parts } = validation.data;
    const rows = size.rows;
    const cols = size.cols;
    const gridStyle = styleMap({
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 32px)`,
      gridTemplateRows: `repeat(${rows}, 32px)`,
      gap: "1px",
      backgroundColor: "#222",
      border: "2px solid #444",
      padding: "2px",
    });
    const partMap = new Map();
    parts.forEach((p) => partMap.set(`${p.r},${p.c}`, p));
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let cellContent = "";
        const cellStyle = {
          width: "32px",
          height: "32px",
          backgroundColor: "#333",
          border: "1px solid #111",
          boxSizing: "border-box",
        };
        let title = `(${r}, ${c})`;
        const partData = partMap.get(`${r},${c}`);
        if (partData) {
          const partId = partData.id;
          const partDef = game?.partset?.getPartById(partId);
          if (partDef) {
            const imgPath = partDef.getImagePath();
            cellStyle.backgroundImage = `url('${imgPath}')`;
            cellStyle.backgroundSize = "contain";
            cellStyle.backgroundPosition = "center";
            cellStyle.backgroundRepeat = "no-repeat";
            title = `${partDef.title} (${r}, ${c})`;
            if (partDef.category === "cell") {
              cellStyle.backgroundColor = "#2a2a2a";
            }
          } else {
            cellContent = "?";
            cellStyle.display = "flex";
            cellStyle.alignItems = "center";
            cellStyle.justifyContent = "center";
            cellStyle.color = "#666";
            cellStyle.fontSize = "10px";
          }
        }
        cells.push(html`<div style=${styleMap(cellStyle)} title=${title}>${cellContent}</div>`);
      }
    }

    return html`
      <div
        class="layout-view-modal-overlay"
        style="position: fixed; z-index: 10000; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; background: rgba(0, 0, 0, 0.9);"
        @click=${(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div style="display: flex; overflow: hidden; flex: 1; flex-direction: column; margin: auto; max-width: 90vw;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 2px solid rgb(68, 68, 68);">
            <h3 style="margin: 0; color: rgb(255, 255, 255);">Reactor Layout</h3>
            <button
              title="Close"
              style="padding: 5px 15px; border: 1px solid rgb(102, 102, 102); background: rgb(68, 68, 68); color: rgb(255, 255, 255); cursor: pointer; font-size: 20px;"
              @click=${onClose}
            >
              ×
            </button>
          </div>
          <div style="display: flex; overflow: auto; flex: 1; align-items: center; justify-content: center; padding: 20px;">
            <div style=${gridStyle}>${cells}</div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-around; padding: 15px; border-top: 2px solid rgb(68, 68, 68); background: rgb(26, 26, 26); color: rgb(255, 255, 255); font-size: 18px; flex-wrap: wrap; gap: 10px;">
            <div><strong>Money:</strong> $${fmt(stats?.money || 0)}</div>
            <div><strong>EP:</strong> ${fmt(stats?.ep || 0)}</div>
            <div><strong>Heat:</strong> ${fmt(stats?.heat || 0)}</div>
            <div><strong>Power:</strong> ${fmt(stats?.power || 0)}</div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    logger.log("error", "ui", "Failed to render layout preview:", e);
    return html`
      <div class="layout-view-modal-overlay" style="position: fixed; z-index: 10000; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.9);" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="layout-view-error" style="color: #fff; padding: 20px;">Error rendering layout</div>
      </div>
    `;
  }
};


class PwaDisplayModeUI {
  constructor(ui) {
    this.ui = ui;
  }

  initializePWADisplayModeButton(button) {
    if (!button) {
      logger.log('warn', 'ui', 'PWA display mode button not found');
      return;
    }
    const displayModes = ["fullscreen", "standalone", "minimal-ui", "browser"];
    const modeLabels = {
      "fullscreen": "🖥️ Fullscreen",
      "standalone": "📱 Standalone",
      "minimal-ui": "🔲 Minimal UI",
      "browser": "🌐 Browser"
    };
    const getCurrentMode = () => {
      const saved = StorageUtils.get("pwa_display_mode");
      if (saved && displayModes.includes(saved)) return saved;
      return "fullscreen";
    };
    const setDisplayMode = (mode) => {
      StorageUtils.set("pwa_display_mode", mode);
      this.updateManifestDisplayMode(mode);
      button.title = `PWA Display: ${modeLabels[mode]} (Click to cycle)`;
      button.style.display = "flex";
      button.style.visibility = "visible";
      button.style.opacity = "1";
    };
    const cycleDisplayMode = () => {
      const current = getCurrentMode();
      const currentIndex = displayModes.indexOf(current);
      const nextIndex = (currentIndex + 1) % displayModes.length;
      const nextMode = displayModes[nextIndex];
      setDisplayMode(nextMode);
      const toastContainer = document.createElement("div");
      render(html`
        <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2a2a2a;border:2px solid #4CAF50;border-radius:8px;padding:12px 20px;z-index:10000;font-family:'Press Start 2P',monospace;font-size:0.8rem;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.5);animation:toast-slide-up 0.3s ease-out;" id="pwa_toast_inner">
          PWA Display Mode: ${modeLabels[nextMode]} - Reload to apply
        </div>
      `, toastContainer);
      document.body.appendChild(toastContainer);
      setTimeout(() => {
        if (document.body.contains(toastContainer)) {
          const inner = toastContainer.querySelector("#pwa_toast_inner");
          if (inner) inner.style.animation = "toast-slide-up 0.3s ease-out reverse";
          setTimeout(() => toastContainer.remove(), 300);
        }
      }, 3000);
    };
    button.onclick = cycleDisplayMode;
    setDisplayMode(getCurrentMode());
  }

  updateManifestDisplayMode(mode) {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
    const originalHref = manifestLink.getAttribute("data-original-href") || manifestLink.href;
    if (!manifestLink.hasAttribute("data-original-href")) {
      manifestLink.setAttribute("data-original-href", originalHref);
    }
    fetch(originalHref)
      .then(response => response.json())
      .then(manifest => {
        manifest.display = mode;
        manifest.display_override = [mode, "standalone"];
        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const newLink = document.createElement("link");
        newLink.rel = "manifest";
        newLink.href = url;
        newLink.setAttribute("data-original-href", originalHref);
        const oldLink = document.querySelector('link[rel="manifest"]');
        if (oldLink) oldLink.remove();
        document.head.appendChild(newLink);
      })
      .catch(error => logger.log('warn', 'ui', 'Failed to update manifest display mode:', error));
  }
}


const accordionClick = (e) => {
  e.preventDefault();
  e.currentTarget.closest(".qs-accordion")?.classList.toggle("qs-accordion-expanded");
};

const quickStartTemplate = (page, onClose, onMoreDetails, onBack) => html`
  <div class="quick-start-overlay" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div id="quick-start-page-1" class="quick-start-screen" style=${page === 1 ? "" : "display: none;"}>
      <div class="modal-swipe-handle" aria-hidden="true"></div>
      <div class="quick-start-header">
        <span>PROTOCOL_01</span>
        <span class="quick-start-version">v25.07</span>
      </div>
      <div class="bios-content">
        <div class="qs-section qs-accordion qs-accordion-expanded">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>1. OUTPUT CYCLE</div>
          <div class="qs-accordion-body">
            <div class="qs-flow">
              <div class="qs-flow-diagram">
                <span class="qs-flow-icon qs-flow-fuel"><img src="img/parts/cells/cell_1_1.png" alt="FUEL" class="qs-icon"></span>
                <span class="qs-flow-arrow">▶</span>
                <span class="qs-flow-icon qs-flow-power"><img src="img/ui/icons/icon_power.png" alt="POWER" class="qs-icon"></span>
                <span class="qs-flow-plus">+</span>
                <span class="qs-flow-icon qs-flow-heat"><img src="img/ui/icons/icon_heat.png" alt="HEAT" class="qs-icon"></span>
              </div>
              <div class="qs-flow-caption">Generates Power & Heat</div>
            </div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>2. MANUAL OVERRIDE</div>
          <div class="qs-accordion-body">
            <div class="qs-action-cards">
              <div class="qs-action-row qs-action-depressible">
                <span class="qs-action-icon qs-power"><img src="img/ui/icons/icon_power.png" alt="" class="qs-icon"></span>
                <span class="qs-action-arrow">▶</span>
                <span class="qs-action-result">SELL ($)</span>
              </div>
              <div class="qs-action-row qs-action-depressible">
                <span class="qs-action-icon qs-heat"><img src="img/ui/icons/icon_heat.png" alt="" class="qs-icon"></span>
                <span class="qs-action-arrow">▶</span>
                <span class="qs-action-result">VENT HEAT</span>
              </div>
            </div>
          </div>
        </div>
        <div class="qs-warning">Excess Heat causes Critical Failure.</div>
      </div>
      <footer class="qs-footer">
        <button type="button" class="qs-btn-primary" @click=${onClose}>INITIATE REACTOR</button>
        <button type="button" class="qs-btn-ghost" @click=${onMoreDetails}>READ FULL MANUAL</button>
      </footer>
    </div>
    <div id="quick-start-page-2" class="quick-start-screen" style=${page === 2 ? "" : "display: none;"}>
      <div class="modal-swipe-handle" aria-hidden="true"></div>
      <div class="quick-start-header">
        <span>OPERATOR_MANUAL</span>
        <span class="quick-start-version">v25.07</span>
      </div>
      <div class="bios-content">
        <div class="qs-section qs-accordion qs-accordion-expanded">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ FIRST STEPS ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Start with $10 - buy a <img src="img/parts/cells/cell_1_1.png" class="objective-part-icon" alt="Uranium Cell" title="Uranium Cell">URANIUM CELL</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Open Parts panel to find components</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Cells: Single, Dual, Quad configs</span></div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ POWER SYSTEM ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/ui/icons/icon_power.png" class="objective-part-icon" alt="POWER" title="POWER"><span class="qs-amber">POWER</span>: Generated by cells</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/capacitors/capacitor_1.png" class="objective-part-icon" alt="Capacitors" title="Capacitors">CAPACITORS increase storage</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Sell power before capacity fills!</span></div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ HEAT SYSTEM ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/ui/icons/icon_heat.png" class="objective-part-icon" alt="HEAT" title="HEAT"><span class="qs-orange">HEAT</span>: Also generated by cells</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/platings/plating_1.png" class="objective-part-icon" alt="Reactor Plating" title="Reactor Plating">Plating: Max Heat Up</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>200% heat = MELTDOWN!</span></div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ HEAT MANAGEMENT ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/vents/vent_1.png" class="objective-part-icon" alt="Heat Vent" title="Heat Vent">VENTS: Remove heat from components</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/exchangers/exchanger_1.png" class="objective-part-icon" alt="Heat Exchanger" title="Heat Exchanger">EXCHANGERS: Balance heat between parts</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/coolants/coolant_cell_1.png" class="objective-part-icon" alt="Coolant Cell" title="Coolant Cell">COOLANT CELLS: Passive heat sinks</span></div>
          </div>
        </div>
      </div>
      <footer class="qs-footer">
        <button type="button" class="qs-btn-ghost" @click=${onBack}>BACK</button>
        <button type="button" class="qs-btn-primary" @click=${onClose}>INITIATE REACTOR</button>
      </footer>
    </div>
  </div>
`;

class QuickStartUI {
  constructor(ui) {
    this.ui = ui;
  }

  addHelpButtonToMainPage() {
    const mainTopNav = this.ui.registry?.get?.("CoreLoop")?.getElement?.("main_top_nav") ?? this.ui.DOMElements?.main_top_nav;
    if (!mainTopNav) return;
    const helpButton = document.createElement("div");
    helpButton.className = "hidden";
    helpButton.title = "Getting Started Guide";
    helpButton.textContent = "?";
    helpButton.style.marginLeft = "8px";
    helpButton.onclick = async () => await this.ui.modalOrchestrator.showModal(MODAL_IDS.DETAILED_QUICK_START);
    const aboutButton = mainTopNav.querySelector("#about_toggle");
    if (aboutButton) mainTopNav.insertBefore(helpButton, aboutButton);
    else mainTopNav.appendChild(helpButton);
  }
}


class DeviceFeaturesUI {
  constructor(ui) {
    this.ui = ui;
  }

  updateAppBadge() {
    const reactor = this.ui.game?.reactor;
    if (!reactor) return;
    const heatPercent = reactor.current_heat / reactor.max_heat;
    const isPaused = this.ui.stateManager?.getVar("pause");
    if (heatPercent > 0.9 && !isPaused && document.visibilityState === "visible") {
      const now = performance.now();
      if ((this.ui._lastHeatRumbleTime ?? 0) + 600 < now) {
        this.ui._lastHeatRumbleTime = now;
        this.heatRumbleVibration();
      }
    }
    if (!('setAppBadge' in navigator)) return;
    if (heatPercent >= 0.95 && !isPaused) {
      navigator.setAppBadge(1);
      return;
    }
    const hoursAccumulated = Math.floor((this.ui.game.engine?.time_accumulator || 0) / (1000 * 60 * 60));
    if (hoursAccumulated >= 1) {
      navigator.setAppBadge(hoursAccumulated);
      return;
    }
    navigator.clearAppBadge();
  }

  setupAppBadgeVisibilityHandler() {
    if (!('setAppBadge' in navigator)) return;
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') navigator.clearAppBadge();
    });
  }

  updateWakeLockState() {
    if (!this.ui.game) return;
    const isPaused = this.ui.stateManager?.getVar("pause");
    const isRunning = this.ui.game.engine?.running && !isPaused;
    if (isRunning) requestWakeLock();
    else releaseWakeLock();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        logger.log('warn', 'ui', 'Error attempting to enable fullscreen:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          logger.warn("Error attempting to exit fullscreen:", err);
        });
      }
    }
  }

  updateFullscreenButtonState() {
    const ui = this.ui;
    if (!ui?.uiState) return;
    const title = document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen";
    ui.uiState.fullscreen_display = { icon: "⛶", title };
  }

  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        logger.log('warn', 'ui', 'Vibration failed:', e);
      }
    }
  }

  lightVibration() { this.vibrate(10); }
  heavyVibration() { this.vibrate(50); }
  doublePulseVibration() { this.vibrate([30, 80, 30]); }
  meltdownVibration() { this.vibrate(200); }
  heatRumbleVibration() { this.vibrate([80, 40, 80, 40, 80]); }
}


export { InfoBarUI, MobileInfoBarUI, PageSetupUI, PartsPanelUI, ControlDeckUI, NavIndicatorsUI, TabSetupUI } from "./ui_panels.js";
export { HeatVisualsUI, GridInteractionUI, ParticleEffectsUI, VisualEventRendererUI } from "./ui_visuals.js";
export { MeltdownUI, ClipboardUI } from "./ui_tools.js";
export {
  CopyPasteUI,
  SandboxUI,
  UserAccountUI,
  PerformanceUI,
  ModalOrchestrationUI,
  CoreLoopUI,
  setupKeyboardShortcuts,
  setupCtrl9Handlers,
  startCtrl9MoneyIncrease,
  stopCtrl9MoneyIncrease,
  setupNavListeners,
  setupResizeListeners,
  layoutViewTemplate,
  PwaDisplayModeUI,
  quickStartTemplate,
  QuickStartUI,
  DeviceFeaturesUI,
};
