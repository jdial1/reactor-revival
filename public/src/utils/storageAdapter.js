import { get, set, del, clear } from "idb-keyval";
import { prettifyError } from "zod";
import { serializeSave, parseSave } from "../config/superjsonSetup.js";
import { logger } from "./logger.js";

const isTestEnv = () =>
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof global !== "undefined" && global.__VITEST__) ||
  (typeof window !== "undefined" && window.__VITEST__);

export const StorageAdapter = {
  async set(key, value) {
    try {
      if (!isTestEnv() && typeof indexedDB === "undefined") return false;
      await set(key, serializeSave(value));
      return true;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to set key ${key}`, err);
      return false;
    }
  },

  async get(key, schema = null) {
    try {
      if (!isTestEnv() && typeof indexedDB === "undefined") return null;
      const raw = await get(key);
      if (raw == null) return null;

      const parsed = typeof raw === "string" ? parseSave(raw) : raw;

      if (schema) {
        if (parsed == null || typeof parsed !== "object") return null;
        const validation = schema.safeParse(parsed);
        if (!validation.success) {
          logger.log("warn", "StorageAdapter", `Zod Schema validation failed for ${key}`, prettifyError(validation.error));
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
      if (!isTestEnv() && typeof indexedDB === "undefined") return defaultValue;
      const raw = await get(key);
      return raw ?? defaultValue;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to get key ${key}`, err);
      return defaultValue;
    }
  },

  async setRaw(key, value) {
    try {
      if (!isTestEnv() && typeof indexedDB === "undefined") return false;
      await set(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to set raw key ${key}`, err);
      return false;
    }
  },

  async remove(key) {
    try {
      if (!isTestEnv() && typeof indexedDB === "undefined") return;
      await del(key);
    } catch (err) {
      logger.log("error", "StorageAdapter", `Failed to remove key ${key}`, err);
    }
  },

  async clearAll() {
    try {
      if (!isTestEnv() && typeof indexedDB === "undefined") return;
      await clear();
    } catch (err) {
      logger.log("error", "StorageAdapter", "Failed to clear storage", err);
    }
  },
};
