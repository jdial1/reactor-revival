import { get, set, del, clear } from "./idb-keyval.js";
import { fromError } from "../core/zod-error.js";
import { logger } from "../core/logger.js";
import { StorageUtils, isStorageAvailable } from "./local.js";
import { superjsonStringify, superjsonParse } from "../core/decimal-proxy.js";

const isTestEnvStorage = () =>
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof global !== "undefined" && global.__VITEST__) ||
  (typeof window !== "undefined" && window.__VITEST__);

function safeDeserialize(raw) {
  if (typeof raw !== "string") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "json" in parsed && "meta" in parsed) return superjsonParse(raw);
    return parsed;
  } catch { return raw; }
}

export const StorageAdapter = {
  async set(key, value) {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return false;
      const serialized = superjsonStringify(value);
      if (isTestEnvStorage()) {
        if (!isStorageAvailable()) return false;
        localStorage.setItem(key, serialized);
        return true;
      }
      await set(key, serialized);
      return true;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to set key ${key}`, err);
      return false;
    }
  },
  async get(key, schema = null) {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return null;
      let raw;
      if (isTestEnvStorage()) {
        if (!isStorageAvailable()) return null;
        raw = localStorage.getItem(key);
      } else {
        raw = await get(key);
      }
      if (raw == null) return null;
      const parsed = safeDeserialize(raw);
      if (schema) {
        if (parsed == null || typeof parsed !== "object") return null;
        const validation = schema.safeParse(parsed);
        if (!validation.success) {
          logger.log("warn", "StorageAdapter", `Zod Schema validation failed for ${key}`, fromError(validation.error).message);
          return null;
        }
        return validation.data;
      }
      return parsed;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to get key ${key}`, err);
      return null;
    }
  },
  async getRaw(key, defaultValue = null) {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return defaultValue;
      const raw = isTestEnvStorage()
        ? (isStorageAvailable() ? localStorage.getItem(key) : null)
        : await get(key);
      return raw ?? defaultValue;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to get key ${key}`, err);
      return defaultValue;
    }
  },
  async setRaw(key, value) {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return false;
      const str = typeof value === "string" ? value : JSON.stringify(value);
      if (isTestEnvStorage()) {
        if (!isStorageAvailable()) return false;
        localStorage.setItem(key, str);
        return true;
      }
      await set(key, str);
      return true;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to set raw key ${key}`, err);
      return false;
    }
  },
  async remove(key) {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return;
      if (isTestEnvStorage()) {
        if (isStorageAvailable()) localStorage.removeItem(key);
        return;
      }
      await del(key);
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to remove key ${key}`, err);
    }
  },
  async clearAll() {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return;
      if (isTestEnvStorage()) {
        if (isStorageAvailable()) localStorage.clear();
        return;
      }
      await clear();
    } catch (err) {
      logger.log("error", "StorageAdapter", "Failed to clear storage", err);
    }
  },
};

const SAVE_SLOT1_KEY = "reactorGameSave_1";
export const AUTOSAVE_SLOT_KEY = "reactorGameSave_auto";
const SAVE_PREVIOUS_KEY = "reactorGameSave_Previous";
const SAVE_BACKUP_KEY = "reactorGameSave_Backup";
const MIGRATION_KEYS = ["reactorGameSave", "reactorGameSave_1", "reactorGameSave_2", "reactorGameSave_3", "reactorGameSave_auto", "reactorGameSave_Previous", "reactorGameSave_Backup", "reactorCurrentSaveSlot"];

export async function migrateLocalStorageToIndexedDB() {
  if (typeof indexedDB === "undefined" || !isStorageAvailable()) return;
  try {
    for (const key of MIGRATION_KEYS) {
      const fromLS = localStorage.getItem(key);
      if (fromLS === null) continue;
      const fromIDB = await StorageAdapter.getRaw(key);
      if (fromIDB != null) continue;
      await StorageAdapter.setRaw(key, fromLS);
    }
  } catch (err) {
    logger.warn("migrateLocalStorageToIndexedDB failed", err);
  }
}

export function getBackupSaveForSlot1() { return StorageUtils.getRaw(SAVE_BACKUP_KEY); }

export function setSlot1FromBackup() {
  const backup = StorageUtils.getRaw(SAVE_BACKUP_KEY);
  if (backup == null) return false;
  StorageUtils.setRaw(SAVE_SLOT1_KEY, backup);
  return true;
}

export async function rotateSlot1ToBackup(value) {
  try {
    const current = await StorageAdapter.getRaw(SAVE_SLOT1_KEY);
    const previous = await StorageAdapter.getRaw(SAVE_PREVIOUS_KEY);
    if (previous != null) await StorageAdapter.setRaw(SAVE_BACKUP_KEY, previous);
    if (current != null) await StorageAdapter.setRaw(SAVE_PREVIOUS_KEY, current);
    await StorageAdapter.setRaw(SAVE_SLOT1_KEY, value);
    return true;
  } catch (_) { return false; }
}

export async function getBackupSaveForSlot1Async() { return await StorageAdapter.getRaw(SAVE_BACKUP_KEY); }

export async function setSlot1FromBackupAsync() {
  const backup = await StorageAdapter.getRaw(SAVE_BACKUP_KEY);
  if (backup == null) return false;
  await StorageAdapter.setRaw(SAVE_SLOT1_KEY, backup);
  return true;
}

export { serializeSave, deserializeSave } from "./local.js";
