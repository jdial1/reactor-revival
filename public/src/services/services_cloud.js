import { z } from 'zod';
import { GOOGLE_DRIVE_CONFIG, getGoogleDriveAuth as getGoogleDriveConfig, getSupabaseUrl, getSupabaseAnonKey } from "../utils/utils_constants.js";
import { StorageUtils, StorageAdapter, serializeSave, deserializeSave, getBasePath, logger, isTestEnv } from "../utils/utils_constants.js";
import { queryClient, queryKeys } from './dataService.js';

function restoreAuthToken(service) {
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

function restoreUserInfo(service) {
  try {
    const userInfo = StorageUtils.get("google_drive_user_info");
    if (userInfo) service.userInfo = userInfo;
  } catch {
    StorageUtils.remove("google_drive_user_info");
  }
}

function isConfigured(service) {
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

async function loadGapiScripts(service) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  await loadGsiClientIfNeeded();
  await loadGapiApiIfNeeded();
  await loadGapiClientAndDrive(service);
  initTokenClient(service);
}

async function handleAuthSuccess(service, response) {
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

async function checkAuth(service, silent = true) {
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

function getUserInfo(service) {
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

function getUserId(service) {
  const userInfo = getUserInfo(service);
  return userInfo ? userInfo.id : null;
}

function signOut(service) {
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

function signIn(service) {
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

async function findSaveFile(service) {
  if (!service.isSignedIn) return false;
  try {
    const searchQuery = encodeURIComponent("name contains 'reactor-revival-save'");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&orderBy=createdTime desc&spaces=drive`,
      { headers: { Authorization: `Bearer ${service.authToken}` } }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const mostRecent = data.files[0];
        service.saveFileId = mostRecent.id;
        StorageUtils.set("google_drive_save_file_id", mostRecent.id);
        return true;
      }
    }
    if (service.saveFileId) {
      const verifyResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${service.saveFileId}`,
        { headers: { Authorization: `Bearer ${service.authToken}` } }
      );
      if (verifyResponse.ok) return true;
      service.saveFileId = null;
      StorageUtils.remove("google_drive_save_file_id");
    }
    return false;
  } catch (err) {
    logger.log('error', 'game', 'Error finding save file:', err);
    return false;
  }
}

async function loadZipLibrary(service) {
  if (typeof pako === "undefined") {
    throw new Error("pako library not loaded. Check that lib/pako.min.js is included in HTML.");
  }
  if (typeof window.zip === "undefined") {
    throw new Error("zip.js library not loaded. Check that lib/zip.min.js is included in HTML.");
  }
  if (window.zip) {
    window.zip.configure({ useWebWorkers: false });
  }
}

async function compressAndEncrypt(service, saveData) {
  await loadZipLibrary(service);
  if (!window.zip) throw new Error("zip.js library failed to load");
  const password = "reactor-revival-secure-save-2024";
  const zipWriter = new window.zip.ZipWriter(new window.zip.BlobWriter("application/zip"), {
    password,
    zipCrypto: true,
  });
  const text = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await zipWriter.add("save.json", new window.zip.TextReader(text));
  return await zipWriter.close();
}

async function decompressAndDecryptLegacy(service, encryptedData) {
  if (!(encryptedData instanceof ArrayBuffer)) throw new Error("Encrypted data must be an ArrayBuffer.");
  const key = "a_very_secure_key";
  const encryptedBytes = new Uint8Array(encryptedData);
  const decryptedBytes = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decryptedBytes[i] = encryptedBytes[i] ^ key.charCodeAt(i % key.length);
  }
  if (typeof pako === "undefined") throw new Error("pako is not defined");
  const decompressedData = pako.inflate(decryptedBytes, { to: "string" });
  return deserializeSave(decompressedData);
}

async function decompressAndDecrypt(service, encryptedData) {
  await loadZipLibrary(service);
  if (!window.zip) throw new Error("zip.js library failed to load");
  try {
    const blob = new Blob([encryptedData], { type: "application/zip" });
    const zipReader = new window.zip.ZipReader(new window.zip.BlobReader(blob));
    const password = "reactor-revival-secure-save-2024";
    const entries = await zipReader.getEntries({ password });
    if (entries.length > 0) {
      const writer = new window.zip.TextWriter();
      const jsonText = await entries[0].getData(writer, { password });
      await zipReader.close();
      return deserializeSave(jsonText);
    }
    await zipReader.close();
    throw new Error("No data found in save file.");
  } catch (err) {
    if (err.message && err.message.includes("password")) {
      return decompressAndDecryptLegacy(service, encryptedData);
    }
    throw err;
  }
}

async function load(service) {
  if (!service.isSignedIn || !service.saveFileId) throw new Error("No save file available");
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${service.saveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${service.authToken}` } }
    );
    if (!response.ok) throw new Error(`Failed to download save file: ${response.status}`);
    const encryptedData = await response.arrayBuffer();
    return await decompressAndDecrypt(service, encryptedData);
  } catch (err) {
    logger.log('error', 'game', 'Failed to load from Google Drive:', err);
    throw err;
  }
}

async function uploadToExistingFile(service, fileId, encryptedBlob) {
  return await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${service.authToken}`, "Content-Type": "application/zip" },
      body: encryptedBlob,
    }
  );
}

async function createNewSaveFile(service) {
  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const fileName = `reactor-revival-save-${timestamp}.zip`;
  const metadataResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${service.authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: fileName, description: "Reactor Revival game save (encrypted)" }),
  });
  if (!metadataResponse.ok) throw new Error(`File creation failed: ${metadataResponse.status}`);
  return await metadataResponse.json();
}

async function uploadToNewFile(service, encryptedBlob) {
  const fileMetadata = await createNewSaveFile(service);
  return await uploadToExistingFile(service, fileMetadata.id, encryptedBlob);
}

async function performSave(service, saveData) {
  const encryptedBlob = await compressAndEncrypt(service, saveData);

  let response;
  if (service.saveFileId) {
    response = await uploadToExistingFile(service, service.saveFileId, encryptedBlob);
  } else {
    response = await uploadToNewFile(service, encryptedBlob);
  }

  if (!response.ok) {
    if (response.status === 404 && service.saveFileId) {
      service.saveFileId = null;
      return await performSave(service, saveData);
    }
    throw new Error(`Save failed: ${response.status}`);
  }

  const result = await response.json();
  service.saveFileId = result.id;
  StorageUtils.set("google_drive_save_file_id", result.id);
  return true;
}

async function save(service, saveData, immediate = false) {
  if (!service.isSignedIn) throw new Error("Not signed in to Google Drive");
  if (!immediate) {
    service.pendingSaveData = saveData;
    if (service.saveTimeoutId) clearTimeout(service.saveTimeoutId);
    service.saveTimeoutId = setTimeout(() => {
      if (service.pendingSaveData) {
        const data = service.pendingSaveData;
        service.pendingSaveData = null;
        performSave(service, data);
      }
    }, 2000);
    return true;
  }
  return await performSave(service, saveData);
}

async function uploadLocalSave(service, saveDataString) {
  if (!service.isSignedIn) throw new Error("User is not signed in to Google Drive");
  const success = await performSave(service, saveDataString);
  if (success) {
    try {
      const localSave = deserializeSave(saveDataString);
      localSave.isCloudSynced = true;
      localSave.cloudUploadedAt = new Date().toISOString();
      await StorageAdapter.set("reactorGameSave", localSave);
    } catch (e) {
      logger.log('error', 'game', 'Failed to mark local save as synced after upload.', e);
    }
  }
  return success;
}

async function canUploadLocalSave(service) {
  if (!service.isSignedIn) return { showUpload: false };
  const localSave = await StorageAdapter.get("reactorGameSave");
  if (!localSave) return { showUpload: false };
  try {
    if (localSave.isCloudSynced) return { showUpload: false };
    const hasCloudSave = await findSaveFile(service);
    if (hasCloudSave) return { showUpload: false };
    return { showUpload: true, gameState: localSave };
  } catch {
    return { showUpload: false };
  }
}

async function offerLocalSaveUpload(service) {
  if (!service.isSignedIn) return { hasLocalSave: false };
  const gameState = await StorageAdapter.get("reactorGameSave");
  if (!gameState) return { hasLocalSave: false };
  try {
    const saveSize = `${(serializeSave(gameState).length / 1024).toFixed(1)}KB`;
    const hasCloudSave = await findSaveFile(service);
    if (hasCloudSave) return { hasLocalSave: false };
    if (gameState.isCloudSynced) {
      delete gameState.isCloudSynced;
      delete gameState.cloudUploadedAt;
      await StorageAdapter.set("reactorGameSave", gameState);
    }
    return { hasLocalSave: true, gameState, saveSize };
  } catch {
    return { hasLocalSave: false };
  }
}

async function flushPendingSave(service) {
  if (service.pendingSaveData && service.isSignedIn) {
    const dataToSave = service.pendingSaveData;
    service.pendingSaveData = null;
    if (service.saveTimeoutId) {
      clearTimeout(service.saveTimeoutId);
      service.saveTimeoutId = null;
    }
    return await performSave(service, dataToSave);
  }
  return true;
}

async function testBasicFileOperations(service) {
  if (!service.isSignedIn) return false;
  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${service.authToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteSave(service) {
  if (!service.isSignedIn || !service.saveFileId) throw new Error("No save file to delete");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${service.saveFileId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${service.authToken}` } }
  );
  if (response.ok) {
    service.saveFileId = null;
    return true;
  }
  throw new Error(`Failed to delete save file: ${response.status}`);
}

export class GoogleDriveSave {
  constructor() {
    this.enabled = GOOGLE_DRIVE_CONFIG.ENABLE_GOOGLE_DRIVE;
    this.isSignedIn = false;
    this.authToken = null;
    this.userInfo = null;
    this.saveFileId = StorageUtils.get("google_drive_save_file_id") || null;
    this.lastSaveTime = 0;
    this.pendingSaveData = null;
    this.saveTimeoutId = null;
    this.config = null;
    restoreAuthToken(this);
    restoreUserInfo(this);
    if (this.enabled) this.init();
  }

  isConfigured() {
    return isConfigured(this);
  }

  async init() {
    if (!this.isConfigured()) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    try {
      await loadGapiScripts(this);
      await checkAuth(this, true);
      return true;
    } catch {
      return false;
    }
  }

  async checkAuth(silent = true) {
    return checkAuth(this, silent);
  }

  getUserInfo() {
    return getUserInfo(this);
  }

  getUserId() {
    return getUserId(this);
  }

  async handleAuthSuccess(response) {
    return handleAuthSuccess(this, response);
  }

  async signIn() {
    return signIn(this);
  }

  signOut() {
    signOut(this);
  }

  async findSaveFile() {
    return findSaveFile(this);
  }

  async load() {
    return load(this);
  }

  async save(saveData, immediate = false) {
    return save(this, saveData, immediate);
  }

  async _performSave(saveData) {
    return performSave(this, saveData);
  }

  async uploadLocalSave(saveDataString) {
    return uploadLocalSave(this, saveDataString);
  }

  async canUploadLocalSave() {
    return canUploadLocalSave(this);
  }

  async offerLocalSaveUpload() {
    return offerLocalSaveUpload(this);
  }

  async flushPendingSave() {
    return flushPendingSave(this);
  }

  async testBasicFileOperations() {
    return testBasicFileOperations(this);
  }

  async deleteSave() {
    return deleteSave(this);
  }
}

function getStableRedirectUri() {
  if (typeof window === 'undefined' || !window.location) return '';
  const basePath = getBasePath();
  return window.location.origin + (basePath || '/');
}

export class SupabaseAuth {
  constructor() {
    this.token = null;
    this.user = null;
    this.expiresAt = 0;
    this.refreshToken = null;
    this.init();
  }

  init() {
    const session = StorageUtils.get('supabase_auth_session');
    if (session) {
      try {
        if (session.expires_at > Date.now()) {
          this.token = session.access_token;
          this.user = session.user;
          this.expiresAt = session.expires_at;
          this.refreshToken = session.refresh_token;
        } else if (session.refresh_token) {
          this.refreshToken = session.refresh_token;
          this.user = session.user;
          this.refreshAccessToken();
        } else {
          this.signOut();
        }
      } catch {
        this.signOut();
      }
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !getSupabaseAnonKey()) {
      return false;
    }

    try {
      const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      });

      const data = await response.json();

      if (response.ok && data.access_token) {
        this.setSession(data);
        return true;
      } else {
        this.signOut();
        return false;
      }
    } catch (error) {
      this.signOut();
      return false;
    }
  }

  async signUp(email, password) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Sign up failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Sign up failed' };
    }
  }

  async signInWithPassword(email, password) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Sign in failed');
      }

      this.setSession(data);
      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Sign in failed' };
    }
  }

  async resetPasswordForEmail(email) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          email: email,
          redirect_to: `${getStableRedirectUri()}?type=recovery`
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Password reset failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Password reset failed' };
    }
  }

  async updatePassword(newPassword) {
    try {
      if (!this.token) {
        throw new Error('Not authenticated');
      }

      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey(),
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          password: newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Password update failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Password update failed' };
    }
  }

  async handleEmailConfirmation(tokenHash, type) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          token_hash: tokenHash,
          type: type
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Verification failed');
      }

      if (data.access_token) {
        this.setSession(data);
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Verification failed' };
    }
  }

  setSession(data) {
    this.token = data.access_token;
    this.refreshToken = data.refresh_token;
    this.user = data.user || { id: data.user_id, email: data.email };
    this.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

    StorageUtils.set('supabase_auth_session', {
      access_token: this.token,
      refresh_token: this.refreshToken,
      user: this.user,
      expires_at: this.expiresAt
    });
  }

  signOut() {
    this.token = null;
    this.user = null;
    this.expiresAt = 0;
    this.refreshToken = null;
    StorageUtils.remove('supabase_auth_session');
  }

  isSignedIn() {
    if (this.token && this.expiresAt > Date.now()) {
      return true;
    }
    if (this.refreshToken && this.expiresAt <= Date.now()) {
      this.refreshAccessToken();
      return !!this.token && this.expiresAt > Date.now();
    }
    return false;
  }

  getUser() {
    return this.user;
  }

  getUserId() {
    return this.user ? this.user.id : null;
  }
}

const LeaderboardEntrySchema = z.object({
  user_id: z.string(),
  run_id: z.string().optional(),
  heat: z.number().optional().default(0),
  power: z.number().optional().default(0),
  money: z.number().optional().default(0),
  time: z.number().optional(),
  layout: z.string().nullable().optional(),
  timestamp: z.union([z.number(), z.string()]).optional()
}).passthrough();

const LeaderboardResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(LeaderboardEntrySchema).optional().default([])
}).passthrough();

function getLeaderboardApiUrl() {
  return 'https://reactor-revival.onrender.com';
}

export const LEADERBOARD_CONFIG = { get API_URL() { return getLeaderboardApiUrl(); } };

export class SupabaseSave {
  constructor() {
    this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
  }

  async saveGame(slotId, saveData) {
    if (!window.supabaseAuth?.isSignedIn()) throw new Error("Not signed in");

    const userId = window.supabaseAuth.getUserId();
    const token = window.supabaseAuth.token;
    const payload = {
      user_id: userId,
      slot_id: slotId,
      save_data: serializeSave(saveData),
      timestamp: Date.now()
    };

    const response = await fetch(`${this.apiBaseUrl}/api/saves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Failed to save to cloud");
    return await response.json();
  }

  async getSaves() {
    if (!window.supabaseAuth?.isSignedIn()) return [];

    const userId = window.supabaseAuth.getUserId();
    const token = window.supabaseAuth.token;
    const response = await fetch(`${this.apiBaseUrl}/api/saves/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error("Failed to fetch saves");
    const json = await response.json();
    return json.success ? json.data : [];
  }
}

export const supabaseSave = new SupabaseSave();

export class LeaderboardService {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
    this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
    this.lastSaveTime = 0;
    this.saveCooldownMs = 60000;
    this.pendingSave = null;
    this.disabled = isTestEnv();
  }

  async _performSaveRun(stats) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/leaderboard/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: stats.user_id,
          run_id: stats.run_id,
          heat: stats.heat,
          power: stats.power,
          money: stats.money,
          time: stats.time,
          layout: stats.layout || null
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.log('error', 'game', 'Error saving run to leaderboard:', errorData.error || response.statusText);
      } else {
        this.lastSaveTime = Date.now();
      }
    } catch (e) {
      logger.log('error', 'game', 'Error saving run to leaderboard', e);
    } finally {
      this.pendingSave = null;
    }
  }

  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    if (this.disabled) {
      this.initialized = true;
      return;
    }

    this.initPromise = (async () => {
      try {
        const response = await fetch(`${this.apiBaseUrl}/health`);
        if (response.ok) {
          this.initialized = true;
        } else {
          logger.log('warn', 'game', 'Leaderboard API health check failed');
        }
      } catch (e) {
        const errorMsg = e.message || String(e);
        logger.log('debug', 'game', 'Leaderboard service unavailable:', errorMsg);
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async saveRun(stats) {
    if (this.disabled) return;
    if (!this.initialized) {
      await this.init();
    }

    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;

    if (timeSinceLastSave < this.saveCooldownMs) {
      return;
    }

    if (this.pendingSave) {
      return;
    }

    this.pendingSave = this._performSaveRun(stats);

    return this.pendingSave;
  }

  async getTopRuns(sortBy = 'power', limit = 10) {
    if (this.disabled) return [];
    if (!this.initialized) await this.init();

    const validSorts = ['heat', 'power', 'money', 'timestamp'];
    const safeSort = validSorts.includes(sortBy) ? sortBy : 'power';

    return queryClient.fetchQuery({
      queryKey: queryKeys.leaderboard(safeSort, limit),
      queryFn: async () => {
        try {
          const response = await fetch(
            `${this.apiBaseUrl}/api/leaderboard/top?sortBy=${safeSort}&limit=${limit}`
          );
          if (!response.ok) {
            logger.log('error', 'game', 'Error getting top runs:', response.statusText);
            return [];
          }
          const data = await response.json();
          const parsed = LeaderboardResponseSchema.safeParse(data);
          if (!parsed.success) {
            logger.log('warn', 'game', 'Invalid leaderboard data format');
            return [];
          }
          return parsed.data.success ? parsed.data.data : [];
        } catch (e) {
          logger.log('debug', 'game', 'Leaderboard fetch failed (503/CORS/network):', e?.message || e);
          return [];
        }
      },
      staleTime: 60 * 1000,
      retry: 2,
    });
  }
}

export const leaderboardService = new LeaderboardService();
