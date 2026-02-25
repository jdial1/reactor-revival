import { numFormat as fmt, StorageUtils } from "../../utils/util.js";
import { escapeHtml } from "../../utils/stringUtils.js";
import { logger } from "../../utils/logger.js";
import { MODAL_IDS } from "../ModalManager.js";
import { createCloseButton } from "../buttonFactory.js";

function getAuthState() {
  const googleSignedIn = !!(window.googleDriveSave && window.googleDriveSave.isSignedIn);
  const supabaseSignedIn = !!(window.supabaseAuth && window.supabaseAuth.isSignedIn());
  return { googleSignedIn, supabaseSignedIn, isSignedIn: googleSignedIn || supabaseSignedIn };
}

function createModal(id) {
  const modal = document.createElement("div");
  modal.id = id;
  modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;";
  return modal;
}

function createModalContent(maxWidth = "400px") {
  const content = document.createElement("div");
  content.style.cssText = `background: rgb(45, 45, 45); border: 4px solid var(--bevel-light); padding: 1.5rem; max-width: ${maxWidth}; width: 90%; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5); position: relative;`;
  return content;
}

function attachOutsideClickDismiss(modal) {
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
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
    let html = "";
    game.upgradeset.treeList.forEach((tree) => {
      const isCurrent = tree.id === currentId;
      const label = isCurrent ? "Your doctrine" : "Locked";
      const names = (tree.upgrades || []).map((id) => game.upgradeset.getUpgrade(id)?.title ?? id);
      html += `<div class="doctrine-tree-block" data-doctrine="${escapeHtml(tree.id)}" style="border-left: 3px solid ${escapeHtml(tree.color || "#666")}; margin-bottom: 0.75rem; padding: 0.5rem 0 0.5rem 0.75rem;">`;
      html += `<div style="font-size: 0.7rem; font-weight: bold; color: ${isCurrent ? "rgb(200 220 180)" : "rgb(120 120 120)"};">${escapeHtml(tree.title)}</div>`;
      html += `<div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.35rem;">${escapeHtml(label)}</div>`;
      html += `<ul style="font-size: 0.6rem; color: rgb(170 180 160); margin: 0; padding-left: 1.25rem; list-style: disc;">`;
      names.slice(0, 24).forEach((name) => { html += `<li>${escapeHtml(name)}</li>`; });
      if (names.length > 24) html += `<li style="color: rgb(120 130 110);">+${names.length - 24} more</li>`;
      html += `</ul></div>`;
    });
    container.innerHTML = html;
    const respecBtn = document.getElementById("respec_doctrine_btn");
    if (respecBtn) {
      const cost = game.RESPER_DOCTRINE_EP_COST ?? 50;
      respecBtn.textContent = `Respec doctrine (${cost} EP)`;
      const canRespec = !!game.tech_tree && (game.state.current_exotic_particles ?? 0) >= cost;
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

    const modal = createModal("user_login_modal");
    const content = createModalContent("440px");
    content.style.maxHeight = "90vh";
    content.style.overflowY = "auto";

    const title = document.createElement("h2");
    title.style.cssText = "margin: 0 0 1rem; font-size: 1rem; color: rgb(200 220 180); font-family: inherit;";
    title.textContent = "Profile";
    content.appendChild(title);

    const accountLine = document.createElement("div");
    accountLine.style.cssText = "font-size: 0.7rem; margin-bottom: 1rem; color: rgb(180 190 170);";
    if (googleUserInfo?.email) accountLine.textContent = "Signed in with Google · " + googleUserInfo.email;
    else if (supabaseUser?.email) accountLine.textContent = "Signed in with Email · " + supabaseUser.email;
    else accountLine.textContent = "Signed in";
    content.appendChild(accountLine);

    const doctrineInfo = this.getDoctrineInfo();
    if (doctrineInfo) {
      const doctrineBlock = document.createElement("div");
      doctrineBlock.style.cssText = "margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid rgb(60 60 60);";
      doctrineBlock.innerHTML = `
        <div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.25rem;">Doctrine</div>
        <div style="font-size: 0.75rem; color: rgb(200 220 180);">${escapeHtml(doctrineInfo.title)}</div>
        <div style="font-size: 0.5rem; color: rgb(120 130 110);">${escapeHtml(doctrineInfo.subtitle || "")}</div>
      `;
      content.appendChild(doctrineBlock);
    }

    const classification = this.getReactorClassification();
    if (classification) {
      const classBlock = document.createElement("div");
      classBlock.style.cssText = "margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid rgb(60 60 60);";
      classBlock.innerHTML = `
        <div style="font-size: 0.55rem; color: rgb(140 150 130); margin-bottom: 0.25rem;">Reactor classification</div>
        <div style="font-size: 0.7rem; color: rgb(74 222 128); font-weight: bold; margin-bottom: 0.25rem;">${escapeHtml(classification.classification)}</div>
        <div style="font-size: 0.5rem; color: rgb(150 160 140); line-height: 1.4;">${escapeHtml(classification.summary)}</div>
      `;
      content.appendChild(classBlock);
    }

    if (game?.reactor) {
      const r = game.reactor;
      const statsBlock = document.createElement("div");
      statsBlock.style.cssText = "margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid rgb(60 60 60);";
      statsBlock.innerHTML = `
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
      `;
      content.appendChild(statsBlock);
    }

    const logoutBtn = document.createElement("button");
    logoutBtn.className = "splash-btn splash-btn-exit";
    logoutBtn.style.width = "100%";
    logoutBtn.textContent = "Sign Out";
    logoutBtn.addEventListener("click", () =>
      performSignOut(modal, googleSignedIn, supabaseSignedIn, () => this.updateUserAccountIcon())
    );
    content.appendChild(logoutBtn);

    content.insertBefore(createCloseButton(modal), content.firstChild);
    modal.appendChild(content);
    attachOutsideClickDismiss(modal);
    document.body.appendChild(modal);
  }

  showLoginModal() {
    const modal = createModal("user_login_modal");
    const content = createModalContent("400px");

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display: flex; gap: 0.5rem; margin-bottom: 1rem;";

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
      if (!window.googleDriveSave) return;
      try {
        await window.googleDriveSave.signIn();
        await window.googleDriveSave.checkAuth(false);
        this.updateUserAccountIcon();
        modal.remove();
      } catch (error) {
        logger.error("Google sign-in error:", error);
      }
    });
    buttonRow.appendChild(googleBtn);

    const emailBtn = document.createElement("button");
    emailBtn.className = "splash-btn";
    emailBtn.style.cssText = "flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;";
    emailBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
      <span>Email</span>
    `;
    buttonRow.appendChild(emailBtn);

    const authForm = document.createElement("div");
    authForm.id = "nav-email-auth-form";
    authForm.style.cssText = "display: none; flex-direction: column; gap: 0.5rem;";
    authForm.innerHTML = `
      <input type="email" id="nav-supabase-email" placeholder="Email" class="pixel-input" style="padding: 0.5rem; font-size: 0.8rem;">
      <input type="password" id="nav-supabase-password" placeholder="Password" class="pixel-input" style="padding: 0.5rem; font-size: 0.8rem;">
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
        <button class="splash-btn" id="nav-supabase-signin" style="min-width: 100px; flex: 1; border-color: rgb(43 158 107); background-color: rgb(62 207 142);">Sign In</button>
        <button class="splash-btn" id="nav-supabase-signup" style="min-width: 100px; flex: 1; border-color: rgb(43 158 107); background-color: rgb(62 207 142);">Sign Up</button>
        <button class="splash-btn" id="nav-supabase-reset" style="min-width: 100px; flex: 1; border-color: rgb(43 158 107); background-color: rgb(62 207 142);">Reset</button>
      </div>
      <div id="nav-supabase-message" style="min-height: 1.5rem; font-size: 0.7rem; text-align: center;"></div>
    `;

    emailBtn.addEventListener("click", () => {
      authForm.style.display = authForm.style.display !== "none" ? "none" : "flex";
    });

    const emailInput = authForm.querySelector("#nav-supabase-email");
    const passwordInput = authForm.querySelector("#nav-supabase-password");
    const messageDiv = authForm.querySelector("#nav-supabase-message");

    const showMessage = (text, isError = false) => {
      if (messageDiv) {
        messageDiv.textContent = text;
        messageDiv.style.color = isError ? '#ff4444' : '#44ff44';
      }
    };

    const getCredentials = () => {
      const email = emailInput?.value.trim();
      const password = passwordInput?.value;
      return { email, password };
    };

    authForm.querySelector("#nav-supabase-signin")?.addEventListener("click", async () => {
      const { email, password } = getCredentials();
      if (!email || !password) { showMessage('Please enter email and password', true); return; }
      showMessage('Signing in...');
      const { error } = await window.supabaseAuth.signInWithPassword(email, password);
      if (error) { showMessage(error, true); return; }
      showMessage('Signed in successfully!');
      if (passwordInput) passwordInput.value = '';
      setTimeout(() => { this.updateUserAccountIcon(); modal.remove(); }, 1000);
    });

    authForm.querySelector("#nav-supabase-signup")?.addEventListener("click", async () => {
      const { email, password } = getCredentials();
      if (!email || !password) { showMessage('Please enter email and password', true); return; }
      if (password.length < 6) { showMessage('Password must be at least 6 characters', true); return; }
      showMessage('Signing up...');
      const { error } = await window.supabaseAuth.signUp(email, password);
      if (error) { showMessage(error, true); return; }
      showMessage('Sign up successful! Please check your email to confirm your account.');
      if (passwordInput) passwordInput.value = '';
    });

    authForm.querySelector("#nav-supabase-reset")?.addEventListener("click", async () => {
      const { email } = getCredentials();
      if (!email) { showMessage('Please enter your email address', true); return; }
      showMessage('Sending password reset email...');
      const { error } = await window.supabaseAuth.resetPasswordForEmail(email);
      if (error) { showMessage(error, true); return; }
      showMessage('Password reset email sent! Please check your email.');
    });

    content.appendChild(createCloseButton(modal));
    content.appendChild(buttonRow);
    content.appendChild(authForm);
    modal.appendChild(content);
    attachOutsideClickDismiss(modal);
    document.body.appendChild(modal);
  }

  showLogoutModal() {
    const { googleSignedIn, supabaseSignedIn } = getAuthState();
    const googleUserInfo = googleSignedIn ? window.googleDriveSave.getUserInfo() : null;
    const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;

    const modal = createModal("user_logout_modal");
    const content = createModalContent("400px");

    const provider = googleUserInfo ? "Google" : supabaseUser ? "Email" : null;
    const email = googleUserInfo?.email || supabaseUser?.email || null;
    if (provider) {
      const signedInWith = document.createElement('div');
      signedInWith.style.cssText = "font-size: 0.8rem; margin-bottom: 1rem;";
      signedInWith.textContent = `Signed in with ${provider}`;
      content.appendChild(signedInWith);
    }
    if (email) {
      const emailDiv = document.createElement('div');
      emailDiv.style.cssText = "font-size: 0.7rem; opacity: 0.8; margin-bottom: 1rem;";
      emailDiv.textContent = email;
      content.appendChild(emailDiv);
    }

    const logoutBtn = document.createElement("button");
    logoutBtn.className = "splash-btn";
    logoutBtn.style.cssText = "background: #d32f2f; border-color: #b71c1c; width: 100%;";
    logoutBtn.textContent = "Sign Out";
    logoutBtn.addEventListener("click", () =>
      performSignOut(modal, googleSignedIn, supabaseSignedIn, () => this.updateUserAccountIcon())
    );

    content.appendChild(createCloseButton(modal));
    content.appendChild(logoutBtn);
    modal.appendChild(content);
    attachOutsideClickDismiss(modal);
    document.body.appendChild(modal);
  }
}
