const IDLE_MS = 45000;

export function setupUiIdleEffects() {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  let idleTimer = null;

  const markActive = () => {
    root.classList.remove("ui-idle");
    if (idleTimer) clearTimeout(idleTimer);
    if (!document.hidden) {
      idleTimer = setTimeout(() => root.classList.add("ui-idle"), IDLE_MS);
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      root.classList.add("ui-idle");
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    } else {
      markActive();
    }
  };

  document.addEventListener("pointerdown", markActive, { passive: true });
  document.addEventListener("keydown", markActive, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  markActive();

  return () => {
    document.removeEventListener("pointerdown", markActive);
    document.removeEventListener("keydown", markActive);
    document.removeEventListener("visibilitychange", onVisibility);
    if (idleTimer) clearTimeout(idleTimer);
    root.classList.remove("ui-idle");
  };
}
