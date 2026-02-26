import { proxy, subscribe } from "valtio/vanilla";
import { StorageUtils } from "../utils/util.js";
import { UserPreferencesSchema } from "./schemas.js";

const PREF_STORAGE_MAP = {
  mute: "reactor_mute",
  reducedMotion: "reactor_reduced_motion",
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
  hideOtherDoctrineUpgrades: "reactor_hide_other_doctrine_upgrades",
};

const DEFAULTS = UserPreferencesSchema.parse({});

function hydrateFromStorage() {
  const raw = {};
  for (const [schemaKey, storageKey] of Object.entries(PREF_STORAGE_MAP)) {
    const val = StorageUtils.get(storageKey);
    if (val !== null && val !== undefined) raw[schemaKey] = val;
  }
  const result = UserPreferencesSchema.safeParse(raw);
  return result.success ? result.data : UserPreferencesSchema.parse({});
}

export const preferences = proxy({ ...DEFAULTS });

export function initPreferencesStore() {
  const hydrated = hydrateFromStorage();
  Object.keys(DEFAULTS).forEach((k) => {
    if (hydrated[k] !== undefined) preferences[k] = hydrated[k];
  });
  subscribe(preferences, () => {
    Object.entries(PREF_STORAGE_MAP).forEach(([schemaKey, storageKey]) => {
      const val = preferences[schemaKey];
      if (val !== undefined) StorageUtils.set(storageKey, val);
    });
  });
}

export function getAffordabilitySettings() {
  return {
    hideUpgrades: preferences.hideUnaffordableUpgrades !== false,
    hideResearch: preferences.hideUnaffordableResearch !== false,
    hideMaxUpgrades: preferences.hideMaxUpgrades !== false,
    hideMaxResearch: preferences.hideMaxResearch !== false,
    hideOtherDoctrine: preferences.hideOtherDoctrineUpgrades === true,
  };
}
