import { StorageUtils, STORAGE_KEYS } from "./local.js";

export const USER_PREF_KEYS = {
  mute: STORAGE_KEYS.MUTE,
  reducedMotion: STORAGE_KEYS.REDUCED_MOTION,
  heatFlowVisible: "reactor_heat_flow_visible",
  heatMapVisible: "reactor_heat_map_visible",
  debugOverlay: "reactor_debug_overlay",
  forceNoSAB: "reactor_force_no_sab",
  numberFormat: "number_format",
};

export function getPref(key) { return StorageUtils.get(key); }
export function setPref(key, value) { return StorageUtils.set(key, value); }
