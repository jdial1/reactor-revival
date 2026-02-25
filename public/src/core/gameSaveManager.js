import { StorageUtils, rotateSlot1ToBackup, getBackupSaveForSlot1 } from "../utils/util.js";
import { leaderboardService } from "../services/leaderboardService.js";
import { logger } from "../utils/logger.js";
import { SaveDataSchema } from "./schemas.js";

export class GameSaveManager {
  constructor(saveOrchestrator, getPersistenceContext) {
    this.saveOrchestrator = saveOrchestrator;
    this.getPersistenceContext = getPersistenceContext;
  }

  getSaveState() {
    return this.saveOrchestrator.getSaveState();
  }

  _hasCoreDataChanged(newData, existingData) {
    const keyFields = [
      "current_money",
      "protium_particles",
      "total_exotic_particles",
      "exotic_particles",
      "current_exotic_particles",
      "reality_flux",
      "rows",
      "cols",
      "sold_power",
      "sold_heat",
    ];

    for (const field of keyFields) {
      if (newData[field] !== existingData[field]) {
        return true;
      }
    }

    if (
      newData.reactor?.has_melted_down !== existingData.reactor?.has_melted_down
    ) {
      return true;
    }

    if (newData.tiles?.length !== existingData.tiles?.length) {
      return true;
    }

    if (newData.upgrades?.length !== existingData.upgrades?.length) {
      return true;
    }

    if (
      newData.objectives?.current_objective_index !==
      existingData.objectives?.current_objective_index
    ) {
      return true;
    }

    return false;
  }

  saveToSlot(slot) {
    this._saveGame(slot ?? this.getNextSaveSlot(), false);
  }

  autoSave() {
    this._saveGame(null, true);
  }

  _saveGame(slot = null, isAutoSave = false) {
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

      const saveData = this.getSaveState();

      if (typeof localStorage !== "undefined" && localStorage !== null) {
        if (slot === null) {
          slot = this.getNextSaveSlot();
        }

        const saveKey = `reactorGameSave_${slot}`;
        const payload = StorageUtils.serialize(saveData);
        if (slot === 1) {
          rotateSlot1ToBackup(payload);
        } else {
          StorageUtils.setRaw(saveKey, payload);
        }
        logger.log('debug', 'game', `Game state saved to slot ${slot}. Size: ${payload.length} bytes.`);
        ctx.debugHistory.add('game', 'Game saved', { slot, size: payload.length });

        StorageUtils.set("reactorCurrentSaveSlot", slot);
      } else if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "test"
      ) {
        return;
      }

      if (typeof window !== "undefined" && window.googleDriveSave && window.googleDriveSave.isSignedIn) {
        window.googleDriveSave.save(StorageUtils.serialize(saveData)).catch((error) => {
          logger.log('error', 'game', 'Failed to auto-save to Google Drive:', error);
        });
      }
    } catch (error) {
      if (
        typeof process === "undefined" ||
        process.env?.NODE_ENV !== "test" ||
        !error.message.includes("localStorage")
      ) {
        logger.log('error', 'game', 'Error saving game:', error);
      }
    }
  }

  getNextSaveSlot() {
    const currentSlot = Number(StorageUtils.get("reactorCurrentSaveSlot", 1));
    return ((currentSlot % 3) + 1);
  }

  getSaveSlotInfo(slot) {
    try {
      const saveKey = `reactorGameSave_${slot}`;
      const savedData = StorageUtils.get(saveKey);
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

  getAllSaveSlots() {
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const slotInfo = this.getSaveSlotInfo(i);
      slots.push({
        slot: i,
        ...slotInfo
      });
    }
    return slots;
  }

  async loadGame(slot = null) {
    const ctx = this.getPersistenceContext();
    ctx.debugHistory.add('game', 'loadGame called', { slot });
    try {
      let effectiveSlot = slot;
      let savedData;
      if (slot !== null) {
        const saveKey = `reactorGameSave_${slot}`;
        savedData = StorageUtils.get(saveKey);
      } else {
        savedData = StorageUtils.get("reactorGameSave");
        if (savedData == null) {
          let mostRecentSlot = null;
          let mostRecentTime = 0;
          for (let i = 1; i <= 3; i++) {
            const slotInfo = this.getSaveSlotInfo(i);
            if (slotInfo.exists && slotInfo.lastSaveTime > mostRecentTime) {
              mostRecentTime = slotInfo.lastSaveTime;
              mostRecentSlot = i;
            }
          }
          if (mostRecentSlot) {
            effectiveSlot = mostRecentSlot;
            savedData = StorageUtils.get(`reactorGameSave_${mostRecentSlot}`);
          }
        }
      }

      if (savedData != null) {
        const result = SaveDataSchema.safeParse(savedData);
        if (!result.success) {
          const readable = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
          logger.log('error', 'game', 'Save validation failed:', readable || result.error.message);
          if (effectiveSlot === 1 && getBackupSaveForSlot1()) {
            return { success: false, parseError: true, backupAvailable: true };
          }
          throw new Error('Save corrupted: validation failed');
        }
        ctx.debugHistory.add('game', 'Applying save data from slot', { slot, version: result.data.version });
        await ctx.applySaveState(result.data);
        return true;
      }
      if (effectiveSlot === 1 && getBackupSaveForSlot1()) {
        return { success: false, parseError: true, backupAvailable: true };
      }
      if (effectiveSlot !== null) {
        StorageUtils.remove(`reactorGameSave_${effectiveSlot}`);
      } else {
        StorageUtils.remove("reactorGameSave");
      }
      throw new Error(`Save corrupted: invalid JSON in slot ${effectiveSlot ?? 'default'}`);
    } catch (error) {
      logger.log('error', 'game', 'Error loading game:', error);
      if (slot !== null) {
        StorageUtils.remove(`reactorGameSave_${slot}`);
      } else {
        StorageUtils.remove("reactorGameSave");
      }
    }
    return false;
  }

  compressSaveData(data) {
    try {
      return btoa(encodeURIComponent(data));
    } catch (error) {
      logger.log('error', 'game', 'Compression error:', error);
      return data;
    }
  }

  decompressSaveData(compressedData) {
    try {
      return decodeURIComponent(atob(compressedData));
    } catch (error) {
      logger.log('error', 'game', 'Decompression error:', error);
      return compressedData;
    }
  }

  validateSaveData(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const result = SaveDataSchema.safeParse(parsed);
    if (!result.success) {
      const readable = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.log('error', 'game', 'Save validation failed:', readable || result.error.message);
      throw new Error('Save corrupted: validation failed');
    }
    return result.data;
  }
}
