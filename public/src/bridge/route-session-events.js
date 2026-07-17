import { recordSimEvent } from "../domain/sim-events.js";
import { drainGameEffects } from "../effect-orchestrator.js";

export function routeSessionEvents(bridge) {
  const events = bridge.session?.drainEvents?.() || [];
  const game = bridge.game;
  for (const event of events) {
    if (event.type === "sellPower") {
      game.sold_power = true;
      recordSimEvent(game, { type: "POWER_SOLD", ...(event.payload || {}) });
    }
    if (event.type === "ventHeat") {
      recordSimEvent(game, { type: "HEAT_VENTED", ...(event.payload || {}) });
    }
    if (event.type === "soldHeat") {
      game.sold_heat = true;
      recordSimEvent(game, { type: "HEAT_VENTED", ...(event.payload || {}) });
    }
    if (event.type === "heatWarning") {
      const level = event.payload?.level ?? null;
      if (game.state) {
        game.state.ui_heat_critical = level === "critical";
        game.state.ui_pipe_integrity_warning = level === "high" || level === "critical";
      }
      if (!level) game.emit?.("heatWarningCleared");
      else game.emit?.("heatWarning", event.payload);
    }
    if (event.type === "partSold") {
      recordSimEvent(game, {
        type: "PART_SOLD",
        row: event.payload?.row,
        col: event.payload?.col,
        text: event.payload?.value != null ? `+${event.payload.value}` : undefined,
      });
    }
    if (event.type === "upgradePurchased") {
      const id = event.payload?.id;
      const upgrade = id ? game.upgradeset?.getUpgrade(id) : null;
      const newLevel = event.payload?.newLevel;
      if (upgrade && typeof newLevel === "number" && upgrade.level !== newLevel) {
        upgrade.setLevel(newLevel, { deferSync: true });
      }
      game.emit?.("upgradePurchased", { upgrade, ...event.payload });
    }
    if (event.type === "objectiveComplete") {
      const idx = event.payload?.index;
      const om = game.objectives_manager;
      if (om && typeof idx === "number") {
        if (om.objectives_data?.[idx]) om.objectives_data[idx].completed = true;
        if (om.current_objective_index === idx && om.current_objective_def) {
          om.current_objective_def.completed = true;
          om._emitObjectiveCompleted?.();
        }
      }
      om?._syncActiveObjectiveToState?.();
    }
    if (event.type === "achievementUnlocked") {
      const id = event.payload?.id;
      if (id) game.achievement_manager?.unlock(id);
    }
    if (event.type === "automationReplace") {
      const replacements = event.payload?.replacements;
      if (Array.isArray(replacements)) {
        for (let i = 0; i < replacements.length; i++) {
          const rep = replacements[i];
          recordSimEvent(game, {
            type: "AUTO_BUY_DEBIT",
            row: rep.row,
            col: rep.col,
          });
        }
      }
    }
    if (event.type === "reboot") game.emit?.("statePatch", { type: "reboot" });
    if (event.type === "blueprintPlannerCommitted") game.emit?.("grid_changed", {});
    if (event.type === "componentExplosion") {
      const row = event.payload?.row;
      const col = event.payload?.col;
      const tile = game.tileset?.getTile(row, col);
      if (tile) {
        game.engine?.handleComponentExplosion?.(tile);
        if (tile.exploded) {
          const inst = bridge.session?.grid?.getComponentAt(row, col);
          if (inst) inst.pendingDestruction = true;
        }
        const partId = event.payload?.id || tile.part?.id;
        if (partId?.startsWith("particle_accelerator") || tile.part?.category === "particle_accelerator") {
          game.reactor?.checkMeltdown?.();
        }
      }
    }
    if (event.type === "reflector_pulse") {
      const pulses = event.payload?.pulses;
      const eng = game.engine;
      if (Array.isArray(pulses) && eng?.enqueueReflectorVisualPulse) {
        for (let i = 0; i < pulses.length; i++) {
          const p = pulses[i];
          eng.enqueueReflectorVisualPulse(p.reflectorRow, p.reflectorCol, p.cellRow, p.cellCol);
        }
      }
    }
    if (event.type === "meltdown") {
      game.reactor.has_melted_down = true;
      game.state.melting_down = true;
      game.reactor?.checkMeltdown?.();
    }
  }
  if (events.length) drainGameEffects(game, () => game?.ui);
}
