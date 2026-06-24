export function dispatchToggleIntent(game, toggleName, value, sourceId = null) {
  if (!game?.state) return;
  game.state.intent_queue.push({
    action: "SET_TOGGLE",
    timestamp: Date.now(),
    payload: { toggleName, value: !!value, sourceId },
  });
  game.engine?.consumeIntentQueueAsync?.();
}

export function dispatchPauseIntent(game, paused, sourceId = "navigation") {
  dispatchToggleIntent(game, "pause", !!paused, sourceId);
}

export function dispatchUiIntent(game, intent, e) {
  if (!game?.state) return;
  const btn = e?.currentTarget;
  game.state.intent_queue.push({
    action: intent,
    timestamp: Date.now(),
    payload: { sourceId: btn?.id },
  });
  game.engine?.consumeIntentQueueAsync?.();
}

function createIntentDelegationHandler(game, root) {
  let lastIntentKey = "";
  let lastIntentAt = 0;
  return (ev) => {
    if (ev.type === "click" && ev.pointerType && ev.pointerType !== "mouse") return;
    const t = ev.target.closest("[data-intent]");
    if (!t || !root.contains(t)) return;
    const id = t.getAttribute("data-intent");
    if (!id) return;
    const dedupeKey = `${id}:${t.id || ""}`;
    const now = Date.now();
    if (dedupeKey === lastIntentKey && now - lastIntentAt < 400) return;
    lastIntentKey = dedupeKey;
    lastIntentAt = now;
    dispatchUiIntent(game, id, { currentTarget: t, target: ev.target });
  };
}

export function bindIntentDelegation(game, root) {
  if (!root || root._intentDelegationBound) return;
  const handler = createIntentDelegationHandler(game, root);
  root.addEventListener("click", handler);
  root.addEventListener("pointerup", handler);
  root._intentDelegationBound = true;
  return () => {
    root.removeEventListener("click", handler);
    root.removeEventListener("pointerup", handler);
    root._intentDelegationBound = false;
  };
}

export function installAppRootIntentDelegation(game) {
  const root = typeof document !== "undefined" ? document.querySelector("#wrapper") : null;
  const teardown = bindIntentDelegation(game, root);
  return typeof teardown === "function" ? teardown : () => {};
}
