const FADE_SLIGHT_MS = 15000;
const FADE_FULL_MS = 30000;
const FADE_CLASS_SLIGHT = "splash-menu-fade-slight";
const FADE_CLASS_FULL = "splash-menu-fade-full";

function scheduleFadeSteps(panel, slightTimerRef, fullTimerRef) {
  if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
  if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
  panel.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  slightTimerRef.current = setTimeout(() => {
    panel.classList.add(FADE_CLASS_SLIGHT);
    slightTimerRef.current = null;
  }, FADE_SLIGHT_MS);
  fullTimerRef.current = setTimeout(() => {
    panel.classList.remove(FADE_CLASS_SLIGHT);
    panel.classList.add(FADE_CLASS_FULL);
    fullTimerRef.current = null;
  }, FADE_FULL_MS);
}

function bindWakeListeners(panel, slightTimerRef, fullTimerRef, handlers) {
  const wake = () => {
    scheduleFadeSteps(panel, slightTimerRef, fullTimerRef);
  };
  const events = ["click", "touchstart", "pointerdown", "pointermove", "keydown"];
  events.forEach((ev) => {
    const h = (e) => {
      if (ev === "pointermove" && e.buttons === 0) return;
      wake();
    };
    document.addEventListener(ev, h, { capture: true, passive: ev === "pointermove" });
    handlers.push({ event: ev, handler: h });
  });
}

function unbindWakeListeners(handlers) {
  handlers.forEach(({ event, handler }) => {
    document.removeEventListener(event, handler, { capture: true });
  });
  handlers.length = 0;
}

export function initSplashMenuIdleFade(panelElement) {
  if (!panelElement) return () => {};
  const slightTimerRef = { current: null };
  const fullTimerRef = { current: null };
  const handlers = [];
  scheduleFadeSteps(panelElement, slightTimerRef, fullTimerRef);
  bindWakeListeners(panelElement, slightTimerRef, fullTimerRef, handlers);
  return () => {
    if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
    if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
    unbindWakeListeners(handlers);
    panelElement.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  };
}
