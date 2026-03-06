import { MutationObserver } from "@tanstack/query-core";
import { queryClient, queryKeys } from "./queryClient.js";
import { StorageAdapter } from "../utils/storageAdapter.js";
import { SaveDataSchema } from "../core/schemas.js";
import { logger } from "../utils/logger.js";
import { StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync } from "../utils/util.js";
import { createSupabaseProvider, createGoogleDriveProvider } from "./cloudSaveProvider.js";
import { supabaseSave } from "./SupabaseSave.js";

const PENDING_SYNC_KEY = "reactorPendingCloudSync";

function getCloudSaveProvider() {
  if (typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.()) {
    return createSupabaseProvider(supabaseSave);
  }
  if (typeof window !== "undefined" && window.googleDriveSave?.isSignedIn) {
    return createGoogleDriveProvider(window.googleDriveSave);
  }
  return null;
}

async function pushPendingSync(entry) {
  try {
    const queue = (await StorageUtilsAsync.get(PENDING_SYNC_KEY)) || [];
    queue.push(entry);
    await StorageUtilsAsync.set(PENDING_SYNC_KEY, queue);
  } catch (e) {
    logger.log("error", "game", "Failed to queue cloud sync:", e);
  }
}

async function drainPendingSyncQueue() {
  try {
    const queue = (await StorageUtilsAsync.get(PENDING_SYNC_KEY)) || [];
    if (queue.length === 0) return;
    const provider = getCloudSaveProvider();
    if (!provider?.isSignedIn?.()) return;
    await StorageUtilsAsync.set(PENDING_SYNC_KEY, []);
    for (const { slot, saveData } of queue) {
      try {
        await provider.saveGame(slot, saveData);
      } catch (e) {
        logger.log("error", "game", "Failed to sync queued save to cloud:", e);
        await pushPendingSync({ slot, saveData });
        break;
      }
    }
  } catch (e) {
    logger.log("error", "game", "Failed to drain sync queue:", e);
  }
}

export function initCloudSyncQueue() {
  if (typeof window === "undefined") return;
  const drain = () => drainPendingSyncQueue();
  window.addEventListener("online", drain);
  drain();
}

async function performSave(slot, saveData, cloudProvider) {
  const validatedData = SaveDataSchema.parse(saveData);
  const saveKey = `reactorGameSave_${slot}`;
  await StorageAdapter.set(saveKey, validatedData);
  if (slot === 1) {
    await rotateSlot1ToBackupAsync(serializeSave(validatedData));
  }
  await StorageAdapter.set("reactorCurrentSaveSlot", slot);
  if (cloudProvider?.isSignedIn?.()) {
    try {
      await cloudProvider.saveGame(slot, validatedData);
    } catch (e) {
      logger.log("error", "game", "Cloud save failed, queuing for retry:", e);
      await pushPendingSync({ slot, saveData: validatedData });
    }
  }
  return slot;
}

export function createSaveMutation(cloudProvider = null) {
  const provider = cloudProvider ?? getCloudSaveProvider();
  return new MutationObserver(queryClient, {
    mutationFn: async ({ slot, saveData }) => {
      return performSave(slot, saveData, provider);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.cloud("supabase") });
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
  await performSave(effectiveSlot, saveData, getCloudSaveProvider());
  queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
  queryClient.invalidateQueries({ queryKey: queryKeys.saves.cloud("supabase") });
  return effectiveSlot;
}
