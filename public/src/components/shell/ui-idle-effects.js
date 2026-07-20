const IDLE_MS = 45000;

function setHtmlIdle(idle) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  if (idle) root.dataset.uiIdle = "";
  else delete root.dataset.uiIdle;
}

export function setupUiIdleEffects() {
  if (typeof document === "undefined") return () => {};
  let idleTimer = null;

  const markActive = () => {
    setHtmlIdle(false);
    if (idleTimer) clearTimeout(idleTimer);
    if (!document.hidden) {
      idleTimer = setTimeout(() => setHtmlIdle(true), IDLE_MS);
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      setHtmlIdle(true);
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
    setHtmlIdle(false);
  };
}
