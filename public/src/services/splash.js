import {
  isTestEnv,
  logger,
  StorageUtils,
  getResourceUrl,
  serializeSave,
  rotateSlot1ToBackupAsync,
  setSlot1FromBackupAsync,
  StorageAdapter,
  escapeHtml,
  classMap,
  Format,
  formatPlaytimeLog,
  deserializeSave,
} from "../utils/utils_constants.js";
import { getCriticalUiIconAssets, warmImageCache, preloadAllPartImages } from "./services_pwa.js";
import { BaseComponent } from "../core/reactor_state.js";
import { MODAL_IDS } from "../components/ui_modals.js";
import {
  fetchResolvedSaves,
  showCloudVsLocalConflictModal,
  showLoadBackupModal,
  fetchCloudSaveSlots,
} from "../core/save_system.js";
import {
  LoadFromCloudButton,
  GoogleSignInButton,
  createLoadingButton,
  createGoogleSignInButtonWithIcon,
} from "../components/buttonFactory.js";
import { VersionSchema, SaveDataSchema } from "../utils/utils_constants.js";
import { ReactiveLitComponent } from "../components/ReactiveLitComponent.js";
import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import dataService from "./dataService.js";
import { VersionChecker } from "./services_pwa.js";

const FADE_SLIGHT_MS = 15000;
const FADE_FULL_MS = 30000;
const FADE_CLASS_SLIGHT = "splash-menu-fade-slight";
const FADE_CLASS_FULL = "splash-menu-fade-full";

function scheduleFadeSteps(panel, slightTimerRef, fullTimerRef) {
  if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
  if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
  panel.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  slightTimerRef.current = setTimeout(() => {
    panel.classList.add(FADE_CLASS_SLIGHT);
    slightTimerRef.current = null;
  }, FADE_SLIGHT_MS);
  fullTimerRef.current = setTimeout(() => {
    panel.classList.remove(FADE_CLASS_SLIGHT);
    panel.classList.add(FADE_CLASS_FULL);
    fullTimerRef.current = null;
  }, FADE_FULL_MS);
}

function bindWakeListeners(panel, slightTimerRef, fullTimerRef, handlers) {
  const wake = () => {
    scheduleFadeSteps(panel, slightTimerRef, fullTimerRef);
  };
  const events = ["click", "touchstart", "pointerdown", "pointermove", "keydown"];
  events.forEach((ev) => {
    const h = (e) => {
      if (ev === "pointermove" && e.buttons === 0) return;
      wake();
    };
    document.addEventListener(ev, h, { capture: true, passive: ev === "pointermove" });
    handlers.push({ event: ev, handler: h });
  });
}

function unbindWakeListeners(handlers) {
  handlers.forEach(({ event, handler }) => {
    document.removeEventListener(event, handler, { capture: true });
  });
  handlers.length = 0;
}

function initSplashMenuIdleFade(panelElement) {
  if (!panelElement) return () => {};
  const slightTimerRef = { current: null };
  const fullTimerRef = { current: null };
  const handlers = [];
  scheduleFadeSteps(panelElement, slightTimerRef, fullTimerRef);
  bindWakeListeners(panelElement, slightTimerRef, fullTimerRef, handlers);
  return () => {
    if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
    if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
    unbindWakeListeners(handlers);
    panelElement.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  };
}

async function fetchVersionFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function parseVersionFromResponse(text) {
  try {
    const data = JSON.parse(text);
    const parsed = VersionSchema.safeParse(data);
    return parsed.success ? parsed.data.version : "Unknown";
  } catch {
    return "Unknown";
  }
}

async function tryPrimaryVersionUrl() {
  const versionUrl = getResourceUrl("version.json");
  try {
    return await fetchVersionFromUrl(versionUrl);
  } catch (urlError) {
    logger.log("warn", "splash", "Primary URL failed, trying direct path:", urlError);
    return await fetchVersionFromUrl("/version.json");
  }
}

async function tryDirectOrAbsolutePath() {
  try {
    const directResponse = await fetch("./version.json");
    if (directResponse.ok) return parseVersionFromResponse(await directResponse.text());
  } catch (directError) {
    logger.warn("Could not load direct local version:", directError);
  }
  try {
    const absoluteResponse = await fetch("/version.json");
    if (absoluteResponse.ok) return parseVersionFromResponse(await absoluteResponse.text());
  } catch (absoluteError) {
    logger.log("warn", "splash", "Could not load absolute path version:", absoluteError);
  }
  return null;
}

async function tryLocalVersionFallback(versionChecker) {
  const localVersion = await versionChecker.getLocalVersion();
  if (localVersion) return localVersion;
  return await tryDirectOrAbsolutePath();
}

async function fetchVersionForSplash(versionChecker) {
  try {
    const responseText = await tryPrimaryVersionUrl();
    return parseVersionFromResponse(responseText);
  } catch (error) {
    logger.warn("Could not load version info:", error);
    try {
      const fallback = await tryLocalVersionFallback(versionChecker);
      return fallback ?? "Unknown";
    } catch (localError) {
      logger.log("warn", "splash", "Could not load local version:", localError);
      return "Unknown";
    }
  }
}

function mountSplashUserCountReactive(splashScreen, ui) {
  const userCountEl = splashScreen?.querySelector("#user-count-text");
  if (!userCountEl || !ui?.uiState) return;
  ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["user_count"] }],
    () => html`${ui.uiState?.user_count ?? 0}`,
    userCountEl
  );
}

function addSplashStats(splashScreen, version, versionChecker, ui) {
  const versionText = splashScreen.querySelector("#splash-version-text");
  if (!versionText) return;
  versionText.title = "Click to check for updates";
  versionText.style.cursor = "pointer";
  versionText.onclick = () => versionChecker.triggerVersionCheckToast();
  if (ui?.uiState) {
    ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["version"] }],
      () => html`v.${ui.uiState?.version ?? ""}`,
      versionText
    );
  } else {
    versionText.textContent = `v.${version}`;
  }
}

class SplashUIManager extends BaseComponent {
  constructor(refs) {
    super();
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  setRefs(refs) {
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  updateStatus(message) {
    if (!this.statusElement) {
      logger.log("warn", "splash", "Status element not ready, skipping update:", message);
      return;
    }
    this.statusElement.textContent = message;
    this.statusElement.classList.add("splash-element-visible");
  }

  stopFlavorText() {}

  hide(onHidden) {
    if (!this.splashScreen) return;
    this.stopFlavorText();
    this.splashScreen.classList.add("fade-out");
    setTimeout(() => {
      this.isVisible = false;
      this.setElementVisible(this.splashScreen, false);
      onHidden?.();
    }, 500);
  }

  show() {
    if (this.splashScreen) {
      this.isVisible = true;
      this.splashScreen.classList.remove("fade-out");
      this.setElementVisible(this.splashScreen, true);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isVisible = false;
      this.splashScreen.classList.add("fade-out");
      this.setElementVisible(this.splashScreen, false);
    }
  }
}

async function waitForSplashElement(selector, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function runLoadSplashScreen(manager) {
  if (isTestEnv()) return false;
  try {
    manager.splashScreen = document.querySelector("#splash-screen") ?? await waitForSplashElement("#splash-screen");
    manager.statusElement =
      document.querySelector("#splash-status") ?? manager.splashScreen?.querySelector("#splash-status");
    if (!manager.splashScreen) throw new Error("Splash screen not found (AppRoot must render first)");
    manager.uiManager?.setRefs({ statusElement: manager.statusElement, splashScreen: manager.splashScreen });
    await manager.initializeSplashStats();
    manager.updateUserCountDisplay();
    try {
      await warmImageCache(getCriticalUiIconAssets());
      preloadAllPartImages().catch((error) =>
        logger.log("warn", "splash", "[PWA] Background part image preloading failed:", error)
      );
    } catch (e) {
      logger.log("warn", "splash", "[PWA] Failed to warm image cache:", e);
    }
    return true;
  } catch (error) {
    logger.log("error", "splash", "Error loading splash screen:", error);
    return false;
  }
}

function runSetStep(manager, stepId) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = step.message;
  }
}

function runSetSubStep(manager, message) {
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = message;
  }
}

const SPLASH_HIDE_DELAY_MS = 600;

async function loadFromDataImpl(splashManager, saveData, ctx) {
  const str = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await rotateSlot1ToBackupAsync(str);
  await loadFromSaveSlotImpl(splashManager, 1, ctx);
}

async function teardownSplashAndWait() {
  const saveSlotEl = document.getElementById("save-slot-screen");
  if (saveSlotEl) saveSlotEl.remove();
  if (window.splashManager) window.splashManager.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
}

async function handleBackupLoadFlow(ctx, slot) {
  if (!ctx?.game?.saveManager) return null;
  let loadSuccess = await ctx.game.saveManager.loadGame(slot);
  if (loadSuccess && typeof loadSuccess === "object" && loadSuccess.backupAvailable) {
    const useBackup = await showLoadBackupModal();
    if (!useBackup) return null;
    await setSlot1FromBackupAsync();
    loadSuccess = await ctx.game.saveManager.loadGame(1);
  }
  return loadSuccess;
}

async function startGameOrFallback(ctx) {
  if (!ctx?.game || !ctx?.ui || !ctx?.pageRouter) return;
  if (typeof window.startGame === "function") {
    await window.startGame(ctx);
    return;
  }
  logger.log("error", "splash", "startGame function not available globally");
  await ctx.pageRouter.loadGameLayout();
  ctx.ui.initMainLayout();
  await ctx.pageRouter.loadPage("reactor_section");
  ctx.game.tooltip_manager = new (await import("../components/ui_tooltips_tutorial.js")).TooltipManager(
    "#main",
    "#tooltip",
    ctx.game
  );
  ctx.game.engine = new (await import("../core/engine.js")).Engine(ctx.game);
  await ctx.game.startSession();
  ctx.game.engine.start();
}

async function loadFromSaveSlotImpl(splashManager, slot, ctx) {
  try {
    await teardownSplashAndWait();
    const appCtx =
      ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
    if (!appCtx.game) {
      logger.log("error", "splash", "Game instance not available");
      return;
    }
    const loadSuccess = await handleBackupLoadFlow(appCtx, slot);
    if (loadSuccess !== true || !appCtx.pageRouter || !appCtx.ui) {
      logger.log("error", "splash", "Failed to load game or missing dependencies");
      return;
    }
    await startGameOrFallback(appCtx);
  } catch (error) {
    logger.log("error", "splash", "Error loading from save slot:", error);
  }
}

const GOOGLE_LABEL = "[G]";
const EMAIL_LABEL = "[M]";

const authState = proxy({
  email: "",
  password: "",
  message: "",
  isError: false,
  showEmailForm: false,
});

function showMessage(msg, isError = false) {
  authState.message = msg;
  authState.isError = isError;
}

async function refreshAuthTokens() {
  if (window.googleDriveSave) {
    await window.googleDriveSave.checkAuth(true);
  }
  if (window.supabaseAuth && window.supabaseAuth.refreshToken && !window.supabaseAuth.isSignedIn()) {
    await window.supabaseAuth.refreshAccessToken();
  }
}

async function fetchGoogleUserInfo() {
  const googleSignedIn = window.googleDriveSave && window.googleDriveSave.isSignedIn;
  let googleUserInfo = null;
  if (googleSignedIn) {
    googleUserInfo = window.googleDriveSave.getUserInfo();
    if (!googleUserInfo && window.googleDriveSave.authToken) {
      try {
        const userResponse = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          { headers: { Authorization: `Bearer ${window.googleDriveSave.authToken}` } }
        );
        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.user) {
            googleUserInfo = {
              id: userData.user.permissionId || userData.user.emailAddress,
              email: userData.user.emailAddress,
              name: userData.user.displayName,
              imageUrl: userData.user.photoLink,
            };
            window.googleDriveSave.userInfo = googleUserInfo;
            StorageUtils.set("google_drive_user_info", googleUserInfo);
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error fetching Google user info:", error);
      }
    }
  }
  return { googleSignedIn, googleUserInfo };
}

async function handleAuthLogout(container, splashManager, { supabaseSignedIn, googleSignedIn }) {
  if (supabaseSignedIn && window.supabaseAuth) window.supabaseAuth.signOut();
  if (googleSignedIn && window.googleDriveSave) {
    if (window.googleDriveSave.signOut) {
      await window.googleDriveSave.signOut();
    } else {
      window.googleDriveSave.isSignedIn = false;
      window.googleDriveSave.authToken = null;
      StorageUtils.remove("google_drive_auth_token");
      StorageUtils.remove("google_drive_user_info");
    }
  }
  render(html``, container);
  await splashManager.setupSupabaseAuth(container);
}

function signedInTemplate(container, splashManager, { googleSignedIn, googleUserInfo, supabaseSignedIn, supabaseUser }) {
  const authLabel = googleUserInfo ? GOOGLE_LABEL : supabaseUser ? EMAIL_LABEL : "";
  const onLogout = () => handleAuthLogout(container, splashManager, { supabaseSignedIn, googleSignedIn });
  return html`
    <div class="splash-auth-signed-in">
      ${authLabel ? html`<span class="splash-auth-signed-in-icon">${authLabel}</span>` : ""}
      <button class="splash-auth-icon-btn" title="Sign out" aria-label="Sign out" @click=${onLogout}>✕</button>
    </div>
  `;
}

async function handleGoogleSignIn(container, splashManager) {
  if (!window.googleDriveSave) return;
  try {
    await window.googleDriveSave.signIn();
    await window.googleDriveSave.checkAuth(false);
    render(html``, container);
    splashManager.setupSupabaseAuth(container);
  } catch (error) {
    logger.log("error", "splash", "Google sign-in error:", error);
  }
}

const getCredentials = () => ({ email: authState.email, password: authState.password });

async function executeSignIn(container, splashManager) {
  const { email, password } = getCredentials();
  if (!email || !password) return showMessage("Please enter email and password", true);
  showMessage("Signing in...");
  const { error } = await window.supabaseAuth.signInWithPassword(email, password);
  if (error) {
    showMessage(error, true);
  } else {
    showMessage("Signed in successfully!");
    authState.password = "";
    setTimeout(() => {
      render(html``, container);
      splashManager.setupSupabaseAuth(container);
    }, 1000);
  }
}

async function executeSignUp() {
  const { email, password } = getCredentials();
  if (!email || !password) return showMessage("Please enter email and password", true);
  if (password.length < 6) return showMessage("Password must be at least 6 characters", true);
  showMessage("Signing up...");
  const { error } = await window.supabaseAuth.signUp(email, password);
  if (error) {
    showMessage(error, true);
  } else {
    showMessage("Sign up successful! Please check your email to confirm your account.");
    authState.password = "";
  }
}

async function executeReset() {
  const { email } = getCredentials();
  if (!email) return showMessage("Please enter your email address", true);
  showMessage("Sending password reset email...");
  const { error } = await window.supabaseAuth.resetPasswordForEmail(email);
  if (error) {
    showMessage(error, true);
  } else {
    showMessage("Password reset email sent! Please check your email.");
  }
}

function CommsButton(container, splashManager) {
  return html`
    <div class="splash-auth-comms-wrap">
      <button class="splash-auth-comms-btn" title="Sign in" aria-label="Sign in options" aria-haspopup="true" aria-expanded="false">
        [ COMMS ]
      </button>
      <div class="splash-auth-comms-dropdown hidden">
        <div class="splash-auth-comms-prompt">> AWAITING OPERATOR CREDENTIALS</div>
        <button class="splash-auth-comms-option" @click=${() => handleGoogleSignIn(container, splashManager)}>
          <span class="splash-auth-comms-icon">${GOOGLE_LABEL}</span> Sign in with Google
        </button>
        <button
          class="splash-auth-comms-option"
          @click=${() => {
            authState.showEmailForm = true;
            authState.message = "";
            renderSignInForm(container, splashManager);
          }}
        >
          <span class="splash-auth-comms-icon">${EMAIL_LABEL}</span> Sign in with Email
        </button>
      </div>
    </div>
  `;
}

function AuthForm(state, handlers, onBack) {
  const { onInput, onSignIn, onSignUp, onReset } = handlers;
  const { email, password, message, isError } = state;
  const msgColor = isError ? "#ff6666" : "var(--game-success-color)";
  return html`
    <div id="splash-email-auth-form" class="splash-auth-terminal-form">
      <div class="splash-auth-terminal-prompt">> AWAITING OPERATOR CREDENTIALS</div>
      ${onBack ? html`<button class="splash-auth-back-btn" @click=${onBack} type="button">&lt; Back</button>` : ""}
      <input
        type="email"
        id="splash-supabase-email"
        placeholder="Email"
        class="pixel-input splash-auth-input"
        .value=${email}
        @input=${(e) => onInput(e, "email")}
      />
      <input
        type="password"
        id="splash-supabase-password"
        placeholder="Password"
        class="pixel-input splash-auth-input"
        .value=${password}
        @input=${(e) => onInput(e, "password")}
      />
      <div class="splash-auth-form-actions">
        <button class="splash-btn splash-auth-form-btn" @click=${onSignIn}>Sign In</button>
        <button class="splash-btn splash-auth-form-btn" @click=${onSignUp}>Sign Up</button>
        <button class="splash-btn splash-auth-form-btn" @click=${onReset}>Reset</button>
      </div>
      <div id="splash-supabase-message" class="splash-auth-message" style="color: ${msgColor}">${message}</div>
    </div>
  `;
}

function renderSignInForm(container, splashManager) {
  const onInput = (e, field) => {
    authState[field] = e.target.value;
  };
  const goBack = () => {
    authState.showEmailForm = false;
    authState.message = "";
    renderSignInForm(container, splashManager);
  };

  const handlers = {
    onInput,
    onSignIn: () => executeSignIn(container, splashManager),
    onSignUp: executeSignUp,
    onReset: executeReset,
  };

  const template = html`
    <div class="splash-auth-buttons">
      ${authState.showEmailForm ? AuthForm(authState, handlers, goBack) : CommsButton(container, splashManager)}
    </div>
  `;
  render(template, container);
  const wrap = container.querySelector(".splash-auth-comms-wrap");
  if (wrap) {
    const btn = wrap.querySelector(".splash-auth-comms-btn");
    const dropdown = wrap.querySelector(".splash-auth-comms-dropdown");
    const closeDropdown = () => {
      dropdown?.classList.add("hidden");
      btn?.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", closeDropdown);
    };
    const onDocumentClick = (e) => {
      if (!wrap.contains(e.target)) closeDropdown();
    };
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = dropdown?.classList.toggle("hidden");
      btn?.setAttribute("aria-expanded", isHidden ? "false" : "true");
      if (!isHidden) setTimeout(() => document.addEventListener("click", onDocumentClick), 0);
    });
  }
}

async function setupSplashAuth(container, splashManager) {
  await refreshAuthTokens();
  const { googleSignedIn, googleUserInfo } = await fetchGoogleUserInfo();
  const supabaseSignedIn = window.supabaseAuth && window.supabaseAuth.isSignedIn();
  const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;
  const isAnySignedIn = googleSignedIn || supabaseSignedIn;

  if (isAnySignedIn) {
    render(
      signedInTemplate(container, splashManager, {
        googleSignedIn,
        googleUserInfo,
        supabaseSignedIn,
        supabaseUser,
      }),
      container
    );
  } else {
    authState.email = "";
    authState.password = "";
    authState.message = "";
    authState.isError = false;
    authState.showEmailForm = false;
    if (!container._hasValtioSub) {
      container._hasValtioSub = true;
      subscribe(authState, () => {
        if (document.body.contains(container) && !window.supabaseAuth?.isSignedIn?.()) {
          renderSignInForm(container, splashManager);
        }
      });
    }
    renderSignInForm(container, splashManager);
  }
}

async function shouldAbortDueToConflict(cloudSaveData) {
  const { maxLocalTime } = await fetchResolvedSaves();
  const cloudTime = cloudSaveData.last_save_time || 0;
  if (maxLocalTime <= 0 || cloudTime <= maxLocalTime) return false;
  const orchestrator = window.ui?.modalOrchestrator;
  const choice = orchestrator
    ? await orchestrator.showModal(MODAL_IDS.CLOUD_VS_LOCAL_CONFLICT, { cloudSaveData })
    : await showCloudVsLocalConflictModal(cloudSaveData);
  return choice === "cancel" || choice === "local";
}

function backupLocalSaveToSession(dataJSON) {
  if (dataJSON && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("reactorSaveBackupBeforeCloud", dataJSON);
    sessionStorage.setItem("reactorSaveBackupTimestamp", String(Date.now()));
  }
}

async function applyCloudSaveAndLaunch(cloudSaveData) {
  const { pageRouter, ui, game } = window;
  if (!pageRouter || !ui || !game) return;
  const validated = game.saveManager.validateSaveData(cloudSaveData);
  await game.applySaveState(validated);
  if (typeof window.startGame === "function") {
    await window.startGame({ pageRouter, ui, game });
    return;
  }
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  await pageRouter.loadPage("reactor_section");
  game.tooltip_manager = new (await import("../components/ui_tooltips_tutorial.js")).TooltipManager("#main", "#tooltip", game);
  game.engine = new (await import("../core/engine.js")).Engine(game);
  await game.startSession();
  game.engine.start();
}

async function handleCloudLoadClick() {
  try {
    const cloudSaveData = await window.googleDriveSave.load();
    if (!cloudSaveData) {
      logger.log("warn", "splash", "Could not find a save file in Google Drive.");
      return;
    }
    if (await shouldAbortDueToConflict(cloudSaveData)) return;
    const { dataJSON } = await fetchResolvedSaves();
    backupLocalSaveToSession(dataJSON);
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await applyCloudSaveAndLaunch(cloudSaveData);
  } catch (error) {
    logger.log("error", "splash", "Failed to load from Google Drive:", error);
    logger.log("warn", "splash", `Error loading from Google Drive: ${error.message}`);
  }
}

function applyOfflineStateToButton(btn) {
  if (btn && !navigator.onLine) {
    btn.disabled = true;
    btn.title = "Requires an internet connection";
  }
}

async function renderSignedInCloudUI(cloudButtonArea) {
  try {
    await window.googleDriveSave.findSaveFile();
    const fileId = window.googleDriveSave.saveFileId;
    if (fileId) {
      render(LoadFromCloudButton(handleCloudLoadClick), cloudButtonArea);
      const btn = cloudButtonArea.firstElementChild;
      if (btn) applyOfflineStateToButton(btn);
    } else {
      render(html`<div>No cloud save found.</div>`, cloudButtonArea);
    }
  } catch (_) {
    render(html`<div>Cloud check failed.</div>`, cloudButtonArea);
  }
}

async function handleSignInClick(manager, cloudButtonArea) {
  try {
    await window.googleDriveSave.signIn();
    await updateSplashGoogleDriveUI(manager, true, cloudButtonArea);
  } catch (_) {
    const signInBtn = cloudButtonArea.querySelector("button");
    if (signInBtn) {
      const span = signInBtn.querySelector("span");
      if (span) span.textContent = "Sign in Failed";
      setTimeout(() => {
        if (span) span.textContent = "Google Sign In";
        signInBtn.disabled = false;
      }, 2000);
    }
  }
}

function renderSignedOutSignInUI(manager, cloudButtonArea) {
  const onClick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const span = btn.querySelector("span");
    if (span) span.textContent = "Signing in...";
    await handleSignInClick(manager, cloudButtonArea);
  };
  render(GoogleSignInButton(onClick), cloudButtonArea);
  const btn = cloudButtonArea.firstElementChild;
  if (btn) applyOfflineStateToButton(btn);
}

async function updateSplashGoogleDriveUI(manager, isSignedIn, cloudButtonArea) {
  render(html``, cloudButtonArea);
  if (isSignedIn) {
    await renderSignedInCloudUI(cloudButtonArea);
  } else {
    renderSignedOutSignInUI(manager, cloudButtonArea);
  }
}

class SplashStartOptionsBuilder {
  constructor(splashManager, ctx = null) {
    this.splashManager = splashManager;
    this.ctx = ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
  }

  async buildSaveSlotList(canLoadGame) {
    if (!canLoadGame) {
      return { hasSave: false, saveSlots: [], cloudSaveOnly: false, cloudSaveData: null, mostRecentSave: null };
    }
    return fetchResolvedSaves();
  }

  renderTo(container, state) {
    const { hasSave, saveSlots, cloudSaveOnly, cloudSaveData, mostRecentSave } = state;

    const onResume = async () => {
      try {
        if (window.splashManager) window.splashManager.hide();
        await new Promise((resolve) => setTimeout(resolve, 600));

        const game = this.ctx?.game ?? window.game;
        if (game) {
          const loadSuccess = await game.saveManager.loadGame(mostRecentSave.slot);

          const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
          const ui = this.ctx?.ui ?? window.ui;

          if (loadSuccess && pageRouter && ui) {
            if (typeof window.startGame === "function") {
              await window.startGame({ pageRouter, ui, game });
            } else {
              await pageRouter.loadGameLayout();
              ui.initMainLayout();
              await pageRouter.loadPage("reactor_section");

              game.tooltip_manager = new (await import("../components/ui_tooltips_tutorial.js")).TooltipManager(
                "#main",
                "#tooltip",
                game
              );
              game.engine = new (await import("../core/engine.js")).Engine(game);

              await game.startSession();
              game.engine.start();
            }
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error loading game:", error);
      }
    };

    const onCloudResume = () => {
      this.splashManager.hide();
      const btn = document.getElementById("splash-load-cloud-btn");
      if (btn) btn.click();
    };

    const onNewRun = async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten."))
        return;
      const game = this.ctx?.game ?? window.game;
      const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
      const ui = this.ctx?.ui ?? window.ui;
      try {
        if (game && typeof window.showTechTreeSelection === "function") await window.showTechTreeSelection(game, pageRouter, ui, this.splashManager);
      } catch (error) {
        logger.log("error", "game", "Error showing tech tree selection:", error);
      }
    };

    const template = html`
      ${mostRecentSave
        ? html`
            <button
              class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
              @click=${onResume}
            >
              <div class="load-game-header"><span>RESUME</span></div>
            </button>
          `
        : ""}

      ${cloudSaveOnly && cloudSaveData && !hasSave
        ? html`
            <button
              class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
              @click=${onCloudResume}
            >
              <div class="load-game-header"><span>RESUME</span></div>
              <div class="continue-label"></div>
            </button>
          `
        : ""}

      <div class="splash-btn-actions-grid">
        <div class="splash-btn-row-secondary">
          <button
            id="splash-new-game-btn"
            class="splash-btn splash-btn-start ${!mostRecentSave ? "splash-btn-resume-primary" : ""}"
            @click=${onNewRun}
          >
            NEW RUN
          </button>
          <button class="splash-btn splash-btn-load" @click=${() => this.splashManager.showSaveSlotSelection(saveSlots)}>
            <div class="load-game-header"><span>LOAD</span></div>
          </button>
        </div>
        <div class="splash-btn-row-tertiary">
          <button id="splash-sandbox-btn" class="splash-btn splash-btn-sandbox" title="Sandbox">SANDBOX</button>
          <button
            class="splash-btn splash-btn-config"
            title="System configuration"
            @click=${() => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS)}
          >
            SYS
          </button>
        </div>
      </div>

      <div id="splash-auth-in-footer" style="margin-top: 1rem;"></div>
    `;

    render(template, container);

    const authArea = container.querySelector("#splash-auth-in-footer");
    if (authArea) {
      this.splashManager.setupSupabaseAuth(authArea);
    }
  }
}

const formatSlotNumber = (n) => Format.number(n, { places: 1 });

class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      cloudSaveSlots: [],
      isCloudAvailable: false,
      selectedSlot: null,
      selectedIsCloud: false,
      swipedSlots: new Set(),
    };
  }

  _slotTemplate(slotData, i, isCloud) {
    const isEmpty = !slotData || !slotData.exists;
    const prefix = isCloud ? "CLD" : "LOG";
    const logId = `${prefix} ${String(i).padStart(2, "0")}`;
    const swipeKey = `${isCloud ? "c" : "l"}_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i && this.state.selectedIsCloud === isCloud;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isCloud && !isEmpty,
      swiped: isSwiped,
    });

    const btnClasses = classMap({
      "save-slot-button": true,
      "save-slot-button-empty": isEmpty,
      "save-slot-button-filled": !isEmpty,
      selected: isSelected,
    });

    const onSlotClick = (e) => {
      e.preventDefault();
      if (isSwiped) return;

      const now = Date.now();
      const isDoubleTap = isSelected && this._lastTap && now - this._lastTap < 400;
      this._lastTap = now;

      if (isDoubleTap) {
        this._handleRestore();
      } else {
        this.state.selectedSlot = isSelected ? null : i;
        this.state.selectedIsCloud = isCloud;
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isCloud || isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isCloud || isEmpty) return;
      const endX = e.changedTouches[0].clientX;
      if (this._swipeStartX - endX > 80) {
        this.state.swipedSlots.add(swipeKey);
        this.render();
      } else if (endX - this._swipeStartX > 40) {
        this.state.swipedSlots.delete(swipeKey);
        this.render();
      }
    };

    const onDeleteClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
      try {
        await StorageAdapter.remove(`reactorGameSave_${i}`);
        this.state.swipedSlots.delete(swipeKey);
        const targetSlot = this.state.localSaveSlots.find((s) => s.slot === i);
        if (targetSlot) targetSlot.exists = false;

        if (this.state.selectedSlot === i && !this.state.selectedIsCloud) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return html`
      <div class=${rowClasses}>
        <div class="save-slot-swipe-wrapper" @touchstart=${onSwipeStart} @touchend=${onSwipeEnd}>
          <button
            class=${btnClasses}
            type="button"
            data-slot=${i}
            data-is-cloud=${isCloud}
            data-is-empty=${isEmpty}
            @click=${onSlotClick}
          >
            ${isEmpty
              ? html`
                  <div class="save-slot-row-top">
                    <span class="save-slot-log-id save-slot-log-id-empty">${logId}</span>
                    <span class="save-slot-right">EMPTY</span>
                  </div>
                  <div class="save-slot-row-bottom">
                    <span class="save-slot-ttime">--:--:--</span>
                  </div>
                `
              : html`
                  <span class="save-slot-tape-icon" aria-hidden="true"></span>
                  <span class="save-slot-select-arrow ${isSelected ? "visible" : ""}" aria-hidden="true">&#x25B6;</span>
                  <div class="save-slot-row-top">
                    <span class="save-slot-log-id">${logId}</span>
                  </div>
                  <div class="save-slot-row-meta">
                    <span class="save-slot-ttime">T+ ${formatPlaytimeLog(Number(slotData.totalPlayedTime))}</span>
                  </div>
                  <div class="save-slot-row-bottom">
                    <span class="save-slot-money">$${formatSlotNumber(Number(slotData.currentMoney))}</span>
                    <span class="save-slot-sep">|</span>
                    <span class="save-slot-ep">${formatSlotNumber(Number(slotData.exoticParticles))} EP</span>
                  </div>
                `}
          </button>
          ${!isCloud && !isEmpty
            ? html`<button class="save-slot-delete" type="button" aria-label="Delete" @click=${onDeleteClick}>DEL</button>`
            : ""}
        </div>
      </div>
    `;
  }

  _mainTemplate() {
    const cloudSlots = [1, 2, 3].map((i) => this.state.cloudSaveSlots.find((s) => s.slot === i));
    const localSlots = [1, 2, 3].map((i) => this.state.localSaveSlots.find((s) => s.slot === i));

    const onFileChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const saveData = event.target.result;
          const parsed = typeof saveData === "string" ? deserializeSave(saveData) : saveData;
          const result = SaveDataSchema.safeParse(parsed);
          if (!result.success) throw new Error("Save corrupted: validation failed");
          const validated = result.data;
          await rotateSlot1ToBackupAsync(serializeSave(validated));
          await this.splashManager.loadFromSaveSlot(1);
        } catch (err) {
          logger.log("error", "splash", "Failed to load save from file:", err);
          logger.log("warn", "splash", "Failed to load save file. Ensure it is a valid Reactor save.");
        }
      };
      reader.readAsText(file);
    };

    const triggerFileInput = () => {
      this.container.querySelector("#load-from-file-input")?.click();
    };

    return html`
      <header
        class="save-slot-screen-header"
        @touchstart=${(e) => {
          this._headerStartY = e.touches[0].clientY;
        }}
        @touchend=${(e) => {
          if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
        }}
      >
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="save-slot-header-row">
          <h1 class="save-slot-title">SYSTEM LOGS</h1>
          <button class="save-slot-back-btn" title="Cancel" aria-label="Cancel" @click=${() => this._close()}>&#x2715;</button>
        </div>
      </header>
      <div class="save-slot-panel">
        <div class="save-slot-options">
          ${this.state.isCloudAvailable
            ? html`
                <h2 class="save-slot-section-header">CLOUD BACKUPS</h2>
                ${cloudSlots.map((s, idx) => this._slotTemplate(s, idx + 1, true))}
                <h2 class="save-slot-section-header save-slot-section-secondary">CORE BACKUPS</h2>
              `
            : html` <h2 class="save-slot-section-header">CORE BACKUPS</h2> `}
          ${localSlots.map((s, idx) => this._slotTemplate(s, idx + 1, false))}
          <div class="save-slot-actions">
            <input
              type="file"
              id="load-from-file-input"
              accept=".json,.reactor,application/json"
              style="display:none;"
              @change=${onFileChange}
            />
            <button
              class="splash-btn splash-btn-resume-primary save-slot-restore-btn"
              ?disabled=${this.state.selectedSlot == null}
              style="opacity: ${this.state.selectedSlot != null ? 1 : 0.5}"
              @click=${() => this._handleRestore()}
            >
              RESTORE
            </button>
            <button class="save-slot-import-btn" @click=${triggerFileInput}>IMPORT BACKUP</button>
            <button class="save-slot-back-action" @click=${() => this._close()}>BACK</button>
          </div>
        </div>
      </div>
    `;
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const prefix = this.state.selectedIsCloud ? "CLD" : "LOG";
    const logId = `${prefix} ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;

    if (this.state.selectedIsCloud) {
      const save = this.state.cloudSaveSlots.find((s) => s.slot === this.state.selectedSlot);
      if (save) await this.splashManager.loadFromData(save.data);
    } else {
      await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
    }
  }

  _close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.splashManager.splashScreen) this.splashManager.splashScreen.style.display = "";
  }

  render() {
    if (this.container) {
      render(this._mainTemplate(), this.container);
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    this.state = {
      localSaveSlots,
      cloudSaveSlots: [],
      isCloudAvailable: false,
      selectedSlot: null,
      selectedIsCloud: false,
      swipedSlots: new Set(),
    };

    if (window.supabaseAuth?.isSignedIn?.()) {
      try {
        this.state.cloudSaveSlots = await fetchCloudSaveSlots();
        this.state.isCloudAvailable = true;
      } catch (e) {
        logger.log("error", "splash", "Failed to load cloud saves", e);
      }
    }

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const allSlots = [
      ...(this.state.isCloudAvailable ? this.state.cloudSaveSlots : []),
      ...this.state.localSaveSlots,
    ];
    const firstFilled = allSlots.find((s) => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
      this.state.selectedIsCloud = !!firstFilled.isCloud;
    }

    this.render();
  }
}

const LOADING_STEPS = [
  { id: "init", message: "Initializing reactor systems..." },
  { id: "ui", message: "Calibrating control panels..." },
  { id: "game", message: "Spinning up nuclear protocols..." },
  { id: "parts", message: "Installing reactor components..." },
  { id: "upgrades", message: "Analyzing technological blueprints..." },
  { id: "objectives", message: "Briefing mission parameters..." },
  { id: "engine", message: "Achieving critical mass..." },
  { id: "ready", message: "Reactor online - All systems nominal!" },
];

class SplashFlowController {
  constructor() {
    this.loadingSteps = LOADING_STEPS;
    this.currentStep = 0;
  }
  nextStep(onUpdateStatus) {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      onUpdateStatus?.(step.message);
    }
  }
}

let flavorMessages = [];
dataService.loadFlavorText().then((messages) => {
  flavorMessages = messages;
}).catch((error) => {
  logger.log("warn", "splash", "Failed to load flavor text:", error);
  flavorMessages = ["Loading..."];
});

class SplashScreenManager extends BaseComponent {
  constructor() {
    super();
    this.splashScreen = null;
    this.statusElement = null;
    this._appContext = null;

    this.flowController = new SplashFlowController();
    this.loadingSteps = this.flowController.loadingSteps;
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.uiManager = new SplashUIManager({ statusElement: null, splashScreen: null });
    this.versionChecker = new VersionChecker(this);
    this.saveSlotUI = new SplashSaveSlotUI(this);

    if (!StorageUtils.get("reactor_user_id")) {
      StorageUtils.set("reactor_user_id", crypto.randomUUID());
    }

    this.readyPromise = isTestEnv() ? Promise.resolve(false) : this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;

    if (!isTestEnv()) {
      this.initSocketConnection();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      });
    }
  }

  async initSocketConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    if (typeof io === "undefined") return null;
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocalhost) return null;
    try {
      const { LEADERBOARD_CONFIG } = await import("./services_cloud.js");
      const apiUrl = LEADERBOARD_CONFIG.API_URL;
      const socket = io(apiUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: 3,
      });
      this.socket = socket;
      socket.on("connect", () => {});
      socket.on("userCount", (count) => {
        this.userCount = count;
        this.updateUserCountDisplay();
      });
      socket.on("disconnect", () => {});
      socket.on("connect_error", (error) => {
        logger.log("debug", "splash", "Socket.IO connection error:", error);
      });
      return socket;
    } catch (error) {
      logger.log("debug", "splash", "Failed to initialize Socket.IO:", error);
      return null;
    }
  }

  updateUserCountDisplay() {
    const ui = this._appContext?.ui;
    if (ui?.uiState) ui.uiState.user_count = this.userCount;
  }

  async waitForDOMAndLoad() {
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }
    return this.loadSplashScreen();
  }

  async loadSplashScreen() {
    return runLoadSplashScreen(this);
  }

  async initializeSplashStats() {
    if (!this.splashScreen) return;
    const version = await fetchVersionForSplash(this.versionChecker);
    const ui = this._appContext?.ui;
    if (ui?.uiState) {
      ui.uiState.version = version;
      ui.uiState.user_count = this.userCount;
    }
    addSplashStats(this.splashScreen, version, this.versionChecker, ui);
    mountSplashUserCountReactive(this.splashScreen, ui);
    this.versionChecker.startVersionChecking();
  }

  async showSaveSlotSelection(localSaveSlots) {
    await this.saveSlotUI.showSaveSlotSelection(localSaveSlots);
  }

  async loadFromData(saveData) {
    await loadFromDataImpl(this, saveData, this._appContext);
  }

  setAppContext(ctx) {
    this._appContext = ctx;
  }

  async loadFromSaveSlot(slot) {
    await loadFromSaveSlotImpl(this, slot, this._appContext);
  }

  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.updateStatus(message);
  }

  stopFlavorText() {
    this.uiManager.stopFlavorText();
  }

  nextStep() {
    this.flowController.nextStep((msg) => this.updateStatus(msg));
    this.currentStep = this.flowController.currentStep;
  }

  async setStep(stepId) {
    await this.ensureReady();
    runSetStep(this, stepId);
  }

  async setSubStep(message) {
    await this.ensureReady();
    runSetSubStep(this, message);
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (!this.splashScreen || this.isReady) return;

    this.stopFlavorText();
    const spinner = this.splashScreen?.querySelector(".splash-spinner");
    if (spinner) spinner.classList.add("splash-element-hidden");
    if (this.statusElement) this.statusElement.classList.add("splash-element-hidden");

    let startOptionsSection = this.splashScreen?.querySelector(".splash-start-options");
    if (!startOptionsSection) {
      startOptionsSection = document.createElement("div");
      startOptionsSection.id = "splash-start-options";
      startOptionsSection.className = "splash-start-options";
      const inner = this.splashScreen.querySelector(".splash-menu-inner");
      (inner ?? this.splashScreen.querySelector(".splash-menu-panel"))?.appendChild(startOptionsSection);
    }

    const builder = new SplashStartOptionsBuilder(this, this._appContext);
    const state = await builder.buildSaveSlotList(canLoadGame);
    builder.renderTo(startOptionsSection, state);

    startOptionsSection.classList.add("visible");
    setTimeout(() => startOptionsSection.classList.add("show"), 100);

    this.teardownIdleFade?.();
    const panel = this.splashScreen?.querySelector(".splash-menu-panel");
    if (panel) this.teardownIdleFade = initSplashMenuIdleFade(panel);
  }

  async setupSupabaseAuth(container) {
    return setupSplashAuth(container, this);
  }

  async setupGoogleDriveButtons(cloudButtonArea) {
    if (!window.googleDriveSave) {
      logger.warn("GoogleDriveSave not initialized.");
      return;
    }
    if (!window.googleDriveSave.isConfigured()) {
      render(html``, cloudButtonArea);
      return;
    }
    if (!navigator.onLine) {
      render(GoogleSignInButton(() => {}), cloudButtonArea);
      const btn = cloudButtonArea.firstElementChild;
      if (btn) {
        btn.disabled = true;
        btn.title = "Requires an internet connection";
      }
      return;
    }
    render(
      html`
        <button class="splash-btn splash-btn-google" disabled>
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <span class="loading-text">Checking ...</span>
          </div>
        </button>
      `,
      cloudButtonArea
    );
    try {
      const initialized = await window.googleDriveSave.init();
      if (!initialized) {
        render(html``, cloudButtonArea);
        return;
      }
      const isSignedIn = await window.googleDriveSave.checkAuth(true);
      await this.updateGoogleDriveUI(isSignedIn, cloudButtonArea);
    } catch (error) {
      logger.log("error", "splash", "Failed to setup Google Drive buttons:", error);
      render(html`<div>Google Drive Error</div>`, cloudButtonArea);
    }
  }

  async updateGoogleDriveUI(isSignedIn, cloudButtonArea) {
    await updateSplashGoogleDriveUI(this, isSignedIn, cloudButtonArea);
  }

  hide() {
    if (!this.splashScreen || this.isReady) return;
    this.isReady = true;
    this.teardownIdleFade?.();
    this.teardownIdleFade = null;
    this.stopFlavorText();
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.hide(() => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "SPLASH_HIDDEN" });
      }
    });
  }

  show() {
    if (this.splashScreen) {
      this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
      this.uiManager.show();
      this.isReady = false;
    }
  }

  showError(message, autoHide = true) {
    this.updateStatus(`Error: ${message}`);
    if (autoHide) {
      this.errorTimeout = setTimeout(() => {
        this.hide();
      }, 3000);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isReady = true;
      this.uiManager.forceHide();
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }
    }
  }

  showCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;
    loadFromCloudButton.classList.add("visible", "cloud-loading");
    const loadingButton = createLoadingButton("Checking...");
    loadFromCloudButton.innerHTML = loadingButton.innerHTML;
    loadFromCloudButton.disabled = true;
  }

  hideCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;
    loadFromCloudButton.classList.remove("cloud-loading");
    loadFromCloudButton.disabled = false;
  }

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

  hideGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.remove("google-loading");
      signInButton.disabled = false;
      const newButton = createGoogleSignInButtonWithIcon();
      signInButton.innerHTML = newButton.innerHTML;
    }
  }

  async refreshSaveOptions() {
    await this.showStartOptions(!!(await StorageAdapter.getRaw("reactorGameSave")));
  }
}

export function getFlavorMessages() {
  return flavorMessages;
}

export function createSplashManager() {
  return new SplashScreenManager();
}

export { SplashScreenManager };
