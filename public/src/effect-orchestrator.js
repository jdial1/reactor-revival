import { resolveAudioService } from "./services.js";

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

export function drainGameEffects(game, getUi) {
  const q = game?.state?.effect_queue;
  if (!q?.length) return;
  const batch = q.splice(0, q.length);
  const audio = game?.audio;
  const page = getUi?.()?.uiState?.active_page;
  for (const e of batch) {
    if (e.kind === "haptic") {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(e.pattern);
        } catch (_) {}
      }
      continue;
    }
    if (e.kind !== "sfx" || !audio) continue;
    const ctx = e.context ?? "global";
    if (ctx === "reactor" && page != null && page !== "reactor_section") continue;
    playSfx(audio, e);
  }
}
