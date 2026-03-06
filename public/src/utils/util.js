import Decimal from "./decimal.js";
import { formatDuration, formatRelativeTime } from "./formatUtils.js";
import { serializeSave as superjsonStringify, parseSave as superjsonParse } from "../config/superjsonSetup.js";
import { StorageAdapter } from "./storageAdapter.js";

export { StorageAdapter };

const GAME_SAVE_KEYS = new Set([
  "reactorGameSave",
  "reactorGameSave_1",
  "reactorGameSave_2",
  "reactorGameSave_3",
  "reactorGameSave_Previous",
  "reactorGameSave_Backup",
]);

export function serializeSave(obj) {
  return superjsonStringify(obj);
}

export function deserializeSave(raw) {
  if (typeof raw !== "string") return raw;
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && "json" in parsed && "meta" in parsed) {
    return superjsonParse(raw);
  }
  return parsed;
}

export { Formatter, Formatter as Format, numFormat, formatStatNum } from "./formatUtils.js";
export const timeFormat = (ms) => formatDuration(ms, false);
export { formatTime, formatPlaytimeLog } from "./formatUtils.js";

export const on = (parentElement, selector, eventType, handler) => {
    if (!parentElement) return;
    parentElement.addEventListener(eventType, (event) => {
        const targetElement = event.target.closest(selector);
        if (targetElement && parentElement.contains(targetElement)) {
            handler.call(targetElement, event);
        }
    });
};

export const performance = (typeof window !== 'undefined' && window.performance) || { now: () => new Date().getTime() };

export function isTestEnv() {
    return (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
        (typeof global !== 'undefined' && global.__VITEST__) ||
        (typeof window !== 'undefined' && window.__VITEST__);
}

/**
 * Get the correct base path for GitHub Pages deployment
 * Must stay in sync with src-sw.js getBasePath (SW uses self.location, this uses window.location)
 * @returns {string} The base path for the current deployment
 */
export function getBasePath() {
    // In Node.js test environment, return empty string
    if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
        return '';
    }

    try {
        // Check if we're on GitHub Pages
        const isGitHubPages = window.location.hostname && window.location.hostname.includes('github.io');

        if (isGitHubPages && window.location.pathname) {
            // Extract repository name from path
            const pathParts = window.location.pathname.split('/');
            const repoName = pathParts.length > 1 && pathParts[1] ? pathParts[1] : '';
            return repoName ? `/${repoName}` : '';
        }
    } catch (_) {
        // Ignore errors in environment detection
    }

    // For local development or other deployments
    return '';
}

/**
 * Get the correct URL for a resource, accounting for GitHub Pages base path
 * @param {string} resourcePath - The path to the resource (e.g., 'version.json', '/css/main.css')
 * @returns {string} The full URL to the resource
 */
export function getResourceUrl(resourcePath) {
    const basePath = getBasePath();

    // Ensure resourcePath starts with / if it's an absolute path
    if (resourcePath.startsWith('/')) {
        return `${basePath}${resourcePath}`;
    } else {
        // For relative paths, ensure we have the correct base path
        return `${basePath}/${resourcePath}`;
    }
}

let storageAvailable = null;

function isStorageAvailable() {
    if (storageAvailable !== null) return storageAvailable;
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        storageAvailable = true;
    } catch (e) {
        storageAvailable = false;
    }
    return storageAvailable;
}

function saveDataReplacer(_key, value) {
    if (typeof value === "bigint") return value.toString();
    if (value != null && typeof value === "object" && value instanceof Decimal) return value.toString();
    return value;
}

export const StorageUtils = {
    get(key, defaultValue = null) {
        if (!isStorageAvailable()) return defaultValue;
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return defaultValue;
            try {
                return GAME_SAVE_KEYS.has(key) ? deserializeSave(raw) : JSON.parse(raw);
            } catch (_) {
                return raw;
            }
        } catch (e) {
            return defaultValue;
        }
    },
    set(key, value) {
        if (!isStorageAvailable()) return false;
        try {
            const str = typeof value === "object" && value !== null
                ? JSON.stringify(value, saveDataReplacer)
                : JSON.stringify(value);
            localStorage.setItem(key, str);
            return true;
        } catch (e) {
            return false;
        }
    },
    remove(key) {
        if (!isStorageAvailable()) return false;
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    },
    getRaw(key, defaultValue = null) {
        if (!isStorageAvailable()) return defaultValue;
        try {
            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },
    setRaw(key, value) {
        if (!isStorageAvailable()) return false;
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    },
    serialize(obj, space) {
        return JSON.stringify(obj, saveDataReplacer, space ?? undefined);
    }
};

const SAVE_SLOT1_KEY = "reactorGameSave_1";
const SAVE_PREVIOUS_KEY = "reactorGameSave_Previous";
const SAVE_BACKUP_KEY = "reactorGameSave_Backup";

const MIGRATION_KEYS = [
    "reactorGameSave",
    "reactorGameSave_1",
    "reactorGameSave_2",
    "reactorGameSave_3",
    "reactorGameSave_Previous",
    "reactorGameSave_Backup",
    "reactorCurrentSaveSlot"
];

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
    } catch (_) {}
}

export function rotateSlot1ToBackup(value) {
    if (!isStorageAvailable()) return false;
    try {
        const current = StorageUtils.getRaw(SAVE_SLOT1_KEY);
        const previous = StorageUtils.getRaw(SAVE_PREVIOUS_KEY);
        if (previous != null) StorageUtils.setRaw(SAVE_BACKUP_KEY, previous);
        if (current != null) StorageUtils.setRaw(SAVE_PREVIOUS_KEY, current);
        StorageUtils.setRaw(SAVE_SLOT1_KEY, value);
        return true;
    } catch (e) {
        return false;
    }
}

export function getBackupSaveForSlot1() {
    return StorageUtils.getRaw(SAVE_BACKUP_KEY);
}

export function setSlot1FromBackup() {
    const backup = StorageUtils.getRaw(SAVE_BACKUP_KEY);
    if (backup == null) return false;
    StorageUtils.setRaw(SAVE_SLOT1_KEY, backup);
    return true;
}

export const StorageUtilsAsync = {
    async get(key, defaultValue = null) {
        const result = await StorageAdapter.get(key);
        return result ?? defaultValue;
    },
    async set(key, value) {
        await StorageAdapter.set(key, value);
    },
    async remove(key) {
        await StorageAdapter.remove(key);
    },
    async getRaw(key, defaultValue = null) {
        return await StorageAdapter.getRaw(key, defaultValue);
    },
    async setRaw(key, value) {
        await StorageAdapter.setRaw(key, value);
    },
};

export async function rotateSlot1ToBackupAsync(value) {
    try {
        const current = await StorageAdapter.getRaw(SAVE_SLOT1_KEY);
        const previous = await StorageAdapter.getRaw(SAVE_PREVIOUS_KEY);
        if (previous != null) await StorageAdapter.setRaw(SAVE_BACKUP_KEY, previous);
        if (current != null) await StorageAdapter.setRaw(SAVE_PREVIOUS_KEY, current);
        await StorageAdapter.setRaw(SAVE_SLOT1_KEY, value);
        return true;
    } catch (_) {
        return false;
    }
}

export async function getBackupSaveForSlot1Async() {
    return await StorageAdapter.getRaw(SAVE_BACKUP_KEY);
}

export async function setSlot1FromBackupAsync() {
    const backup = await StorageAdapter.getRaw(SAVE_BACKUP_KEY);
    if (backup == null) return false;
    await StorageAdapter.setRaw(SAVE_SLOT1_KEY, backup);
    return true;
}

export const formatDateTime = formatRelativeTime;
