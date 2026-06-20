import { MutationObserver } from "@tanstack/query-core";
import { SaveDataSchema, SaveDataWriteSchema } from "../schema/index.js";
import { queryClient, queryKeys } from "../services-query.js";
import {
  StorageAdapter,
  serializeSave,
  rotateSlot1ToBackup,
  logger,
  formatDuration,
  formatStatNum,
} from "../utils.js";

const LOCAL_SLOTS = [1, 2, 3];

async function performSave(slot, saveData) {
  const forDisk = { ...saveData };
  if (forDisk.tiles_compact?.encoding && Array.isArray(forDisk.part_table) && forDisk.part_table.length > 0) {
    forDisk.tiles = [];
  }
  const validatedData = SaveDataWriteSchema.parse(forDisk);
  const saveKey = `reactorGameSave_${slot}`;
  await StorageAdapter.set(saveKey, validatedData);
  if (slot === 1) {
    await rotateSlot1ToBackup(serializeSave(validatedData));
  }
  await StorageAdapter.set("reactorCurrentSaveSlot", slot);
  return slot;
}

export function createSaveMutation() {
  return new MutationObserver(queryClient, {
    mutationFn: async ({ slot, saveData }) => performSave(slot, saveData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
    },
    onError: (error) => {
      logger.log("error", "game", "Save mutation failed:", error);
    },
  });
}

export async function saveGameMutation({ slot, saveData, getNextSaveSlot }) {
  if (typeof indexedDB === "undefined") return null;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return null;

  const effectiveSlot = slot ?? (await getNextSaveSlot());
  await performSave(effectiveSlot, saveData);
  queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
  return effectiveSlot;
}

async function fetchLocalSlotData(slotId) {
  try {
    const slotData = await StorageAdapter.get(`reactorGameSave_${slotId}`, SaveDataSchema);
    if (!slotData) return null;
    return {
      slot: slotId,
      exists: true,
      lastSaveTime: slotData.last_save_time || null,
      totalPlayedTime: slotData.total_played_time || 0,
      currentMoney: slotData.current_money || 0,
      exoticParticles: slotData.exotic_particles ?? slotData.total_exotic_particles ?? 0,
      data: slotData,
    };
  } catch (error) {
    logger.log("warn", "saves", `Failed to fetch local slot ${slotId}`, error);
    return null;
  }
}

async function fetchLegacySlotData() {
  try {
    const oldSaveData = await StorageAdapter.get("reactorGameSave", SaveDataSchema);
    if (!oldSaveData) return null;
    return {
      slot: "legacy",
      exists: true,
      lastSaveTime: oldSaveData.last_save_time || null,
      totalPlayedTime: oldSaveData.total_played_time || 0,
      currentMoney: oldSaveData.current_money || 0,
      exoticParticles: oldSaveData.exotic_particles ?? oldSaveData.total_exotic_particles ?? 0,
      data: oldSaveData,
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

  if (saveSlots.length === 0) {
    const legacy = await fetchLegacySlotData();
    if (legacy) saveSlots.push(legacy);
  }

  const hasSave = saveSlots.length > 0;
  let maxLocalTime = 0;
  let mostRecentSlot = null;

  for (const slot of saveSlots) {
    const t = slot.lastSaveTime || 0;
    if (t > maxLocalTime) {
      maxLocalTime = t;
      mostRecentSlot = slot;
    }
  }

  let dataJSON = null;
  if (mostRecentSlot) {
    const key = mostRecentSlot.slot === "legacy" ? "reactorGameSave" : `reactorGameSave_${mostRecentSlot.slot}`;
    dataJSON = await StorageAdapter.getRaw(key);
  }

  let mostRecentSave = null;
  let recentTime = 0;
  for (const saveSlot of saveSlots) {
    if (saveSlot.lastSaveTime && saveSlot.lastSaveTime > recentTime) {
      recentTime = saveSlot.lastSaveTime;
      mostRecentSave = saveSlot;
    }
  }

  return {
    hasSave,
    saveSlots,
    cloudSaveOnly: false,
    cloudSaveData: null,
    mostRecentSave,
    maxLocalTime,
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

export function getSaveStats(data) {
  if (!data || typeof data !== "object") {
    return { money: "0", ep: "0", playtime: "0", timestamp: "Unknown" };
  }
  const money = data.current_money != null ? formatStatNum(data.current_money) : "0";
  const ep =
    data.exotic_particles != null
      ? formatStatNum(data.exotic_particles)
      : data.total_exotic_particles != null
        ? formatStatNum(data.total_exotic_particles)
        : "0";
  const playtime = data.total_played_time != null ? formatDuration(data.total_played_time, false) : "0";
  const ts = data.last_save_time;
  const timestamp = ts ? new Date(Number(ts)).toLocaleString() : "Unknown";
  return { money, ep, playtime, timestamp };
}
