import { recordSimEvent } from "../domain/sim-events.js";
import { syncActiveObjectiveToState } from "../domain/objectives.js";
import { OVERRIDE_DURATION_MS } from "../constants/balance.js";
import { toNumber } from "../simUtils.js";
import { getCompactLayout } from "../domain/reactor-codec.js";
import { bumpSnapshotRev } from "../state/snapshot-rev.js";
import { runSubsystemHook } from "../core/subsystem-registry.js";
import { logger } from "../core/logger.js";

export function presentMeltdown(game) {
  if (!game || game._meltdownPresentationDone) return;
  if (!game.state?.melting_down
    && !game.coreBridge?.session?.systems?.failure?.hasMeltedDown) {
    return;
  }
  game._meltdownPresentationDone = true;
  logger.log("warn", "engine", "[MELTDOWN] Session failure projected; presenting meltdown chrome.");
  if (game.state) {
    game.state.melting_down = true;
    game.state.meltdown_seq = (game.state.meltdown_seq | 0) + 1;
  }
  bumpSnapshotRev(game);
  recordSimEvent(game, { type: "MELTDOWN_HAPTIC", pattern: 200 });
  runSubsystemHook(game, "postTick");
  if (game.engine) game.engine.stop();
  const layout = getCompactLayout(game);
  if (layout?.parts?.length) {
    game.emit?.("meltdownRecoveredBlueprint", { layout });
  }
  if (!game.ui?.meltdownUI) {
    game.tileset?.clearAllTiles?.();
  }
  game.partset?.check_affordability?.(game);
  game.upgradeset?.check_affordability?.(game);
}

export function routeSessionEvents(bridge, preDrainedEvents = null) {
  const events = preDrainedEvents ?? (bridge.session?.drainEvents?.() || []);
  const game = bridge.game;
  for (const event of events) {
    if (event.type === "sellPower") {
      game.sold_power = true;
      recordSimEvent(game, { type: "POWER_SOLD", ...(event.payload || {}) });
      const reactor = game.reactor;
      if (toNumber(reactor?.sessionModifiers?.manual_override_mult ?? 0) > 0) {
        reactor.override_end_time = Date.now() + OVERRIDE_DURATION_MS;
      }
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
      if (game.ui?.uiState) {
        game.ui.uiState.heat_critical = level === "critical";
        game.ui.uiState.pipe_integrity_warning = level === "high" || level === "critical";
      }
      if (!level) game.emit?.("heatWarningCleared");
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
      syncActiveObjectiveToState(om);
    }
    if (event.type === "achievementUnlocked") {
      const id = event.payload?.id;
      if (id) game.achievement_manager?.notifyUnlock(id);
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
    if (event.type === "reboot") game.emit?.("reboot");
    if (event.type === "componentExplosion") {
      const row = event.payload?.row;
      const col = event.payload?.col;
      const tile = game.tileset?.getTile(row, col);
      if (tile) {
        game.engine?.handleComponentExplosion?.(tile);
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
      presentMeltdown(game);
    }
  }
}
