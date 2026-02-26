import { StorageUtilsAsync } from "../utils/util.js";
import { queryClient, queryKeys } from "./queryClient.js";
import { createSupabaseProvider, createGoogleDriveProvider } from "./cloudSaveProvider.js";
import { supabaseSave } from "./SupabaseSave.js";
import { deserializeSave } from "../utils/util.js";

function getCloudSaveProvider() {
  if (typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.()) {
    return createSupabaseProvider(supabaseSave);
  }
  if (typeof window !== "undefined" && window.googleDriveSave?.isSignedIn) {
    return createGoogleDriveProvider(window.googleDriveSave);
  }
  return null;
}

async function fetchResolvedSavesFn() {
  let hasSave = false;
  const saveSlots = [];
  let maxLocalTime = 0;
  let dataJSON = null;

  for (let i = 1; i <= 3; i++) {
    const slotData = await StorageUtilsAsync.get(`reactorGameSave_${i}`);
    if (slotData && typeof slotData === "object") {
      try {
        saveSlots.push({
          slot: i,
          exists: true,
          lastSaveTime: slotData.last_save_time || null,
          totalPlayedTime: slotData.total_played_time || 0,
          currentMoney: slotData.current_money || 0,
          exoticParticles: slotData.exotic_particles || 0,
          data: slotData,
        });
        hasSave = true;
        const t = slotData.last_save_time || 0;
        if (t > maxLocalTime) {
          maxLocalTime = t;
          dataJSON = await StorageUtilsAsync.getRaw(`reactorGameSave_${i}`);
        }
      } catch (_) {}
    }
  }

  if (!hasSave) {
    const oldSaveData = await StorageUtilsAsync.get("reactorGameSave");
    if (oldSaveData && typeof oldSaveData === "object") {
      try {
        saveSlots.push({
          slot: "legacy",
          exists: true,
          lastSaveTime: oldSaveData.last_save_time || null,
          totalPlayedTime: oldSaveData.total_played_time || 0,
          currentMoney: oldSaveData.current_money || 0,
          exoticParticles: oldSaveData.exotic_particles || 0,
          data: oldSaveData,
        });
        hasSave = true;
        const t = oldSaveData.last_save_time || 0;
        if (t > maxLocalTime) {
          maxLocalTime = t;
          dataJSON = await StorageUtilsAsync.getRaw("reactorGameSave");
        }
      } catch (_) {}
    }
  }

  let cloudSaveOnly = false;
  let cloudSaveData = null;
  if (!hasSave && window.googleDriveSave?.isConfigured) {
    try {
      const isSignedIn = await window.googleDriveSave.checkAuth(true);
      if (isSignedIn) {
        const fileFound = await window.googleDriveSave.findSaveFile();
        if (fileFound) {
          cloudSaveOnly = true;
          try {
            cloudSaveData = await window.googleDriveSave.load();
          } catch {
            cloudSaveData = null;
          }
        }
      }
    } catch (_) {}
  }

  let mostRecentSave = null;
  let mostRecentTime = 0;
  for (const saveSlot of saveSlots) {
    if (saveSlot.lastSaveTime && saveSlot.lastSaveTime > mostRecentTime) {
      mostRecentTime = saveSlot.lastSaveTime;
      mostRecentSave = saveSlot;
    }
  }

  return {
    hasSave,
    saveSlots,
    cloudSaveOnly,
    cloudSaveData,
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
      exoticParticles: data.exotic_particles || 0,
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
