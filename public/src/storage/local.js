import { getDecimal } from "../simUtils.js";
import { superjsonStringify, superjsonParse } from "../core/decimal-proxy.js";

export const STORAGE_KEYS = Object.freeze({
  GAME_SAVE: "reactorGameSave",
  NEW_GAME_PENDING: "reactorNewGamePending",
  QUICK_START_SHOWN: "reactorGameQuickStartShown",
  MUTE: "reactor_mute",
  REDUCED_MOTION: "reactor_reduced_motion",
  CURRENT_SLOT: "reactorCurrentSaveSlot",
});

let storageAvailable = null;
export function isStorageAvailable() {
  if (storageAvailable !== null) return storageAvailable;
  try { const test = '__storage_test__'; localStorage.setItem(test, test); localStorage.removeItem(test); storageAvailable = true; } catch (e) { storageAvailable = false; }
  return storageAvailable;
}

function saveDataReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value != null && typeof value === "object" && value instanceof getDecimal()) return value.toString();
  return value;
}

export const StorageUtils = {
  get(key, defaultValue = null) { if (!isStorageAvailable()) return defaultValue; try { const raw = localStorage.getItem(key); if (raw === null) return defaultValue; try { return deserializeSave(raw); } catch (_) { return raw; } } catch (e) { return defaultValue; } },
  set(key, value) { if (!isStorageAvailable()) return false; try { const str = (typeof value === "object" && value !== null) || typeof value === "bigint" ? superjsonStringify(value) : JSON.stringify(value); localStorage.setItem(key, str); return true; } catch (e) { return false; } },
  remove(key) { if (!isStorageAvailable()) return false; try { localStorage.removeItem(key); return true; } catch (e) { return false; } },
  getRaw(key, defaultValue = null) { if (!isStorageAvailable()) return defaultValue; try { const value = localStorage.getItem(key); return value !== null ? value : defaultValue; } catch (e) { return defaultValue; } },
  setRaw(key, value) { if (!isStorageAvailable()) return false; try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
  serialize(obj, space) { return JSON.stringify(obj, saveDataReplacer, space ?? undefined); },
};

export function serializeSave(obj) { return superjsonStringify(obj); }
export function deserializeSave(raw) {
  if (typeof raw !== "string") return raw;
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && "json" in parsed && "meta" in parsed) return superjsonParse(raw);
  return parsed;
}
