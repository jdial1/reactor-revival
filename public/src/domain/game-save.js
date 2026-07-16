import { recalculatePlacedCountsFromGrid } from "../bridge/bridge-grid-sync.js";
import { fromError } from "zod-validation-error";
import { leaderboardService } from "../services-leaderboard.js";
import { saveGameMutation, fetchAutoSaveSlotData } from "../state/save-query.js";
import { setDecimal } from "../state/decimal-sync.js";
import { logger } from "../core/logger.js";
import { StorageAdapter, deserializeSave, getBackupSaveForSlot1Async } from "../storage/index.js";
import { SaveDataSchema } from "../schema/index.js";
import { snapshot } from "valtio/vanilla";
import { SAVE_FORMAT_VERSION_LATEST, buildPartTable, encodeTilesCompact, migrateSave } from "../schema/saveMigration.js";
import { unlockedAchievementIds } from "../bridge/core-state-projection.js";

export function parseAndValidateSave(raw) {
  const parsed = typeof raw === "string" ? deserializeSave(raw) : raw;
  const migrated = migrateSave(parsed);
  const result = SaveDataSchema.safeParse(migrated);
  if (!result.success) {
    logger.log("error", "game", "Save validation failed:", fromError(result.error).toString());
    throw new Error("Save corrupted: validation failed");
  }
  return result.data;
}

const LEGACY_TECH_TREE_IDS = new Set(["architect", "physicist", "engineer"]);

export function normalizeSavedTechTreeId(id) {
  if (!id || LEGACY_TECH_TREE_IDS.has(id)) return "unified";
  return id;
}

function applyCoreGameState(game, savedData) {
  setDecimal(game.state, "current_money", savedData.current_money);
  game.run_id = savedData.run_id;
  game.peak_power = savedData.reactor?.current_power != null ? savedData.reactor.current_power.toNumber() : 0;
  game.peak_heat = savedData.reactor?.current_heat != null ? savedData.reactor.current_heat.toNumber() : 0;
  game.base_rows = savedData.base_rows;
  game.base_cols = savedData.base_cols;
  game.protium_particles = savedData.protium_particles;
  setDecimal(game.state, "total_exotic_particles", savedData.total_exotic_particles);
  const epRaw = savedData.current_exotic_particles ?? savedData.exotic_particles;
  game.exoticParticleManager.exotic_particles = epRaw;
  setDecimal(game.state, "current_exotic_particles", epRaw);
  setDecimal(game.state, "session_power_produced", savedData.session_power_produced ?? 0);
  setDecimal(game.state, "session_power_sold", savedData.session_power_sold ?? 0);
  setDecimal(game.state, "session_heat_dissipated", savedData.session_heat_dissipated ?? 0);
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
  if (game.coreBridge?.isActive) {
    game.coreBridge.setPlacedCounts(game.placedCounts);
  }
}

function applyReactorState(game, savedData) {
  if (!savedData.reactor) return;
  setDecimal(game.state, "current_heat", savedData.reactor.current_heat);
  setDecimal(game.state, "current_power", savedData.reactor.current_power);
  game.state.melting_down = savedData.reactor.has_melted_down ?? false;
  if (savedData.reactor.base_max_heat != null) game.state.base_max_heat = savedData.reactor.base_max_heat;
  if (savedData.reactor.base_max_power != null) game.state.base_max_power = savedData.reactor.base_max_power;
}

export function reconcileReactorFromState(game) {
  const s = game?.state;
  const r = game?.reactor;
  if (!s || !r) return;
  if (s.base_max_heat) r.base_max_heat = s.base_max_heat;
  if (s.base_max_power) r.base_max_power = s.base_max_power;
}

async function applyUpgrades(game, savedData) {
  game.upgradeset.reset();
  await game.upgradeset.initialize();
  if (savedData.upgrades) {
    savedData.upgrades.forEach((upgData) => {
      const upgrade = game.upgradeset.getUpgrade(upgData.id);
      if (upgrade) upgrade.setLevel(upgData.level, { deferSync: true });
    });
  }
  if (game.upgradeset && game.tech_tree) game.upgradeset.sanitizeDoctrineUpgradeLevelsOnLoad(game.tech_tree);
  game.syncModifiersFromUpgrades({ skipGrid: true });
  game.reactor.updateStats();
}

async function restoreTiles(game, savedData) {
  if (!game.tileset.initialized) game.tileset.initialize();
  game.tileset.clearAllTiles();
  const tiles = savedData.tiles ?? [];
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
  const placedCounts = savedData.placedCounts ?? {};
  if (Object.keys(placedCounts).length > 0) {
    game.placedCounts = { ...placedCounts };
  } else {
    recalculatePlacedCountsFromGrid(game);
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

function applyObjectives(game, savedData) {
  if (!savedData.objectives) return;
  const savedIndex = clampObjectiveIndex(game, savedData, savedData.objectives.current_objective_index);
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
  game.coreBridge?.hydrateObjectivesFromGame?.();
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

function applyAchievements(game, savedData) {
  const full = savedData.achievements;
  if (game.achievement_manager) {
    game.achievement_manager.restore(full ?? savedData.unlocked_achievements ?? []);
  } else if (game.state) {
    if (full && typeof full === "object" && !Array.isArray(full)) {
      game.state.achievements = full;
      game.state.unlocked_achievements = unlockedAchievementIds(full);
    } else {
      game.state.unlocked_achievements = Array.isArray(savedData.unlocked_achievements)
        ? savedData.unlocked_achievements
        : [];
    }
    game.coreBridge?.hydrateAchievementsFromGame?.();
  }
}

const SYNC_HYDRATORS = [applyCoreGameState, applySessionMetadata, applyReactorState];
const ASYNC_HYDRATORS = [applyUpgrades, restoreTiles];
const POST_ASYNC_HYDRATORS = [applyObjectives, applyAchievements, applyUIState];

export async function applySaveState(game, savedData) {
  if (!savedData || typeof savedData !== "object") {
    throw new Error("Save corrupted: invalid save data structure");
  }
  for (const fn of SYNC_HYDRATORS) fn(game, savedData);
  if (!game.partset.initialized) await game.partset.initialize();
  for (const fn of ASYNC_HYDRATORS) await fn(game, savedData);
  for (const fn of POST_ASYNC_HYDRATORS) fn(game, savedData);
  reconcileReactorFromState(game);
  game.reactor.hull_heat_doctrine_mult = 1;
  game.reactor.updateStats();
  if (game.coreBridge?.isActive) {
    game.coreBridge.loadLegacySave(savedData);
  }
}

export async function absorbSaveDTO(game, dto) {
  return applySaveState(game, dto);
}

export async function buildSaveDTO(game) {
  const mgr = game?.saveManager;
  if (!mgr?.getSaveState) throw new Error("Save manager unavailable");
  return mgr.getSaveState();
}

function buildObjectivesStateForSave(ctx) {
  const om = ctx.objectives_manager;
  const obj = {
    current_objective_index: om?.current_objective_index ?? 0,
    completed_objectives: (om?.objectives_data?.map((o) => o.completed) ?? []),
  };
  return obj;
}

export function buildSaveContext(game, { getToggles, getQuickSelectSlots, onBeforeSave } = {}) {
  return {
    state: game.state,
    reactor: game.reactor,
    tileset: game.tileset,
    partset: game.partset,
    upgradeset: game.upgradeset,
    objectives_manager: game.objectives_manager,
    version: game.version,
    run_id: game.run_id,
    tech_tree: game.tech_tree,
    protium_particles: game.protium_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    exotic_particles: game.exoticParticleManager.exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    rows: game.rows,
    cols: game.cols,
    sold_power: game.sold_power,
    sold_heat: game.sold_heat,
    grace_period_ticks: game.grace_period_ticks,
    total_played_time: game.lifecycleManager.total_played_time,
    placedCounts: game.placedCounts,
    onBeforeSave,
    getToggles,
    getQuickSelectSlots,
  };
}

export function buildPersistenceContext(game, getCompactLayout) {
  return {
    hasMeltedDown: game.reactor?.has_melted_down,
    peakPower: game.peak_power,
    peakHeat: game.peak_heat,
    userId: game.user_id,
    runId: game.run_id,
    currentMoney: game.state.current_money,
    totalPlayedTime: game.lifecycleManager.total_played_time,
    cheatsUsed: game.cheats_used,
    updateSessionTime: () => game.updateSessionTime(),
    logger: game.logger ?? logger,
    getCompactLayout,
    applySaveState: (savedData) => game.saveManager.applySaveState(game, savedData),
    setSaveHydrationBlocked: (blocked) => {
      game._saveHydrationBlocked = !!blocked;
    },
    isSaveHydrationBlocked: () => !!game._saveHydrationBlocked,
  };
}

export function createGameSaveManager(game, getCompactLayoutFn = null) {
  const resolveLayout = getCompactLayoutFn ? () => getCompactLayoutFn(game) : () => null;
  return new GameSaveManager(
    () => buildPersistenceContext(game, resolveLayout),
    () => buildSaveContext(game, {
      getToggles: () => ({
        auto_sell: game.state?.auto_sell ?? false,
        auto_buy: game.state?.auto_buy ?? true,
        heat_control: game.state?.heat_control ?? false,
        pause: game.state?.pause ?? false,
      }),
      getQuickSelectSlots: () => game.ui?.stateManager?.getQuickSelectSlots() ?? [],
      onBeforeSave: () => {
        logger.log("debug", "game", "Generating save state");
        game.updateSessionTime();
      },
    })
  );
}

export class GameSaveManager {
  constructor(getPersistenceContext, getSaveContext) {
    this.getPersistenceContext = getPersistenceContext;
    this.getSaveContext = getSaveContext;
  }

  async getSaveState() {
    const ctx = this.getSaveContext();
    ctx.onBeforeSave?.();
    const stateSnap = ctx.state ? snapshot(ctx.state) : null;
    const reactorState = typeof ctx.reactor?.toSaveState === "function" ? ctx.reactor.toSaveState() : {
      current_heat: ctx.reactor.current_heat,
      current_power: ctx.reactor.current_power,
      has_melted_down: ctx.reactor.has_melted_down,
      base_max_heat: ctx.reactor.base_max_heat,
      base_max_power: ctx.reactor.base_max_power,
      altered_max_heat: ctx.reactor.altered_max_heat,
      altered_max_power: ctx.reactor.altered_max_power,
    };
    const tileState = typeof ctx.tileset?.toSaveState === "function"
      ? ctx.tileset.toSaveState()
      : ctx.tileset.active_tiles_list
        .filter((tile) => tile.part)
        .map((tile) => ({
          row: tile.row,
          col: tile.col,
          partId: tile.part.id,
          ticks: tile.ticks,
          heat_contained: tile.heat_contained,
        }));
    const upgradeState = typeof ctx.upgradeset?.toSaveState === "function"
      ? ctx.upgradeset.toSaveState()
      : ctx.upgradeset.upgradesArray
        .filter((upg) => upg.level > 0)
        .map((upg) => ({ id: upg.id, level: upg.level }));
    let part_table = [];
    let tiles_compact = undefined;
    try {
      if (ctx.partset?.partsArray?.length) {
        const built = buildPartTable(ctx.partset);
        part_table = built.part_table;
        tiles_compact = encodeTilesCompact(tileState, ctx.rows, ctx.cols, built.idToIndex);
      }
    } catch (err) {
      logger.log("warn", "game", "tiles_compact encode skipped:", err?.message || err);
    }
    const saveData = {
      save_format_version: SAVE_FORMAT_VERSION_LATEST,
      part_table,
      tiles_compact,
      version: ctx.version,
      run_id: ctx.run_id,
      tech_tree: ctx.tech_tree,
      current_money: stateSnap?.current_money ?? ctx.state?.current_money,
      protium_particles: ctx.protium_particles,
      total_exotic_particles: ctx.total_exotic_particles,
      exotic_particles: ctx.exotic_particles,
      current_exotic_particles: ctx.current_exotic_particles,
      session_power_produced: stateSnap?.session_power_produced ?? ctx.state?.session_power_produced,
      session_power_sold: stateSnap?.session_power_sold ?? ctx.state?.session_power_sold,
      session_heat_dissipated: stateSnap?.session_heat_dissipated ?? ctx.state?.session_heat_dissipated,
      rows: ctx.rows,
      cols: ctx.cols,
      sold_power: ctx.sold_power,
      sold_heat: ctx.sold_heat,
      grace_period_ticks: ctx.grace_period_ticks,
      total_played_time: ctx.total_played_time,
      last_save_time: Date.now(),
      reactor: reactorState,
      placedCounts: ctx.placedCounts,
      tiles: tileState,
      upgrades: upgradeState,
      objectives: buildObjectivesStateForSave(ctx),
      unlocked_achievements: stateSnap?.unlocked_achievements ?? ctx.state?.unlocked_achievements ?? [],
      achievements: ctx.coreBridge?.session?.systems?.achievements?.serialize?.()
        ?? ctx.state?.achievements
        ?? { unlocked: stateSnap?.unlocked_achievements ?? ctx.state?.unlocked_achievements ?? [] },
      toggles: ctx.getToggles?.() ?? {},
      quick_select_slots: ctx.getQuickSelectSlots?.() ?? [],
      ui: {},
    };
    try {
      if (typeof indexedDB !== "undefined") {
        const keysToCheck = ["reactorGameSave", "reactorGameSave_1", "reactorGameSave_2", "reactorGameSave_3"];
        for (const key of keysToCheck) {
          const existingSave = await StorageAdapter.get(key);
          if (existingSave && typeof existingSave === "object" && existingSave.isCloudSynced) {
            saveData.isCloudSynced = existingSave.isCloudSynced;
            saveData.cloudUploadedAt = existingSave.cloudUploadedAt;
            break;
          }
        }
      }
    } catch (error) {
      logger.log("warn", "game", "Could not preserve cloud sync flags:", error.message);
    }
    return saveData;
  }

  async applySaveState(game, savedData) {
    game._isRestoringSave = true;
    try {
      await applySaveState(game, savedData);
    } finally {
      game._isRestoringSave = false;
    }
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
    logger.log("debug", "game", `Attempting to save game. Meltdown state: ${ctx.hasMeltedDown}`);
    try {
      logger.log("debug", "game", "saveGame called", { slot, isAutoSave, meltdown: ctx.hasMeltedDown });
      if (ctx.isSaveHydrationBlocked?.()) {
        logger.log("warn", "game", "Save skipped: prior hydration failed");
        return;
      }
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
        isAutoSave,
      });

      if (effectiveSlot != null) {
        logger.log("debug", "game", `Game state saved to slot ${effectiveSlot}.`);
        logger.log("debug", "game", "Game saved", { slot: effectiveSlot });
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
    logger.log("debug", "game", "loadGame called", { slot });

    try {
      let key;
      let rawData;

      if (slot !== null) {
        key = slot === "auto" ? "reactorGameSave_auto" : `reactorGameSave_${slot}`;
        rawData = await StorageAdapter.getRaw(key);
      } else {
        const slots = await this.getAllSaveSlots();
        const autoSave = await fetchAutoSaveSlotData();
        const candidates = slots.filter((s) => s.exists);
        if (autoSave) candidates.push(autoSave);
        const mostRecent = candidates.sort((a, b) => (b.lastSaveTime || 0) - (a.lastSaveTime || 0))[0];
        if (mostRecent) {
          if (mostRecent.slot === "auto") {
            key = "reactorGameSave_auto";
          } else {
            key = `reactorGameSave_${mostRecent.slot}`;
          }
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
      logger.log("debug", "game", "Applying save data from slot", { slot, version: validatedData.version });
      ctx.setSaveHydrationBlocked?.(false);
      await ctx.applySaveState(validatedData);
      return true;
    } catch (error) {
      logger.log("error", "game", `Save corrupted or load failed for slot ${slot ?? "default"}:`, error);
      ctx.setSaveHydrationBlocked?.(true);
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
