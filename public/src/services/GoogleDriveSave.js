import {
  GOOGLE_DRIVE_CONFIG,
  ENABLE_GOOGLE_DRIVE,
} from "./google-drive-config.js";

/**
 * Google Drive Save Integration
 * Simplified version focusing on core functionality
 */
export class GoogleDriveSave {
  constructor() {
    this.enabled = ENABLE_GOOGLE_DRIVE;
    this.isSignedIn = false;
    this.authToken = null;
    this.saveFileId = null;
    this.lastSaveTime = 0;
    this.pendingSaveData = null;
    this.saveTimeoutId = null;
    this.config = null;

    // Restore save file ID from localStorage if available
    const storedSaveFileId = localStorage.getItem("google_drive_save_file_id");
    if (storedSaveFileId) {
      this.saveFileId = storedSaveFileId;
    }

    if (this.enabled) {
      this.init();
    }
  }

  /**
   * Check if Google Drive is properly configured
   * @returns {boolean} - True if configured
   */
  isConfigured() {
    try {
      if (!this.config) {
        this.config = GOOGLE_DRIVE_CONFIG;
      }
      return !!(this.config && this.config.CLIENT_ID && this.config.API_KEY);
    } catch (error) {
      console.error("Error checking configuration:", error);
      return false;
    }
  }

  /**
   * Initialize Google Drive integration
   */
  async init() {
    if (!this.isConfigured()) {
      console.log("Google Drive not configured - skipping initialization");
      return false;
    }

    try {
      console.log("Starting Google Drive initialization...");
      await this.loadGapiScripts();
      await this.checkAuth(true);
      console.log("Google Drive Save module initialized successfully.");
      return true;
    } catch (error) {
      console.error("Google Drive initialization failed:", error);
      return false;
    }
  }

  /**
   * Load required Google API scripts
   */
  async loadGapiScripts() {
    // Load Google Identity Services
    if (!window.google?.accounts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Load GAPI
    if (!window.gapi) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Initialize GAPI client
    await new Promise((resolve, reject) => {
      gapi.load("client", async () => {
        try {
          await gapi.client.init({ apiKey: this.config.API_KEY });
          await gapi.client.load("drive", "v3");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    // Initialize OAuth
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.config.CLIENT_ID,
      scope:
        "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
      callback: (response) => {
        if (response.access_token) {
          this.handleAuthSuccess(response);
        }
      },
    });
  }

  /**
   * Check authentication status without triggering sign-in popup
   * @param {boolean} silent - Whether to perform silent check
   * @returns {Promise<boolean>} - True if signed in
   */
  async checkAuth(silent = true) {
    if (!this.isConfigured()) {
      console.log("Google Drive not configured");
      return false;
    }

    try {
      // First, try to restore token from localStorage if we don't have one
      if (!this.authToken) {
        const storedTokenData = localStorage.getItem("google_drive_auth_token");
        if (storedTokenData) {
          try {
            const tokenData = JSON.parse(storedTokenData);
            // Check if token hasn't expired (with 5-minute buffer)
            if (
              tokenData.expires_at &&
              tokenData.expires_at > Date.now() + 300000
            ) {
              this.authToken = tokenData.access_token;
              console.log("Restored auth token from localStorage");
            } else {
              console.log("Stored token expired, removing from localStorage");
              localStorage.removeItem("google_drive_auth_token");
            }
          } catch (error) {
            console.log("Invalid stored token data, removing");
            localStorage.removeItem("google_drive_auth_token");
          }
        }
      }

      // If we have a token (restored or existing), verify it's still valid
      if (this.authToken) {
        const response = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          {
            headers: { Authorization: `Bearer ${this.authToken}` },
          }
        );

        if (response.ok) {
          this.isSignedIn = true;
          console.log("Auth token validated successfully");
          return true;
        } else {
          // Token is invalid, clear it from memory and localStorage
          console.log("Auth token invalid, clearing stored credentials");
          this.authToken = null;
          this.isSignedIn = false;
          localStorage.removeItem("google_drive_auth_token");
        }
      }

      // Check if gapi is available and try silent auth
      if (window.gapi && window.gapi.auth2) {
        const authInstance = window.gapi.auth2.getAuthInstance();
        if (authInstance && authInstance.isSignedIn.get()) {
          const user = authInstance.currentUser.get();
          this.authToken = user.getAuthResponse().access_token;
          this.isSignedIn = true;
          console.log("Silent auth successful");
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking auth status:", error);
      return false;
    }
  }

  /**
   * Handle successful authentication
   */
  handleAuthSuccess(response) {
    const tokenData = {
      access_token: response.access_token,
      expires_at: Date.now() + response.expires_in * 1000,
    };

    localStorage.setItem("google_drive_auth_token", JSON.stringify(tokenData));
    this.authToken = response.access_token;
    this.isSignedIn = true;

    console.log("Google Drive sign-in successful.");
  }

  /**
   * Sign in to Google Drive
   */
  async signIn() {
    if (!this.tokenClient) {
      throw new Error("Google Drive not initialized");
    }

    return new Promise((resolve, reject) => {
      this.tokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          this.handleAuthSuccess(response);
          resolve();
        }
      };

      this.tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  /**
   * Sign out of Google Drive
   */
  signOut() {
    if (this.authToken) {
      google.accounts.oauth2.revoke(this.authToken);
    }

    localStorage.removeItem("google_drive_auth_token");
    localStorage.removeItem("google_drive_save_file_id");
    this.isSignedIn = false;
    this.authToken = null;
    this.saveFileId = null;

    console.log("User signed out from Google Drive.");
  }

  /**
   * Find existing save file
   */
  async findSaveFile() {
    if (!this.isSignedIn) return false;

    try {
      console.log("[DEBUG] Searching for save file...");

      // Search for reactor revival save files by name (simpler approach)
      const searchQuery = encodeURIComponent(
        "name contains 'reactor-revival-save'"
      );
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name,modifiedTime,parents)&orderBy=modifiedTime desc`,
        {
          headers: { Authorization: `Bearer ${this.authToken}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("[DEBUG] Search response:", data);

        if (data.files && data.files.length > 0) {
          // Use most recent file (already sorted by modifiedTime desc)
          const mostRecent = data.files[0];
          this.saveFileId = mostRecent.id;
          localStorage.setItem("google_drive_save_file_id", mostRecent.id);
          console.log("[DEBUG] Found save file:", mostRecent.id);
          return true;
        } else {
          console.log("[DEBUG] No save files found");
        }
      } else {
        console.error(
          "[DEBUG] Search failed:",
          response.status,
          await response.text()
        );
      }

      // Check cached file ID
      if (this.saveFileId) {
        console.log("[DEBUG] Checking cached file ID:", this.saveFileId);
        const verifyResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${this.saveFileId}?fields=id,name,parents`,
          { headers: { Authorization: `Bearer ${this.authToken}` } }
        );

        if (verifyResponse.ok) {
          const fileData = await verifyResponse.json();
          console.log("[DEBUG] Cached file still exists:", fileData);
          return true;
        } else {
          console.log("[DEBUG] Cached file no longer exists");
          this.saveFileId = null;
          localStorage.removeItem("google_drive_save_file_id");
        }
      }

      console.log("[DEBUG] No save file found anywhere");
      return false;
    } catch (error) {
      console.error("Error finding save file:", error);
      return false;
    }
  }

  /**
   * Load game data from Google Drive
   */
  async load() {
    if (!this.isSignedIn || !this.saveFileId) {
      throw new Error("No save file available");
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${this.saveFileId}?alt=media`,
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );

      if (!response.ok) {
        throw new Error(`Failed to download save file: ${response.status}`);
      }

      const encryptedData = await response.arrayBuffer();
      const saveData = await this.decompressAndDecrypt(encryptedData);

      console.log("Game loaded from Google Drive");
      return saveData;
    } catch (error) {
      console.error("Failed to load from Google Drive:", error);
      throw error;
    }
  }

  /**
   * Save game data to Google Drive
   */
  async save(saveData, immediate = false) {
    if (!this.isSignedIn) {
      throw new Error("Not signed in to Google Drive");
    }

    // Throttle saves unless immediate
    if (!immediate) {
      this.pendingSaveData = saveData;
      if (this.saveTimeoutId) {
        clearTimeout(this.saveTimeoutId);
      }
      this.saveTimeoutId = setTimeout(() => {
        if (this.pendingSaveData) {
          const data = this.pendingSaveData;
          this.pendingSaveData = null;
          this._performSave(data);
        }
      }, 2000);
      return true;
    }

    return await this._performSave(saveData);
  }

  /**
   * Perform the actual save operation
   */
  async _performSave(saveData) {
    try {
      const encryptedBlob = await this.compressAndEncrypt(saveData);
      let response;

      if (this.saveFileId) {
        // Update existing file
        response = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${this.saveFileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${this.authToken}`,
              "Content-Type": "application/zip",
            },
            body: encryptedBlob,
          }
        );
      } else {
        // Create new file with descriptive name
        const timestamp = new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/:/g, "-");
        const fileName = `reactor-revival-save-${timestamp}.zip`;

        console.log("[DEBUG] Creating new file:", fileName);

        const metadata = {
          name: fileName,
          description: "Reactor Revival game save (encrypted)",
        };

        const metadataResponse = await fetch(
          "https://www.googleapis.com/drive/v3/files",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metadata),
          }
        );

        if (!metadataResponse.ok) {
          throw new Error(`File creation failed: ${metadataResponse.status}`);
        }

        const fileMetadata = await metadataResponse.json();
        console.log("[DEBUG] File created:", fileMetadata);

        // Upload file content
        console.log("[DEBUG] Uploading content to file ID:", fileMetadata.id);

        response = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileMetadata.id}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${this.authToken}`,
              "Content-Type": "application/zip",
            },
            body: encryptedBlob,
          }
        );

        console.log("[DEBUG] Upload response status:", response.status);
      }

      if (!response.ok) {
        if (response.status === 404 && this.saveFileId) {
          // File was deleted, create new one
          this.saveFileId = null;
          return await this._performSave(saveData);
        }
        throw new Error(`Save failed: ${response.status}`);
      }

      const result = await response.json();
      console.log("[DEBUG] Upload result:", result);

      this.saveFileId = result.id;
      localStorage.setItem("google_drive_save_file_id", result.id);

      console.log("Game saved to Google Drive:", result.id);

      // Verify the file can be found
      console.log("[DEBUG] Verifying uploaded file can be found...");
      setTimeout(async () => {
        try {
          const found = await this.findSaveFile();
          console.log(
            "[DEBUG] Post-upload search verification:",
            found ? "SUCCESS" : "FAILED"
          );
        } catch (error) {
          console.error("[DEBUG] Post-upload verification error:", error);
        }
      }, 1000);

      return true;
    } catch (error) {
      console.error("Save failed:", error);
      throw error;
    }
  }

  /**
   * Upload local save to cloud
   */
  async uploadLocalSave(saveDataString) {
    if (!this.isSignedIn) {
      throw new Error("User is not signed in to Google Drive");
    }
    console.log("Uploading local save to Google Drive...");

    const success = await this._performSave(saveDataString);

    if (success) {
      console.log("Local save uploaded to cloud successfully");
      // Mark the local save as synced
      try {
        const localSave = JSON.parse(saveDataString);
        localSave.isCloudSynced = true;
        localSave.cloudUploadedAt = new Date().toISOString();
        localStorage.setItem("reactorGameSave", JSON.stringify(localSave));
      } catch (e) {
        console.error("Failed to mark local save as synced after upload.", e);
      }
    }
    return success;
  }

  async canUploadLocalSave() {
    if (!this.isSignedIn) {
      return { showUpload: false };
    }
    const localSaveJSON = localStorage.getItem("reactorGameSave");
    if (!localSaveJSON) {
      return { showUpload: false };
    }
    try {
      const localSave = JSON.parse(localSaveJSON);
      if (localSave.isCloudSynced) {
        return { showUpload: false };
      }
      // Check if a cloud save already exists. If so, we shouldn't offer an upload.
      const hasCloudSave = await this.findSaveFile();
      if (hasCloudSave) {
        return { showUpload: false };
      }
      return { showUpload: true, gameState: localSave };
    } catch (e) {
      console.error("Error checking if local save can be uploaded:", e);
      return { showUpload: false };
    }
  }

  /**
   * Check if local save should be offered for upload
   */
  async offerLocalSaveUpload() {
    if (!this.isSignedIn) return { hasLocalSave: false };

    const localSave = localStorage.getItem("reactorGameSave");
    if (!localSave) return { hasLocalSave: false };

    try {
      const gameState = JSON.parse(localSave);
      const saveSize = `${(localSave.length / 1024).toFixed(1)}KB`;

      // Check if there's already a cloud save (regardless of local sync status)
      const hasCloudSave = await this.findSaveFile();
      if (hasCloudSave) {
        console.log("[DEBUG] Cloud save already exists, not offering upload");
        return { hasLocalSave: false }; // Cloud save exists
      }

      // Check if already synced
      if (gameState.isCloudSynced) {
        console.log(
          "[DEBUG] Local save marked as synced but no cloud save found, clearing sync flags"
        );
        // Orphaned local save - clear sync flags
        delete gameState.isCloudSynced;
        delete gameState.cloudUploadedAt;
        localStorage.setItem("reactorGameSave", JSON.stringify(gameState));
      }

      console.log("[DEBUG] Local save can be uploaded");
      return {
        hasLocalSave: true,
        gameState: gameState,
        saveSize: saveSize,
      };
    } catch (error) {
      console.error("Error checking local save:", error);
      return { hasLocalSave: false };
    }
  }

  /**
   * Compress and encrypt save data
   */
  async compressAndEncrypt(saveData) {
    await this.loadZipLibrary();

    if (!window.zip) {
      throw new Error("zip.js library failed to load");
    }

    const password = "reactor-revival-secure-save-2024";
    const zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"), {
      password: password,
      zipCrypto: true,
    });

    await zipWriter.add("save.json", new zip.TextReader(saveData));
    const encryptedBlob = await zipWriter.close();

    console.log(
      `Save data compressed and encrypted: ${saveData.length} → ${encryptedBlob.size} bytes`
    );
    return encryptedBlob;
  }

  /**
   * Decrypt and decompress save data
   */
  async decompressAndDecrypt(encryptedData) {
    await this.loadZipLibrary();

    if (!window.zip) {
      throw new Error("zip.js library failed to load");
    }

    try {
      const blob = new Blob([encryptedData], { type: "application/zip" });
      const zipReader = new zip.ZipReader(new zip.BlobReader(blob));

      const password = "reactor-revival-secure-save-2024";
      const entries = await zipReader.getEntries({ password });

      if (entries.length > 0) {
        const writer = new zip.TextWriter();
        const jsonText = await entries[0].getData(writer, { password });
        await zipReader.close();
        return JSON.parse(jsonText);
      } else {
        await zipReader.close();
        throw new Error("No data found in save file.");
      }
    } catch (error) {
      console.error("Decryption/Decompression failed:", error);
      // Fallback for old save format for compatibility
      if (error.message.includes("password")) {
        console.log("Password decryption failed, trying old format...");
        return this.decompressAndDecryptLegacy(encryptedData);
      }
      throw error;
    }
  }

  /**
   * Decrypt and decompress save data from old XOR format
   */
  async decompressAndDecryptLegacy(encryptedData) {
    if (!(encryptedData instanceof ArrayBuffer)) {
      throw new Error("Encrypted data must be an ArrayBuffer.");
    }

    const key = "a_very_secure_key";
    const encryptedBytes = new Uint8Array(encryptedData);
    const decryptedBytes = new Uint8Array(encryptedBytes.length);

    // Apply XOR decryption
    for (let i = 0; i < encryptedBytes.length; i++) {
      decryptedBytes[i] = encryptedBytes[i] ^ key.charCodeAt(i % key.length);
    }

    // Decompress the decrypted data
    if (typeof pako === "undefined") {
      throw new Error("pako is not defined");
    }
    const decompressedData = pako.inflate(decryptedBytes, { to: "string" });
    return JSON.parse(decompressedData);
  }

  /**
   * Load zip.js library for encryption
   */
  async loadZipLibrary() {
    // Libraries are now loaded in HTML head, just verify they're available
    if (typeof pako === "undefined") {
      throw new Error(
        "pako library not loaded. Check that lib/pako.min.js is included in HTML."
      );
    }

    if (typeof window.zip === "undefined") {
      throw new Error(
        "zip.js library not loaded. Check that lib/zip.min.js is included in HTML."
      );
    }

    // Configure zip.js to not use web workers for better compatibility
    if (window.zip) {
      zip.configure({ useWebWorkers: false });
    }
  }

  async flushPendingSave() {
    if (this.pendingSaveData && this.isSignedIn) {
      const dataToSave = this.pendingSaveData;
      this.pendingSaveData = null;
      if (this.saveTimeoutId) {
        clearTimeout(this.saveTimeoutId);
        this.saveTimeoutId = null;
      }
      console.log("Flushing pending Google Drive save...");
      return await this._performSave(dataToSave);
    }
    return true;
  }

  async testBasicFileOperations() {
    console.log("Testing basic Google Drive operations...");

    try {
      if (!this.isSignedIn) {
        console.log("Not signed in - test skipped");
        return false;
      }

      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?pageSize=1",
        {
          headers: { Authorization: `Bearer ${this.authToken}` },
        }
      );

      if (response.ok) {
        console.log("Basic operations test passed");
        return true;
      } else {
        console.log("Basic operations test failed:", response.status);
        return false;
      }
    } catch (error) {
      console.error("Basic operations test error:", error);
      return false;
    }
  }

  async deleteSave() {
    if (!this.isSignedIn || !this.saveFileId) {
      throw new Error("No save file to delete");
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${this.saveFileId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${this.authToken}` },
        }
      );

      if (response.ok) {
        console.log("Save file deleted from Google Drive");
        this.saveFileId = null;
        return true;
      } else {
        throw new Error(`Failed to delete save file: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to delete save file:", error);
      throw error;
    }
  }
}
