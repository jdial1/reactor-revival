import { fromError } from "zod-validation-error";
import { StorageAdapter } from "../utils/storageAdapter.js";
import { deserializeSave, getBackupSaveForSlot1Async } from "../utils/util.js";
import { saveGameMutation } from "../services/saveMutations.js";
import { leaderboardService } from "../services/leaderboardService.js";
import { logger } from "../utils/logger.js";
import { SaveDataSchema } from "./schemas.js";

export function parseAndValidateSave(raw) {
  const parsed = typeof raw === "string" ? deserializeSave(raw) : raw;
  const result = SaveDataSchema.safeParse(parsed);
  if (!result.success) {
    logger.log("error", "game", "Save validation failed:", fromError(result.error).toString());
    throw new Error("Save corrupted: validation failed");
  }
  return result.data;
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
    const effectiveSlot = slot ?? await this.getNextSaveSlot();
    await this._saveGame(effectiveSlot, false);
  }

  async autoSave() {
    await this._saveGame(null, true);
  }

  async _saveGame(slot = null, isAutoSave = false) {
    const ctx = this.getPersistenceContext();
    if (ctx.isSandbox) return;

    logger.log('debug', 'game', `Attempting to save game. Meltdown state: ${ctx.hasMeltedDown}`);
    try {
      ctx.debugHistory.add('game', 'saveGame called', { slot, isAutoSave, meltdown: ctx.hasMeltedDown });
      if (ctx.hasMeltedDown) {
        if ((ctx.peakPower > 0 || ctx.peakHeat > 0) && !ctx.cheatsUsed) {
          leaderboardService.saveRun({
            user_id: ctx.userId,
            run_id: ctx.runId,
            heat: ctx.peakHeat,
            power: ctx.peakPower,
            money: (ctx.currentMoney && typeof ctx.currentMoney.toNumber === 'function' ? ctx.currentMoney.toNumber() : Number(ctx.currentMoney)),
            time: ctx.totalPlayedTime,
            layout: JSON.stringify(ctx.getCompactLayout())
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
          money: (ctx.currentMoney && typeof ctx.currentMoney.toNumber === 'function' ? ctx.currentMoney.toNumber() : Number(ctx.currentMoney)),
          time: ctx.totalPlayedTime,
          layout: JSON.stringify(ctx.getCompactLayout())
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
      logger.log('error', 'game', 'Error saving game:', error);
    }
  }

  async getNextSaveSlot() {
    const currentSlot = Number(await StorageAdapter.get("reactorCurrentSaveSlot") ?? 1);
    return ((currentSlot % 3) + 1);
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
          exoticParticles: savedData.exotic_particles || 0,
          data: savedData
        };
      }
    } catch (error) {
      logger.log('error', 'game', `Error reading save slot ${slot}:`, error);
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
    ctx.debugHistory.add('game', 'loadGame called', { slot });

    try {
      let key;
      let rawData;

      if (slot !== null) {
        key = `reactorGameSave_${slot}`;
        rawData = await StorageAdapter.getRaw(key);
      } else {
        const slots = await this.getAllSaveSlots();
        const mostRecent = slots.filter(s => s.exists).sort((a, b) => (b.lastSaveTime || 0) - (a.lastSaveTime || 0))[0];
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
      ctx.debugHistory.add('game', 'Applying save data from slot', { slot, version: validatedData.version });
      await ctx.applySaveState(validatedData);
      return true;

    } catch (error) {
      logger.log('error', 'game', `Save corrupted or load failed for slot ${slot ?? 'default'}:`, error);
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
