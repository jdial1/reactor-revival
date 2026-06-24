import { subscribe, proxy } from "valtio/vanilla";
import { UserPreferencesSchema } from "../schema/index.js";
import { StorageUtils, STORAGE_KEYS } from "../storage/index.js";

const PREF_STORAGE_MAP = {
  mute: STORAGE_KEYS.MUTE,
  reducedMotion: STORAGE_KEYS.REDUCED_MOTION,
  heatFlowVisible: "reactor_heat_flow_visible",
  heatMapVisible: "reactor_heat_map_visible",
  debugOverlay: "reactor_debug_overlay",
  forceNoSAB: "reactor_force_no_sab",
  numberFormat: "number_format",
  volumeMaster: "reactor_volume_master",
  volumeEffects: "reactor_volume_effects",
  volumeAlerts: "reactor_volume_alerts",
  volumeSystem: "reactor_volume_system",
  volumeAmbience: "reactor_volume_ambience",
  hideUnaffordableUpgrades: "reactor_hide_unaffordable_upgrades",
  hideUnaffordableResearch: "reactor_hide_unaffordable_research",
  hideMaxUpgrades: "reactor_hide_max_upgrades",
  hideMaxResearch: "reactor_hide_max_research",
};

const PREF_DEFAULTS = UserPreferencesSchema.parse({});

function hydrateFromStorage() {
  const raw = {};
  for (const [schemaKey, storageKey] of Object.entries(PREF_STORAGE_MAP)) {
    const val = StorageUtils.get(storageKey);
    if (val !== null && val !== undefined) raw[schemaKey] = val;
  }
  const result = UserPreferencesSchema.safeParse(raw);
  return result.success ? result.data : UserPreferencesSchema.parse({});
}

export const preferences = proxy({ ...PREF_DEFAULTS });

export function syncReducedMotionDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.style || !root?.classList) return;
  const checked = !!preferences.reducedMotion;
  root.style.setProperty("--prefers-reduced-motion", checked ? "reduce" : "no-preference");
  root.classList.toggle("reduced-motion-app", checked);
}

export function initPreferencesStore() {
  const hydrated = hydrateFromStorage();
  Object.keys(PREF_DEFAULTS).forEach((k) => {
    if (hydrated[k] !== undefined) preferences[k] = hydrated[k];
  });
  syncReducedMotionDOM();
  subscribe(preferences, () => {
    syncReducedMotionDOM();
    Object.entries(PREF_STORAGE_MAP).forEach(([schemaKey, storageKey]) => {
      const val = preferences[schemaKey];
      if (val !== undefined) StorageUtils.set(storageKey, val);
    });
  });
}

export function getAffordabilitySettings() {
  return {
    hideUpgrades: preferences.hideUnaffordableUpgrades === true,
    hideResearch: preferences.hideUnaffordableResearch === true,
    hideMaxUpgrades: preferences.hideMaxUpgrades !== false,
    hideMaxResearch: preferences.hideMaxResearch !== false,
  };
}

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
