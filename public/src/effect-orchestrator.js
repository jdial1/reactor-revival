function playSfx(audio, e) {
  if (!audio) return;
  switch (e.id) {
    case "placement":
      audio.play("placement", e.subtype ?? null, e.pan ?? 0);
      break;
    case "explosion":
      audio.play("explosion", e.subtype ?? null, e.pan ?? 0);
      break;
    case "warning":
      audio.play("warning", e.intensity ?? 0.85);
      break;
    case "sell":
      audio.play("sell", null, e.pan ?? 0);
      break;
    case "error":
      audio.play("error", null, e.pan ?? 0);
      break;
    case "upgrade":
      audio.play("upgrade");
      break;
    case "reboot":
      audio.play("reboot");
      break;
    case "tab_switch":
      audio.play("tab_switch");
      break;
    case "tab_relay_thud":
      audio.play("tab_relay_thud");
      break;
    case "metal_clank":
      audio.play("metal_clank", e.a ?? 0.8, e.b ?? -0.7);
      break;
    case "click":
      audio.play("click");
      break;
    default:
      audio.play(e.id, e.a, e.b);
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
