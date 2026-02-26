import { html, render } from "lit-html";
import { unsafeHTML } from "../../utils/litHelpers.js";
import { StorageUtils } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

const GOOGLE_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" style="margin-right: 0.5rem; vertical-align: middle;">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
`;

const GOOGLE_BUTTON_SVG = `
  <svg width="24" height="24" viewBox="0 0 24 24" class="google-icon">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
`;

const EMAIL_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem; vertical-align: middle;">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
    <polyline points="22,6 12,13 2,6"></polyline>
  </svg>
`;

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
        logger.error("Error fetching Google user info:", error);
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
  const userEmail = googleUserInfo ? truncateEmail(googleUserInfo.email) : supabaseUser ? truncateEmail(supabaseUser.email) : "";
  const authIcon = googleUserInfo ? GOOGLE_ICON_SVG : supabaseUser ? EMAIL_ICON_SVG : "";
  const onLogout = () => handleAuthLogout(container, splashManager, { supabaseSignedIn, googleSignedIn });
  return html`
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; border: 2px solid rgb(62, 207, 142); border-radius: 4px; background-color: rgba(62, 207, 142, 0.1);">
      ${userEmail ? html`
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 0.8rem; font-weight: bold; color: rgb(62, 207, 142); gap: 0.5rem;">
          <div style="display: flex; align-items: center; flex: 1; min-width: 0;">${unsafeHTML(authIcon)}<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${userEmail}</span></div>
          <button @click=${onLogout} style="background-color: #d32f2f; color: white; border: 1px solid #b71c1c; border-radius: 4px; padding: 0.25rem 0.5rem; font-size: 1rem; cursor: pointer; font-weight: bold; flex-shrink: 0; line-height: 1; min-width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
      ` : ""}
    </div>
  `;
}

function signInTemplate(container, splashManager) {
  const onGoogleClick = async () => {
    if (!window.googleDriveSave) return;
    try {
      await window.googleDriveSave.signIn();
      await window.googleDriveSave.checkAuth(false);
      render(html``, container);
      splashManager.setupSupabaseAuth(container);
    } catch (error) {
      logger.error("Google sign-in error:", error);
    }
  };
  const onSignIn = async () => {
    const emailInput = container.querySelector("#splash-supabase-email");
    const passwordInput = container.querySelector("#splash-supabase-password");
    const messageDiv = container.querySelector("#splash-supabase-message");
    if (!emailInput || !passwordInput) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      if (messageDiv) { messageDiv.textContent = "Please enter email and password"; messageDiv.style.color = "#ff4444"; }
      return;
    }
    if (messageDiv) { messageDiv.textContent = "Signing in..."; messageDiv.style.color = "#44ff44"; }
    const { error } = await window.supabaseAuth.signInWithPassword(email, password);
    if (error) {
      if (messageDiv) { messageDiv.textContent = error; messageDiv.style.color = "#ff4444"; }
    } else {
      if (messageDiv) messageDiv.textContent = "Signed in successfully!";
      if (passwordInput) passwordInput.value = "";
      setTimeout(() => { render(html``, container); splashManager.setupSupabaseAuth(container); }, 1000);
    }
  };
  const onSignUp = async () => {
    const emailInput = container.querySelector("#splash-supabase-email");
    const passwordInput = container.querySelector("#splash-supabase-password");
    const messageDiv = container.querySelector("#splash-supabase-message");
    if (!emailInput || !passwordInput) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      if (messageDiv) { messageDiv.textContent = "Please enter email and password"; messageDiv.style.color = "#ff4444"; }
      return;
    }
    if (password.length < 6) {
      if (messageDiv) { messageDiv.textContent = "Password must be at least 6 characters"; messageDiv.style.color = "#ff4444"; }
      return;
    }
    if (messageDiv) { messageDiv.textContent = "Signing up..."; messageDiv.style.color = "#44ff44"; }
    const { error } = await window.supabaseAuth.signUp(email, password);
    if (error) {
      if (messageDiv) { messageDiv.textContent = error; messageDiv.style.color = "#ff4444"; }
    } else {
      if (messageDiv) messageDiv.textContent = "Sign up successful! Please check your email to confirm your account.";
      if (passwordInput) passwordInput.value = "";
    }
  };
  const onReset = async () => {
    const emailInput = container.querySelector("#splash-supabase-email");
    const messageDiv = container.querySelector("#splash-supabase-message");
    if (!emailInput) return;
    const email = emailInput.value.trim();
    if (!email) {
      if (messageDiv) { messageDiv.textContent = "Please enter your email address"; messageDiv.style.color = "#ff4444"; }
      return;
    }
    if (messageDiv) { messageDiv.textContent = "Sending password reset email..."; messageDiv.style.color = "#44ff44"; }
    const { error } = await window.supabaseAuth.resetPasswordForEmail(email);
    if (error) {
      if (messageDiv) { messageDiv.textContent = error; messageDiv.style.color = "#ff4444"; }
    } else {
      if (messageDiv) messageDiv.textContent = "Password reset email sent! Please check your email.";
    }
  };
  const onEmailToggle = () => {
    const form = container.querySelector("#splash-email-auth-form");
    const msg = container.querySelector("#splash-supabase-message");
    if (!form) return;
    const isVisible = form.style.display !== "none";
    form.style.display = isVisible ? "none" : "flex";
    if (msg && !isVisible) msg.textContent = "";
  };
  return html`
    <div class="splash-auth-buttons">
      <button class="splash-btn splash-btn-google" style="flex: 1" @click=${onGoogleClick}>
        <div class="google-signin-container">${unsafeHTML(GOOGLE_BUTTON_SVG)}<span>Google</span></div>
      </button>
      <button class="splash-btn" style="flex: 1" @click=${onEmailToggle}>Email</button>
    </div>
    <div id="splash-email-auth-form" style="display: none; flex-direction: column; gap: 0.5rem;">
      <input type="email" id="splash-supabase-email" placeholder="Email" class="pixel-input" style="padding: 0.5rem; font-size: 0.8rem;">
      <input type="password" id="splash-supabase-password" placeholder="Password" class="pixel-input" style="padding: 0.5rem; font-size: 0.8rem;">
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
        <button class="splash-btn" style="min-width: 100px; flex: 1; border-color: rgb(43 158 107); background-color: rgb(62 207 142);" @click=${onSignIn}>Sign In</button>
        <button class="splash-btn" style="min-width: 100px; flex: 1; border-color: rgb(43 158 107); background-color: rgb(62 207 142);" @click=${onSignUp}>Sign Up</button>
        <button class="splash-btn" style="min-width: 100px; flex: 1; border-color: rgb(43 158 107); background-color: rgb(62 207 142);" @click=${onReset}>Reset</button>
      </div>
      <div id="splash-supabase-message" style="min-height: 1.5rem; font-size: 0.7rem; text-align: center;"></div>
    </div>
  `;
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
    render(signInTemplate(container, splashManager), container);
  }
}
