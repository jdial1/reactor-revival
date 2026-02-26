import { StorageUtilsAsync } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { snapshot } from "../store.js";
import { applySaveState as applySaveStateFromModule } from "../saveStateApplier.js";

export class SaveOrchestrator {
  constructor({ getContext, onBeforeSave }) {
    this.getContext = getContext;
    this.onBeforeSave = onBeforeSave;
  }

  async getSaveState() {
    this.onBeforeSave?.();
    const ctx = this.getContext();
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
        .map((upg) => ({
          id: upg.id,
          level: upg.level,
        }));
    const saveData = {
      version: ctx.version,
      run_id: ctx.run_id,
      tech_tree: ctx.tech_tree,
      current_money: stateSnap?.current_money ?? ctx.state?.current_money,
      protium_particles: ctx.protium_particles,
      total_exotic_particles: ctx.total_exotic_particles,
      exotic_particles: ctx.exotic_particles,
      current_exotic_particles: ctx.current_exotic_particles,
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
      objectives: this._buildObjectivesState(ctx),
      toggles: ctx.getToggles?.() ?? {},
      quick_select_slots: ctx.getQuickSelectSlots?.() ?? [],
      ui: {},
    };

    try {
      if (typeof indexedDB !== "undefined") {
        const keysToCheck = ["reactorGameSave", "reactorGameSave_1", "reactorGameSave_2", "reactorGameSave_3"];
        for (const key of keysToCheck) {
          const existingSave = await StorageUtilsAsync.get(key);
          if (existingSave && typeof existingSave === "object" && existingSave.isCloudSynced) {
            saveData.isCloudSynced = existingSave.isCloudSynced;
            saveData.cloudUploadedAt = existingSave.cloudUploadedAt;
            break;
          }
        }
      }
    } catch (error) {
      logger.log('warn', 'game', 'Could not preserve cloud sync flags:', error.message);
    }

    return saveData;
  }

  _buildObjectivesState(ctx) {
    const om = ctx.objectives_manager;
    const obj = {
      current_objective_index: om?.current_objective_index ?? 0,
      completed_objectives: (om?.objectives_data?.map(o => o.completed) ?? []),
    };
    if (om?.infiniteObjective) {
      obj.infinite_objective = {
        ...om.infiniteObjective,
        _lastInfinitePowerTarget: om._lastInfinitePowerTarget,
        _lastInfiniteHeatMaintain: om._lastInfiniteHeatMaintain,
        _lastInfiniteMoneyThorium: om._lastInfiniteMoneyThorium,
        _lastInfiniteHeat: om._lastInfiniteHeat,
        _lastInfiniteEP: om._lastInfiniteEP,
        _infiniteChallengeIndex: om._infiniteChallengeIndex,
        _infiniteCompletedCount: om._infiniteCompletedCount,
      };
    }
    return obj;
  }

  async applySaveState(game, savedData) {
    game._isRestoringSave = true;
    try {
      await applySaveStateFromModule(game, savedData);
    } finally {
      game._isRestoringSave = false;
    }
  }
}
