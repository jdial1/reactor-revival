import { StorageAdapter, deserializeSave } from "../utils/util.js";
import { queryClient, queryKeys } from "./queryClient.js";
import { supabaseSave } from "./SupabaseSave.js";
import { SaveDataSchema } from "../core/schemas.js";
import { logger } from "../utils/logger.js";

const LOCAL_SLOTS = [1, 2, 3];

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

async function fetchCloudSaveData() {
  if (typeof window === "undefined" || !window.googleDriveSave?.isConfigured) {
    return { cloudSaveOnly: false, cloudSaveData: null };
  }

  try {
    const isSignedIn = await window.googleDriveSave.checkAuth(true);
    if (!isSignedIn) return { cloudSaveOnly: false, cloudSaveData: null };

    const fileFound = await window.googleDriveSave.findSaveFile();
    if (!fileFound) return { cloudSaveOnly: false, cloudSaveData: null };

    try {
      const cloudSaveData = await window.googleDriveSave.load();
      return { cloudSaveOnly: true, cloudSaveData };
    } catch (error) {
      logger.log("warn", "saves", "Failed to load found cloud save", error);
      return { cloudSaveOnly: true, cloudSaveData: null };
    }
  } catch (error) {
    logger.log("warn", "saves", "Error checking cloud auth", error);
    return { cloudSaveOnly: false, cloudSaveData: null };
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

  let cloudInfo = { cloudSaveOnly: false, cloudSaveData: null };
  if (!hasSave) {
    cloudInfo = await fetchCloudSaveData();
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
    cloudSaveOnly: cloudInfo.cloudSaveOnly,
    cloudSaveData: cloudInfo.cloudSaveData,
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

async function fetchCloudSaveSlotsFn() {
  if (!window.supabaseAuth?.isSignedIn?.()) return [];
  const rawCloudSaves = await supabaseSave.getSaves();
  return rawCloudSaves.map((s) => {
    let data = {};
    try {
      data = deserializeSave(s.save_data);
    } catch (_) {}
    return {
      slot: s.slot_id,
      exists: true,
      lastSaveTime: parseInt(s.timestamp),
      totalPlayedTime: data.total_played_time || 0,
      currentMoney: data.current_money || 0,
      exoticParticles: data.exotic_particles ?? data.total_exotic_particles ?? 0,
      data,
      isCloud: true,
    };
  });
}

export function fetchCloudSaveSlots() {
  return queryClient.fetchQuery({
    queryKey: queryKeys.saves.cloud("supabase"),
    queryFn: fetchCloudSaveSlotsFn,
    staleTime: 10 * 1000,
  });
}
