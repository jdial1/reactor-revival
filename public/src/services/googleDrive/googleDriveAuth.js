import { getGoogleDriveAuth as getGoogleDriveConfig } from "../appConfig.js";
import { StorageUtils } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

export function restoreAuthToken(service) {
  try {
    const tokenData = StorageUtils.get("google_drive_auth_token");
    if (tokenData) {
      if (tokenData.expires_at && tokenData.expires_at > Date.now() + 300000) {
        service.authToken = tokenData.access_token;
        service.isSignedIn = true;
      } else {
        StorageUtils.remove("google_drive_auth_token");
      }
    }
  } catch {
    StorageUtils.remove("google_drive_auth_token");
  }
}

export function restoreUserInfo(service) {
  try {
    const userInfo = StorageUtils.get("google_drive_user_info");
    if (userInfo) service.userInfo = userInfo;
  } catch {
    StorageUtils.remove("google_drive_user_info");
  }
}

export function isConfigured(service) {
  try {
    if (!service.config) {
      service.config = getGoogleDriveConfig();
    }
    return !!(service.config && service.config.CLIENT_ID && service.config.API_KEY);
  } catch {
    return false;
  }
}

function loadScript(src, errorName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(errorName));
    document.head.appendChild(script);
  });
}

async function loadGsiClientIfNeeded() {
  if (window.google?.accounts) return;
  await loadScript("https://accounts.google.com/gsi/client", "gsi load failed");
}

async function loadGapiApiIfNeeded() {
  if (window.gapi) return;
  await loadScript("https://apis.google.com/js/api.js", "gapi load failed");
}

async function loadGapiClientAndDrive(service) {
  await new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({ apiKey: service.config.API_KEY });
        await gapi.client.load("drive", "v3");
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

function initTokenClient(service) {
  service.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: service.config.CLIENT_ID,
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
    callback: async (response) => {
      if (response.access_token) {
        await handleAuthSuccess(service, response);
      }
    },
  });
}

export async function loadGapiScripts(service) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  await loadGsiClientIfNeeded();
  await loadGapiApiIfNeeded();
  await loadGapiClientAndDrive(service);
  initTokenClient(service);
}

export async function handleAuthSuccess(service, response) {
  const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
  const tokenData = { access_token: response.access_token, expires_at: expiresAt };
  StorageUtils.set("google_drive_auth_token", tokenData);
  service.authToken = response.access_token;
  service.isSignedIn = true;
  try {
    const userResponse = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${service.authToken}` },
    });
    if (userResponse.ok) {
      const userData = await userResponse.json();
      if (userData.user) {
        service.userInfo = {
          id: userData.user.permissionId || userData.user.emailAddress,
          email: userData.user.emailAddress,
          name: userData.user.displayName,
          imageUrl: userData.user.photoLink,
        };
        StorageUtils.set("google_drive_user_info", service.userInfo);
      }
    }
  } catch (err) {
    logger.log('error', 'game', 'Error fetching user info:', err);
  }
}

function tryRestoreTokenFromStorage(service) {
  if (service.authToken) return;
  const tokenData = StorageUtils.get("google_drive_auth_token");
  if (!tokenData) return;
  try {
    if (tokenData.expires_at && tokenData.expires_at > Date.now() + 300000) {
      service.authToken = tokenData.access_token;
    } else {
      StorageUtils.remove("google_drive_auth_token");
    }
  } catch {
    StorageUtils.remove("google_drive_auth_token");
  }
}

async function validateTokenWithDriveApi(service) {
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: `Bearer ${service.authToken}` },
  });
  if (!response.ok) return false;
  const data = await response.json();
  if (!data.user) return false;
  service.userInfo = {
    id: data.user.permissionId || data.user.emailAddress,
    email: data.user.emailAddress,
    name: data.user.displayName,
    imageUrl: data.user.photoLink,
  };
  StorageUtils.set("google_drive_user_info", service.userInfo);
  service.isSignedIn = true;
  return true;
}

function clearAuthState(service) {
  service.authToken = null;
  service.isSignedIn = false;
  service.userInfo = null;
  StorageUtils.remove("google_drive_auth_token");
  StorageUtils.remove("google_drive_user_info");
}

function tryLegacyGapiAuth(service) {
  if (!window.gapi?.auth2) return false;
  const authInstance = window.gapi.auth2.getAuthInstance();
  if (!authInstance || !authInstance.isSignedIn.get()) return false;
  const user = authInstance.currentUser.get();
  const authResponse = user.getAuthResponse();
  service.authToken = authResponse.access_token;
  service.isSignedIn = true;
  const expiresAt = Date.now() + (authResponse.expires_in || 3600) * 1000;
  StorageUtils.set("google_drive_auth_token", { access_token: authResponse.access_token, expires_at: expiresAt });
  const profile = user.getBasicProfile();
  if (profile) {
    service.userInfo = {
      id: profile.getId(),
      email: profile.getEmail(),
      name: profile.getName(),
      imageUrl: profile.getImageUrl(),
    };
    StorageUtils.set("google_drive_user_info", service.userInfo);
  }
  return true;
}

export async function checkAuth(service, silent = true) {
  if (!isConfigured(service)) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (service.authToken) service.isSignedIn = true;
    return !!service.authToken;
  }
  try {
    tryRestoreTokenFromStorage(service);
    if (service.authToken) {
      const valid = await validateTokenWithDriveApi(service);
      if (valid) return true;
      clearAuthState(service);
    }
    if (tryLegacyGapiAuth(service)) return true;
    return false;
  } catch {
    return false;
  }
}

export function getUserInfo(service) {
  if (!service.isSignedIn) return null;
  if (service.userInfo) return service.userInfo;
  try {
    if (window.gapi && window.gapi.auth2) {
      const authInstance = window.gapi.auth2.getAuthInstance();
      if (authInstance && authInstance.isSignedIn.get()) {
        const user = authInstance.currentUser.get();
        const profile = user.getBasicProfile();
        if (profile) {
          service.userInfo = {
            id: profile.getId(),
            email: profile.getEmail(),
            name: profile.getName(),
            imageUrl: profile.getImageUrl(),
          };
          StorageUtils.set("google_drive_user_info", service.userInfo);
          return service.userInfo;
        }
      }
    }
  } catch (err) {
    logger.log('error', 'game', 'Error getting Google user info:', err);
  }
  return null;
}

export function getUserId(service) {
  const userInfo = getUserInfo(service);
  return userInfo ? userInfo.id : null;
}

export function signOut(service) {
  if (service.authToken && typeof google !== "undefined" && google.accounts?.oauth2?.revoke) {
    google.accounts.oauth2.revoke(service.authToken);
  }
  StorageUtils.remove("google_drive_auth_token");
  StorageUtils.remove("google_drive_save_file_id");
  StorageUtils.remove("google_drive_user_info");
  service.isSignedIn = false;
  service.authToken = null;
  service.saveFileId = null;
  service.userInfo = null;
}

export function signIn(service) {
  if (!service.tokenClient) throw new Error("Google Drive not initialized");
  return new Promise((resolve, reject) => {
    service.tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        handleAuthSuccess(service, response).then(resolve).catch(reject);
      }
    };
    service.tokenClient.requestAccessToken({ prompt: "consent" });
  });
}
