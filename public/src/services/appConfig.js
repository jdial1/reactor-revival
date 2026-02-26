import { StorageUtils } from "../utils/util.js";
import { preferences } from "../core/preferencesStore.js";
const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const winConfig = typeof window !== "undefined" && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {};

export const USER_PREF_KEYS = {
  mute: "reactor_mute",
  reducedMotion: "reactor_reduced_motion",
  heatFlowVisible: "reactor_heat_flow_visible",
  heatMapVisible: "reactor_heat_map_visible",
  debugOverlay: "reactor_debug_overlay",
  forceNoSAB: "reactor_force_no_sab",
  numberFormat: "number_format",
};

export function getValidatedPreferences() {
  return { ...preferences };
}

export function getVolumePreferences() {
  const prefs = getValidatedPreferences();
  return {
    mute: prefs.mute,
    master: prefs.volumeMaster,
    effects: prefs.volumeEffects,
    alerts: prefs.volumeAlerts,
    system: prefs.volumeSystem,
    ambience: prefs.volumeAmbience,
  };
}

export function getPref(key) { return StorageUtils.get(key); }
export function setPref(key, value) { StorageUtils.set(key, value); }

export function getSupabaseUrl() {
  return env.VITE_SUPABASE_URL ?? winConfig.supabaseUrl ?? "";
}

export function getSupabaseAnonKey() {
  return env.VITE_SUPABASE_ANON_KEY ?? winConfig.supabaseAnonKey ?? "";
}

export function getGoogleDriveApiKey() {
  return env.VITE_GOOGLE_DRIVE_API_KEY ?? winConfig.googleDriveApiKey ?? "";
}

export function getGoogleDriveClientId() {
  return env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? winConfig.googleDriveClientId ?? "";
}

export const GOOGLE_DRIVE_CONFIG = {
  SCOPES: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
  FALLBACK_SCOPES: "https://www.googleapis.com/auth/drive.file",
  ENABLE_GOOGLE_DRIVE: true
};

export function getGoogleDriveAuth() {
  return {
    API_KEY: getGoogleDriveApiKey(),
    CLIENT_ID: getGoogleDriveClientId(),
    ...GOOGLE_DRIVE_CONFIG
  };
}
