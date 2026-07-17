import { SaveDataSchema, SaveDataWriteSchema } from "../schema/index.js";
import { queryClient, queryKeys } from "../services-leaderboard.js";
import {
  StorageAdapter,
  serializeSave,
  rotateSlot1ToBackup,
  AUTOSAVE_SLOT_KEY,
  STORAGE_KEYS,
} from "../storage/index.js";
import { logger } from "../core/logger.js";

const LOCAL_SLOTS = [1, 2, 3];

async function performSave(slot, saveData) {
  const forDisk = { ...saveData };
  if (forDisk.tiles_compact?.encoding && Array.isArray(forDisk.part_table) && forDisk.part_table.length > 0) {
    forDisk.tiles = [];
  }
  const validatedData = SaveDataWriteSchema.parse(forDisk);
  const saveKey = slot === "auto" ? AUTOSAVE_SLOT_KEY : `${STORAGE_KEYS.GAME_SAVE}_${slot}`;
  await StorageAdapter.set(saveKey, validatedData);
  if (slot === 1) {
    await rotateSlot1ToBackup(serializeSave(validatedData));
  }
  if (slot !== "auto") {
    await StorageAdapter.set(STORAGE_KEYS.CURRENT_SLOT, slot);
  }
  return slot;
}

export async function saveGameMutation({ slot, saveData, getNextSaveSlot, isAutoSave = false }) {
  if (typeof indexedDB === "undefined") return null;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return null;

  const effectiveSlot = isAutoSave ? "auto" : (slot ?? (await getNextSaveSlot()));
  await performSave(effectiveSlot, saveData);
  queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
  return effectiveSlot;
}

async function fetchLocalSlotData(slotId) {
  try {
    const slotData = await StorageAdapter.get(`${STORAGE_KEYS.GAME_SAVE}_${slotId}`, SaveDataSchema);
    if (!slotData) return null;
    return {
      slot: slotId,
      exists: true,
      lastSaveTime: slotData.last_save_time || null,
      totalPlayedTime: slotData.total_played_time || 0,
      currentMoney: slotData.current_money || 0,
      exoticParticles: slotData.exotic_particles ?? slotData.total_exotic_particles ?? 0,
      data: slotData,
      isAutoSave: false,
    };
  } catch (error) {
    logger.log("warn", "saves", `Failed to fetch local slot ${slotId}`, error);
    return null;
  }
}

async function fetchAutoSaveSlotData() {
  try {
    const slotData = await StorageAdapter.get(AUTOSAVE_SLOT_KEY, SaveDataSchema);
    if (!slotData) return null;
    return {
      slot: "auto",
      exists: true,
      lastSaveTime: slotData.last_save_time || null,
      totalPlayedTime: slotData.total_played_time || 0,
      currentMoney: slotData.current_money || 0,
      exoticParticles: slotData.exotic_particles ?? slotData.total_exotic_particles ?? 0,
      data: slotData,
      isAutoSave: true,
    };
  } catch (error) {
    logger.log("warn", "saves", "Failed to fetch autosave buffer", error);
    return null;
  }
}

async function fetchLegacySlotData() {
  try {
    const oldSaveData = await StorageAdapter.get(STORAGE_KEYS.GAME_SAVE, SaveDataSchema);
    if (!oldSaveData) return null;
    return {
      slot: "legacy",
      exists: true,
      lastSaveTime: oldSaveData.last_save_time || null,
      totalPlayedTime: oldSaveData.total_played_time || 0,
      currentMoney: oldSaveData.current_money || 0,
      exoticParticles: oldSaveData.exotic_particles ?? oldSaveData.total_exotic_particles ?? 0,
      data: oldSaveData,
      isAutoSave: false,
    };
  } catch (error) {
    logger.log("warn", "saves", "Failed to fetch legacy save", error);
    return null;
  }
}

async function fetchResolvedSavesFn() {
  const slotPromises = LOCAL_SLOTS.map(fetchLocalSlotData);
  const results = await Promise.all(slotPromises);
  const saveSlots = results.filter(Boolean);
  const autoSave = await fetchAutoSaveSlotData();

  if (saveSlots.length === 0) {
    const legacy = await fetchLegacySlotData();
    if (legacy) saveSlots.push(legacy);
  }

  const hasSave = saveSlots.length > 0 || !!autoSave;
  let maxLocalTime = 0;
  let mostRecentSlot = null;

  for (const slot of saveSlots) {
    const t = slot.lastSaveTime || 0;
    if (t > maxLocalTime) {
      maxLocalTime = t;
      mostRecentSlot = slot;
    }
  }
  if (autoSave && (autoSave.lastSaveTime || 0) > maxLocalTime) {
    mostRecentSlot = autoSave;
  }

  let dataJSON = null;
  if (mostRecentSlot) {
    if (mostRecentSlot.slot === "legacy") {
      dataJSON = await StorageAdapter.getRaw(STORAGE_KEYS.GAME_SAVE);
    } else if (mostRecentSlot.slot === "auto") {
      dataJSON = await StorageAdapter.getRaw(AUTOSAVE_SLOT_KEY);
    } else {
      dataJSON = await StorageAdapter.getRaw(`${STORAGE_KEYS.GAME_SAVE}_${mostRecentSlot.slot}`);
    }
  }

  let mostRecentSave = null;
  let recentTime = 0;
  for (const saveSlot of saveSlots) {
    if (saveSlot.lastSaveTime && saveSlot.lastSaveTime > recentTime) {
      recentTime = saveSlot.lastSaveTime;
      mostRecentSave = saveSlot;
    }
  }
  if (autoSave && (autoSave.lastSaveTime || 0) > recentTime) {
    mostRecentSave = autoSave;
  }

  return {
    hasSave,
    saveSlots,
    autoSave,
    cloudSaveOnly: false,
    cloudSaveData: null,
    mostRecentSave,
    maxLocalTime: Math.max(maxLocalTime, autoSave?.lastSaveTime || 0),
    dataJSON,
  };
}

export function fetchResolvedSaves() {
  return queryClient.fetchQuery({
    queryKey: queryKeys.saves.resolved(),
    queryFn: fetchResolvedSavesFn,
    staleTime: 10 * 1000,
  });
}

export { fetchAutoSaveSlotData };
