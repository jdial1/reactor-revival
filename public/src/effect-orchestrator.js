import { resolveAudioService, processSensoryMask } from "./services/audio.js";
import { isShopOverlayPage } from "./components/shell/page-dom.js";
import { showStatusNotice } from "./components/shell/ui-notices.js";
import { drainSimEventQueue } from "./domain/sim-events.js";
import { safeCall } from "./core/teardown.js";

function playSfx(audio, e) {
  const svc = resolveAudioService(audio);
  if (!svc) return;
  switch (e.id) {
    case "placement":
      svc.play("placement", e.subtype ?? null, e.pan ?? 0);
      break;
    case "explosion":
      svc.play("explosion", e.subtype ?? null, e.pan ?? 0);
      break;
    case "warning":
      svc.play("warning", e.intensity ?? 0.85);
      break;
    case "sell":
      svc.play("sell", null, e.pan ?? 0);
      break;
    case "error":
      svc.play("error", null, e.pan ?? 0);
      break;
    case "upgrade":
      svc.play("upgrade");
      break;
    case "reboot":
      svc.play("reboot");
      break;
    case "tab_switch":
      svc.play("tab_switch");
      break;
    case "tab_relay_thud":
      svc.play("tab_relay_thud");
      break;
    case "metal_clank":
      svc.play("metal_clank", e.a ?? 0.8, e.b ?? -0.7);
      break;
    case "click":
      svc.play("click");
      break;
    default:
      svc.play(e.id, e.a, e.b);
  }
}

function shouldSkipReactorEffect(page, context) {
  return context === "reactor" && page != null && page !== "reactor_section" && !isShopOverlayPage(page);
}

function placementSubtype(category) {
  if (category === "cell") return "cell";
  if (category === "reactor_plating") return "plating";
  if (category === "vent") return "vent";
  return category ?? null;
}

function resolvePan(game, col) {
  return game?.calculatePan ? game.calculatePan(col) : 0;
}

function drainFloatingTextEffect(game, ui, e) {
  if (!ui || shouldSkipReactorEffect(ui.uiState?.active_page, e.context ?? "reactor")) return;
  const row = e.row;
  const col = e.col;
  const text = e.text ?? (typeof e.amount === "number" ? e.amount : null);
  if (row != null && col != null && game?.tileset) {
    const tile = game.tileset.getTile(row, col);
    if (tile && typeof ui.showFloatingTextAtTile === "function") {
      safeCall(() => ui.showFloatingTextAtTile(tile, text, { variant: e.variant }), "floating text");
    }
    return;
  }
  if (e.body) showStatusNotice({ tag: e.tag ?? "NOTICE", body: e.body, durationMs: e.durationMs });
}

function mapSimEventToEffects(game, ui, page, event) {
  switch (event.type) {
    case "COMPONENT_EXPLODED": {
      if (!shouldSkipReactorEffect(page, "reactor") && game?.audio) {
        playSfx(game.audio, { id: "explosion", subtype: null, pan: resolvePan(game, event.col), context: "reactor" });
      }
      return;
    }
    case "INSUFFICIENT_FUNDS": {
      if (shouldSkipReactorEffect(page, "reactor")) return;
      if (game?.audio) playSfx(game.audio, { id: "error", pan: resolvePan(game, event.col), context: "reactor" });
      drainFloatingTextEffect(game, ui, {
        row: event.row,
        col: event.col,
        text: event.message ?? "[Not enough funds!]",
        variant: "debit",
        context: "reactor",
      });
      return;
    }
    case "OPERATION_FAILED": {
      if (shouldSkipReactorEffect(page, event.context ?? "reactor")) return;
      if (game?.audio) {
        playSfx(game.audio, {
          id: "error",
          pan: event.col != null ? resolvePan(game, event.col) : 0,
          context: event.context ?? "reactor",
        });
      }
      return;
    }
    case "PART_PLACED": {
      if (shouldSkipReactorEffect(page, "reactor")) return;
      if (game?.audio) {
        playSfx(game.audio, {
          id: "placement",
          subtype: placementSubtype(event.category),
          pan: resolvePan(game, event.col),
          context: "reactor",
        });
      }
      return;
    }
    case "HEAT_WARNING": {
      if (shouldSkipReactorEffect(page, "reactor")) return;
      if (game?.audio) playSfx(game.audio, { id: "warning", intensity: event.intensity ?? 0.85, context: "reactor" });
      return;
    }
    case "MELTDOWN_HAPTIC": {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        safeCall(() => { navigator.vibrate(event.pattern ?? 200); });
      }
      return;
    }
    case "SENSORY_MASK": {
      if (game?.audio) {
        processSensoryMask(game.audio, event.mask, {
          currentHeat: event.currentHeat,
          maxHeat: event.maxHeat,
        });
      }
      return;
    }
    case "CATCH_UP_COMPLETE": {
      if (!shouldSkipReactorEffect(page, "global")) {
        showStatusNotice({ tag: event.tag ?? "CATCH-UP COMPLETE", body: event.body, durationMs: event.durationMs ?? 6000 });
      }
      return;
    }
    case "AUTO_BUY_DEBIT": {
      drainFloatingTextEffect(game, ui, {
        row: event.row,
        col: event.col,
        text: event.text,
        variant: "debit",
        context: "reactor",
      });
      return;
    }
    case "MANUAL_HEAT_REDUCE": {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        safeCall(() => { navigator.vibrate(50); });
      }
      if (!shouldSkipReactorEffect(page, "reactor") && game?.audio) {
        playSfx(game.audio, { id: "metal_clank", a: 0.8, b: -0.7, context: "reactor" });
      }
      return;
    }
    case "PART_SOLD": {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        safeCall(() => { navigator.vibrate(50); });
      }
      if (shouldSkipReactorEffect(page, "reactor")) return;
      if (game?.audio) {
        playSfx(game.audio, { id: "sell", pan: resolvePan(game, event.col), context: "reactor" });
      }
      if (event.text != null) {
        drainFloatingTextEffect(game, ui, {
          row: event.row,
          col: event.col,
          text: event.text,
          context: "reactor",
        });
      }
      return;
    }
    case "PRESTIGE_REBOOT_TRIGGERED": {
      if (game?.audio) playSfx(game.audio, { id: "reboot", context: "global" });
      return;
    }
    default:
      return;
  }
}

export function drainGameEffects(game, getUi) {
  const simBatch = drainSimEventQueue(game);
  const ui = getUi?.();
  const page = ui?.uiState?.active_page;
  for (let i = 0; i < simBatch.length; i++) {
    mapSimEventToEffects(game, ui, page, simBatch[i]);
  }

  const q = game?.state?.effect_queue;
  if (!q?.length) return;
  const batch = q.splice(0, q.length);
  const audio = game?.audio;
  for (const e of batch) {
    if (e.kind === "haptic") {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        safeCall(() => { navigator.vibrate(e.pattern); });
      }
      continue;
    }
    if (e.kind === "notice") {
      if (!shouldSkipReactorEffect(page, e.context ?? "global")) {
        showStatusNotice({ tag: e.tag ?? "NOTICE", body: e.body, durationMs: e.durationMs });
      }
      continue;
    }
    if (e.kind === "floating_text") {
      drainFloatingTextEffect(game, ui, e);
      continue;
    }
    if (e.kind === "dom_pulse" && typeof document !== "undefined") {
      const el = e.selector ? document.querySelector(e.selector) : null;
      if (el && e.className) {
        el.classList.add(e.className);
        setTimeout(() => el.classList.remove(e.className), e.durationMs ?? 2000);
      }
      continue;
    }
    if (e.kind === "ambience_heat" && audio?.ambienceManager) {
      audio.ambienceManager.updateAmbienceHeat(e.currentHeat ?? 0, e.maxHeat ?? 0);
      continue;
    }
    if (e.kind === "sensory_mask" && audio) {
      processSensoryMask(audio, e.mask, {
        currentHeat: e.currentHeat,
        maxHeat: e.maxHeat,
      });
      continue;
    }
    if (e.kind === "clear_animations") {
      ui?.gridInteractionUI?.clearAllActiveAnimations?.();
      continue;
    }
    if (e.kind === "clear_image_cache") {
      ui?.gridCanvasRenderer?.clearImageCache?.();
      continue;
    }
    if (e.kind === "warning_loop" && audio) {
      resolveAudioService(audio)?.warningManager?.startWarningLoop?.(e.intensity ?? 0.5);
      continue;
    }
    if (e.kind === "warning_stop" && audio) {
      resolveAudioService(audio)?.warningManager?.stopWarningLoop?.();
      continue;
    }
    if (e.kind !== "sfx" || !audio) continue;
    const ctx = e.context ?? "global";
    if (shouldSkipReactorEffect(page, ctx)) continue;
    playSfx(audio, e);
  }
}
