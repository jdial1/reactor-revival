import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import { StorageUtils } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

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
              imageUrl: userData.user.photoLink
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

function truncateEmail(email) {
  const full = email || "";
  return full.length > 10 ? full.substring(0, 10) + "..." : full;
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
      <button class="splash-auth-comms-btn" title="Sign in" aria-label="Sign in options" aria-haspopup="true" aria-expanded="false">[ COMMS ]</button>
      <div class="splash-auth-comms-dropdown hidden">
        <div class="splash-auth-comms-prompt">> AWAITING OPERATOR CREDENTIALS</div>
        <button class="splash-auth-comms-option" @click=${() => handleGoogleSignIn(container, splashManager)}>
          <span class="splash-auth-comms-icon">${GOOGLE_LABEL}</span> Sign in with Google
        </button>
        <button class="splash-auth-comms-option" @click=${() => { authState.showEmailForm = true; authState.message = ""; renderSignInForm(container, splashManager); }}>
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
      <input type="email" id="splash-supabase-email" placeholder="Email" class="pixel-input splash-auth-input"
             .value=${email} @input=${(e) => onInput(e, "email")}>
      <input type="password" id="splash-supabase-password" placeholder="Password" class="pixel-input splash-auth-input"
             .value=${password} @input=${(e) => onInput(e, "password")}>
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
  const onInput = (e, field) => { authState[field] = e.target.value; };
  const goBack = () => { authState.showEmailForm = false; authState.message = ""; renderSignInForm(container, splashManager); };

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

export async function setupSplashAuth(container, splashManager) {
  await refreshAuthTokens();
  const { googleSignedIn, googleUserInfo } = await fetchGoogleUserInfo();
  const supabaseSignedIn = window.supabaseAuth && window.supabaseAuth.isSignedIn();
  const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;
  const isAnySignedIn = googleSignedIn || supabaseSignedIn;

  if (isAnySignedIn) {
    render(signedInTemplate(container, splashManager, { googleSignedIn, googleUserInfo, supabaseSignedIn, supabaseUser }), container);
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
