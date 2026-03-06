import { html, render } from "lit-html";
import { repeat } from "../../utils/litHelpers.js";
import { numFormat as fmt, StorageUtils } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { MODAL_IDS } from "../ModalManager.js";
import { CloseButton } from "../buttonFactory.js";

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

export class UserAccountUI {
  constructor(ui) {
    this.ui = ui;
    this._buttonAbortController = null;
  }

  setupUserAccountButton() {
    const userAccountBtn = document.getElementById("user_account_btn");
    const userAccountBtnMobile = document.getElementById("user_account_btn_mobile");
    if (!userAccountBtn && !userAccountBtnMobile) return;

    this.teardownUserAccountButton();
    this._buttonAbortController = new AbortController();
    const { signal } = this._buttonAbortController;

    this.updateUserAccountIcon();
    const clickHandler = () => this.handleUserAccountClick();

    if (userAccountBtn) userAccountBtn.addEventListener("click", clickHandler, { signal });
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

  updateUserAccountIcon() {
    const { isSignedIn } = getAuthState();
    const icon = isSignedIn ? "👤" : "🔐";
    const title = isSignedIn ? "Account (Signed In)" : "Sign In";

    const userAccountBtn = document.getElementById("user_account_btn");
    const userAccountBtnMobile = document.getElementById("user_account_btn_mobile");
    if (userAccountBtn) {
      userAccountBtn.textContent = icon;
      userAccountBtn.title = title;
    }
    if (userAccountBtnMobile) {
      const iconSpan = userAccountBtnMobile.querySelector(".control-icon");
      if (iconSpan) iconSpan.textContent = icon;
      userAccountBtnMobile.title = title;
    }
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
    `;
    render(tpl, container);
    const respecBtn = document.getElementById("respec_doctrine_btn");
    if (respecBtn) {
      const cost = game.RESPER_DOCTRINE_EP_COST ?? 50;
      const canRespec = !!game.tech_tree && (game.state.current_exotic_particles ?? 0) >= cost;
      respecBtn.textContent = `Respec doctrine (${cost} EP)`;
      respecBtn.disabled = !canRespec;
      respecBtn.title = canRespec
        ? "Reset doctrine and that path's upgrades; costs Exotic Particles"
        : (game.tech_tree ? `Requires ${cost} Exotic Particles` : "No doctrine selected");
    }
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
    const modal = modalOverlay("user_login_modal", () => modal.remove());
    const content = document.createElement("div");
    content.className = "nav-auth-modal nav-auth-terminal";
    modal.appendChild(content);

    const onGoogleClick = async () => {
      if (!window.googleDriveSave) return;
      try {
        await window.googleDriveSave.signIn();
        await window.googleDriveSave.checkAuth(false);
        this.updateUserAccountIcon();
        modal.remove();
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
    const showMessage = (text, isError) => {
      const msg = content.querySelector("#nav-supabase-message");
      if (msg) { msg.textContent = text; msg.style.color = isError ? "#ff4444" : "#44ff44"; }
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
      setTimeout(() => { this.updateUserAccountIcon(); modal.remove(); }, 1000);
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
      ${CloseButton(modal, () => modal.remove())}
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
