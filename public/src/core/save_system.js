import { fromError } from "zod-validation-error";
import { MutationObserver } from "@tanstack/query-core";
import { html, render } from "lit-html";
import { logger, StorageAdapter, deserializeSave, getBackupSaveForSlot1Async, StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync, formatDuration, formatStatNum } from "../utils/utils_constants.js";
import { queryClient, queryKeys } from "../services/dataService.js";
import { SaveDataSchema } from "../utils/utils_constants.js";
import { setDecimal } from "./store.js";
import { leaderboardService } from "../services/services_cloud.js";
import { supabaseSave } from "../services/services_cloud.js";

const LOCAL_SLOTS = [1, 2, 3];
const PENDING_SYNC_KEY = "reactor_pending_cloud_sync";
export function parseAndValidateSave(raw) {
  const parsed = typeof raw === "string" ? deserializeSave(raw) : raw;
  const result = SaveDataSchema.safeParse(parsed);
  if (!result.success) {
    logger.log("error", "game", "Save validation failed:", fromError(result.error).toString());
    throw new Error("Save corrupted: validation failed");
  }
  return result.data;
}

function applyCoreGameState(game, savedData) {
  setDecimal(game.state, "current_money", savedData.current_money);
  game.run_id = savedData.run_id;
  game.tech_tree = savedData.tech_tree ?? null;
  game.peak_power = savedData.reactor?.current_power != null ? savedData.reactor.current_power.toNumber() : 0;
  game.peak_heat = savedData.reactor?.current_heat != null ? savedData.reactor.current_heat.toNumber() : 0;
  game.base_rows = savedData.base_rows;
  game.base_cols = savedData.base_cols;
  game.protium_particles = savedData.protium_particles;
  setDecimal(game.state, "total_exotic_particles", savedData.total_exotic_particles);
  const epRaw = savedData.current_exotic_particles ?? savedData.exotic_particles;
  game.exoticParticleManager.exotic_particles = epRaw;
  setDecimal(game.state, "current_exotic_particles", epRaw);
  setDecimal(game.state, "reality_flux", savedData.reality_flux);
  game.emit?.("exoticParticlesChanged", {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    reality_flux: game.state.reality_flux,
  });
  if (savedData.rows != null) game.gridManager.setRows(savedData.rows);
  if (savedData.cols != null) game.gridManager.setCols(savedData.cols);
  if (savedData.rows != null && game.rows !== savedData.rows) {
    game.gridManager.setRows(savedData.rows);
  }
  if (savedData.cols != null && game.cols !== savedData.cols) {
    game.gridManager.setCols(savedData.cols);
  }
  game.sold_power = savedData.sold_power;
  game.sold_heat = savedData.sold_heat;
  game.grace_period_ticks = savedData.grace_period_ticks ?? (game._isRestoringSave ? 30 : 0);
}

function applySessionMetadata(game, savedData) {
  game.lifecycleManager.total_played_time = savedData.total_played_time;
  game.lifecycleManager.last_save_time = savedData.last_save_time ?? null;
  game.lifecycleManager.session_start_time = null;
  game.placedCounts = savedData.placedCounts ?? game.placedCounts ?? {};
}

function applyReactorState(game, savedData) {
  if (!savedData.reactor) return;
  game.reactor.current_heat = savedData.reactor.current_heat;
  game.reactor.current_power = savedData.reactor.current_power;
  game.reactor.has_melted_down = savedData.reactor.has_melted_down ?? false;
  if (savedData.reactor.base_max_heat != null) game.reactor.base_max_heat = savedData.reactor.base_max_heat;
  if (savedData.reactor.base_max_power != null) game.reactor.base_max_power = savedData.reactor.base_max_power;
  if (savedData.reactor.altered_max_heat != null) game.reactor.altered_max_heat = savedData.reactor.altered_max_heat;
  if (savedData.reactor.altered_max_power != null) game.reactor.altered_max_power = savedData.reactor.altered_max_power;
  game.emit?.("meltdownStateChanged");
}

async function applyUpgrades(game, savedData) {
  game.upgradeset.reset();
  await game.upgradeset.initialize();
  if (savedData.upgrades) {
    savedData.upgrades.forEach((upgData) => {
      const upgrade = game.upgradeset.getUpgrade(upgData.id);
      if (upgrade) upgrade.setLevel(upgData.level);
    });
  }
  if (game.upgradeset && game.tech_tree) game.upgradeset.sanitizeDoctrineUpgradeLevelsOnLoad(game.tech_tree);
  game.reactor.updateStats();
}

async function restoreTiles(game, savedData) {
  if (!game.tileset.initialized) game.tileset.initialize();
  game.tileset.clearAllTiles();
  const tiles = savedData.tiles ?? [];
  const prevSuppress = game._suppressPlacementCounting;
  game._suppressPlacementCounting = true;
  await Promise.all(
    tiles.map(async (tileData) => {
      const tile = game.tileset.getTile(tileData.row, tileData.col);
      const part = game.partset.getPartById(tileData.partId);
      if (tile && part) {
        await tile.setPart(part);
        tile.ticks = tileData.ticks;
        tile.heat_contained = tileData.heat_contained;
      }
    })
  );
  game._suppressPlacementCounting = prevSuppress;
  const placedCounts = savedData.placedCounts ?? {};
  if (Object.keys(placedCounts).length === 0) {
    for (const tile of game.tileset.tiles_list) {
      if (tile.part) {
        const key = `${tile.part.type}:${tile.part.level}`;
        game.placedCounts[key] = (game.placedCounts[key] || 0) + 1;
      }
    }
  }
  game.reactor.updateStats();
}

function parseObjectiveIndex(v) {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : Math.floor(Number(v));
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function clampObjectiveIndex(game, savedData, savedIndex) {
  const rawNum = typeof savedIndex === "string" ? parseInt(savedIndex, 10) : Number(savedIndex);
  if (savedIndex != null && !Number.isNaN(rawNum) && rawNum < 0) {
    console.warn(`Negative objective index ${savedIndex}. Clamping to 0.`);
    return 0;
  }
  let idx = parseObjectiveIndex(savedIndex);
  if (!game.objectives_manager?.objectives_data?.length) return idx;
  const objectivesData = game.objectives_manager.objectives_data;
  const lastDef = objectivesData[objectivesData.length - 1];
  const maxValidIndex =
    lastDef && lastDef.checkId === "allObjectives" ? objectivesData.length - 2 : objectivesData.length - 1;
  if (idx < 0) return 0;
  if (idx > maxValidIndex) {
    logger.log(
      "warn",
      "game",
      `Objective index ${savedIndex} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`
    );
    return maxValidIndex;
  }
  return idx;
}

function applyInfiniteObjective(game, savedData) {
  const inf = savedData.objectives.infinite_objective;
  if (!inf || !game.objectives_manager) return;
  game.objectives_manager.infiniteObjective = {
    title: inf.title,
    checkId: inf.checkId,
    target: inf.target,
    reward: inf.reward,
    completed: !!inf.completed,
  };
  if (inf._lastInfinitePowerTarget != null) game.objectives_manager._lastInfinitePowerTarget = inf._lastInfinitePowerTarget;
  if (inf._lastInfiniteHeatMaintain != null) game.objectives_manager._lastInfiniteHeatMaintain = inf._lastInfiniteHeatMaintain;
  if (inf._lastInfiniteMoneyThorium != null) game.objectives_manager._lastInfiniteMoneyThorium = inf._lastInfiniteMoneyThorium;
  if (inf._lastInfiniteHeat != null) game.objectives_manager._lastInfiniteHeat = inf._lastInfiniteHeat;
  if (inf._lastInfiniteEP != null) game.objectives_manager._lastInfiniteEP = inf._lastInfiniteEP;
  if (inf._infiniteChallengeIndex != null) game.objectives_manager._infiniteChallengeIndex = inf._infiniteChallengeIndex;
  if (inf._infiniteCompletedCount != null) game.objectives_manager._infiniteCompletedCount = inf._infiniteCompletedCount;
}

function applyObjectives(game, savedData) {
  if (!savedData.objectives) return;
  const savedIndex = clampObjectiveIndex(game, savedData, savedData.objectives.current_objective_index);
  applyInfiniteObjective(game, savedData);
  const om = game.objectives_manager;
  if (savedData.objectives.completed_objectives?.length && om?.objectives_data) {
    savedData.objectives.completed_objectives.forEach((completed, index) => {
      if (om.objectives_data[index]) om.objectives_data[index].completed = completed;
    });
  }
  if (om) om.current_objective_index = savedIndex;
  game._saved_objective_index = savedIndex;
  if (om?.set_objective && om.objectives_data?.length) {
    om.set_objective(savedIndex, true);
    if (om.checkForChapterCompletion) om.checkForChapterCompletion();
  }
}

function applyUIState(game, savedData) {
  const toggles = savedData.toggles ?? {};
  game._pendingToggleStates = toggles;
  if (game.onToggleStateChange) {
    Object.entries(toggles).forEach(([key, value]) => game.onToggleStateChange(key, value));
  }
  game.emit?.("saveLoaded", {
    toggles,
    quick_select_slots: savedData.quick_select_slots,
  });
  game.reactor.updateStats();
}

const SYNC_HYDRATORS = [applyCoreGameState, applySessionMetadata, applyReactorState];
const ASYNC_HYDRATORS = [applyUpgrades, restoreTiles];
const POST_ASYNC_HYDRATORS = [applyObjectives, applyUIState];

export async function applySaveState(game, savedData) {
  if (!savedData || typeof savedData !== "object") {
    throw new Error("Save corrupted: invalid save data structure");
  }
  for (const fn of SYNC_HYDRATORS) fn(game, savedData);
  if (!game.partset.initialized) await game.partset.initialize();
  for (const fn of ASYNC_HYDRATORS) await fn(game, savedData);
  for (const fn of POST_ASYNC_HYDRATORS) fn(game, savedData);
}

function getCloudSaveProvider() {
  if (typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.()) {
    return createSupabaseProvider(supabaseSave);
  }
  if (typeof window !== "undefined" && window.googleDriveSave?.isSignedIn) {
    return createGoogleDriveProvider(window.googleDriveSave);
  }
  return null;
}

export function createSupabaseProvider(supabaseSaveInstance) {
  return {
    async getSaves() {
      return supabaseSaveInstance.getSaves();
    },
    async saveGame(slotId, saveData) {
      return supabaseSaveInstance.saveGame(slotId, saveData);
    },
    isSignedIn() {
      return typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.() === true;
    },
  };
}

export function createGoogleDriveProvider(googleDriveSaveInstance) {
  const DEFAULT_SLOT = 1;
  return {
    async getSaves() {
      if (!googleDriveSaveInstance?.isSignedIn) return [];
      try {
        const data = await googleDriveSaveInstance.load();
        if (!data) return [];
        return [{ slot_id: DEFAULT_SLOT, save_data: data, timestamp: Date.now() }];
      } catch {
        return [];
      }
    },
    async saveGame(slotId, saveData) {
      if (slotId !== DEFAULT_SLOT) return;
      await googleDriveSaveInstance.save(saveData, true);
    },
    isSignedIn() {
      return googleDriveSaveInstance?.isSignedIn === true;
    },
  };
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
    mutationFn: async ({ slot, saveData }) => performSave(slot, saveData, provider),
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
      const deserialized = deserializeSave(s.save_data);
      const parsed = SaveDataSchema.safeParse(deserialized);
      if (parsed.success) data = parsed.data;
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

function cloudConflictTemplate(cloud, local, onUseCloud, onUseLocal, onCancel) {
  return html`
    <div class="bios-overlay-content" style="max-width: 480px;">
      <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Cloud vs Local save</h2>
      <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 0.75rem;">Choose which save to use:</p>
      <div class="cloud-local-comparison" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; font-size: 0.65rem; margin-bottom: 1rem;">
        <span style="color: rgb(150 160 240); font-weight: bold;">Cloud</span>
        <span style="color: rgb(150 200 150); font-weight: bold;">Local</span>
        <span>$${cloud.money}</span>
        <span>$${local.money}</span>
        <span>${cloud.ep} EP</span>
        <span>${local.ep} EP</span>
        <span>${cloud.playtime}</span>
        <span>${local.playtime}</span>
        <span>${cloud.timestamp}</span>
        <span>${local.timestamp}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="button" class="splash-btn splash-btn-load" @click=${onUseCloud}>Use Cloud save</button>
        <button type="button" class="splash-btn" @click=${onUseLocal}>Keep Local save</button>
        <button type="button" class="splash-btn splash-btn-exit" @click=${onCancel}>Cancel</button>
      </div>
    </div>
  `;
}

function backupModalTemplate(onLoad, onCancel) {
  return html`
    <div class="bios-overlay-content" style="max-width: 420px;">
      <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Save file corrupted</h2>
      <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 1rem;">The current save could not be read. Load from backup?</p>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="button" class="splash-btn" @click=${onLoad}>Load backup</button>
        <button type="button" class="splash-btn splash-btn-exit" @click=${onCancel}>Cancel</button>
      </div>
    </div>
  `;
}

async function parseLocalSaveData() {
  const { dataJSON } = await fetchResolvedSaves();
  if (!dataJSON) return null;
  try {
    return deserializeSave(dataJSON);
  } catch (_) {
    return null;
  }
}

export async function showCloudVsLocalConflictModal(cloudSaveData) {
  const cloud = getSaveStats(cloudSaveData);
  const local = getSaveStats(await parseLocalSaveData());
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    const content = document.createElement("div");
    overlay.appendChild(content);
    render(
      cloudConflictTemplate(
        cloud,
        local,
        () => resolveAndClose("cloud"),
        () => resolveAndClose("local"),
        () => resolveAndClose("cancel")
      ),
      content
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose("cancel");
    });
    document.body.appendChild(overlay);
  });
}

export function showLoadBackupModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const content = document.createElement("div");
    overlay.appendChild(content);
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    render(
      backupModalTemplate(() => resolveAndClose(true), () => resolveAndClose(false)),
      content
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose(false);
    });
    document.body.appendChild(overlay);
  });
}

export class GameSaveManager {
  constructor(saveOrchestrator, getPersistenceContext) {
    this.saveOrchestrator = saveOrchestrator;
    this.getPersistenceContext = getPersistenceContext;
  }

  async getSaveState() {
    return await this.saveOrchestrator.getSaveState();
  }

  async saveToSlot(slot) {
    const effectiveSlot = slot ?? (await this.getNextSaveSlot());
    await this._saveGame(effectiveSlot, false);
  }

  async autoSave() {
    await this._saveGame(null, true);
  }

  async _saveGame(slot = null, isAutoSave = false) {
    const ctx = this.getPersistenceContext();
    if (ctx.isSandbox) return;

    logger.log("debug", "game", `Attempting to save game. Meltdown state: ${ctx.hasMeltedDown}`);
    try {
      ctx.debugHistory.add("game", "saveGame called", { slot, isAutoSave, meltdown: ctx.hasMeltedDown });
      if (ctx.hasMeltedDown) {
        if ((ctx.peakPower > 0 || ctx.peakHeat > 0) && !ctx.cheatsUsed) {
          leaderboardService.saveRun({
            user_id: ctx.userId,
            run_id: ctx.runId,
            heat: ctx.peakHeat,
            power: ctx.peakPower,
            money:
              ctx.currentMoney && typeof ctx.currentMoney.toNumber === "function"
                ? ctx.currentMoney.toNumber()
                : Number(ctx.currentMoney),
            time: ctx.totalPlayedTime,
            layout: JSON.stringify(ctx.getCompactLayout()),
          });
        }
        return;
      }

      ctx.updateSessionTime();
      if ((ctx.peakPower > 0 || ctx.peakHeat > 0) && !ctx.cheatsUsed) {
        leaderboardService.saveRun({
          user_id: ctx.userId,
          run_id: ctx.runId,
          heat: ctx.peakHeat,
          power: ctx.peakPower,
          money:
            ctx.currentMoney && typeof ctx.currentMoney.toNumber === "function"
              ? ctx.currentMoney.toNumber()
              : Number(ctx.currentMoney),
          time: ctx.totalPlayedTime,
          layout: JSON.stringify(ctx.getCompactLayout()),
        });
      }

      const saveData = await this.getSaveState();
      const effectiveSlot = await saveGameMutation({
        slot,
        saveData,
        getNextSaveSlot: () => this.getNextSaveSlot(),
      });

      if (effectiveSlot != null) {
        logger.log("debug", "game", `Game state saved to slot ${effectiveSlot}.`);
        ctx.debugHistory.add("game", "Game saved", { slot: effectiveSlot });
      }
    } catch (error) {
      logger.log("error", "game", "Error saving game:", error);
    }
  }

  async getNextSaveSlot() {
    const currentSlot = Number((await StorageAdapter.get("reactorCurrentSaveSlot")) ?? 1);
    return (currentSlot % 3) + 1;
  }

  async getSaveSlotInfo(slot) {
    try {
      const savedData = await StorageAdapter.get(`reactorGameSave_${slot}`, SaveDataSchema);
      if (savedData != null) {
        return {
          exists: true,
          lastSaveTime: savedData.last_save_time || null,
          totalPlayedTime: savedData.total_played_time || 0,
          currentMoney: savedData.current_money || 0,
          exoticParticles: savedData.exotic_particles ?? savedData.total_exotic_particles ?? 0,
          data: savedData,
        };
      }
    } catch (error) {
      logger.log("error", "game", `Error reading save slot ${slot}:`, error);
    }
    return { exists: false };
  }

  async getAllSaveSlots() {
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const slotInfo = await this.getSaveSlotInfo(i);
      slots.push({ slot: i, ...slotInfo });
    }
    return slots;
  }

  async loadGame(slot = null) {
    const ctx = this.getPersistenceContext();
    ctx.debugHistory.add("game", "loadGame called", { slot });

    try {
      let key;
      let rawData;

      if (slot !== null) {
        key = `reactorGameSave_${slot}`;
        rawData = await StorageAdapter.getRaw(key);
      } else {
        const slots = await this.getAllSaveSlots();
        const mostRecent = slots
          .filter((s) => s.exists)
          .sort((a, b) => (b.lastSaveTime || 0) - (a.lastSaveTime || 0))[0];
        if (mostRecent) {
          key = `reactorGameSave_${mostRecent.slot}`;
          rawData = await StorageAdapter.getRaw(key);
        } else {
          key = "reactorGameSave";
          rawData = await StorageAdapter.getRaw(key);
        }
      }

      if (!rawData) {
        if (slot === 1 && (await getBackupSaveForSlot1Async())) {
          return { success: false, parseError: true, backupAvailable: true };
        }
        return false;
      }

      const validatedData = parseAndValidateSave(rawData);
      ctx.debugHistory.add("game", "Applying save data from slot", { slot, version: validatedData.version });
      await ctx.applySaveState(validatedData);
      return true;
    } catch (error) {
      logger.log("error", "game", `Save corrupted or load failed for slot ${slot ?? "default"}:`, error);
      if (slot === 1 && (await getBackupSaveForSlot1Async())) {
        return { success: false, parseError: true, backupAvailable: true };
      }
      return false;
    }
  }

  validateSaveData(data) {
    return parseAndValidateSave(data);
  }
}
