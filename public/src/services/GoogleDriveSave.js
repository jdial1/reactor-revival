import { GOOGLE_DRIVE_CONFIG } from "./appConfig.js";
import { StorageUtils } from "../utils/util.js";
import {
  restoreAuthToken,
  restoreUserInfo,
  isConfigured,
  loadGapiScripts,
  checkAuth,
  handleAuthSuccess,
  getUserInfo,
  getUserId,
  signOut,
  signIn,
} from "./googleDrive/googleDriveAuth.js";
import {
  findSaveFile,
  load as loadFile,
  performSave,
  save as saveFile,
  uploadLocalSave as uploadLocalSaveFile,
  canUploadLocalSave as canUploadLocalSaveFile,
  offerLocalSaveUpload as offerLocalSaveUploadFile,
  flushPendingSave as flushPendingSaveFile,
  testBasicFileOperations,
  deleteSave as deleteSaveFile,
} from "./googleDrive/googleDriveFileOps.js";

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
    return loadFile(this);
  }

  async save(saveData, immediate = false) {
    return saveFile(this, saveData, immediate);
  }

  async _performSave(saveData) {
    return performSave(this, saveData);
  }

  async uploadLocalSave(saveDataString) {
    return uploadLocalSaveFile(this, saveDataString);
  }

  async canUploadLocalSave() {
    return canUploadLocalSaveFile(this);
  }

  async offerLocalSaveUpload() {
    return offerLocalSaveUploadFile(this);
  }

  async flushPendingSave() {
    return flushPendingSaveFile(this);
  }

  async testBasicFileOperations() {
    return testBasicFileOperations(this);
  }

  async deleteSave() {
    return deleteSaveFile(this);
  }
}
