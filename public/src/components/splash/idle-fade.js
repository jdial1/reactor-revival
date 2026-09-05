import { setClassFlag } from "./dom-flags.js";

const FADE_SLIGHT_MS = 15000;
const FADE_FULL_MS = 30000;
const FADE_CLASS_SLIGHT = "splash-menu-fade-slight";
const FADE_CLASS_FULL = "splash-menu-fade-full";

function clearFadeClasses(panel) {
  setClassFlag(panel, FADE_CLASS_SLIGHT, false);
  setClassFlag(panel, FADE_CLASS_FULL, false);
}

function scheduleFadeSteps(panel, slightTimerRef, fullTimerRef) {
  if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
  if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
  clearFadeClasses(panel);
  slightTimerRef.current = setTimeout(() => {
    setClassFlag(panel, FADE_CLASS_SLIGHT, true);
    slightTimerRef.current = null;
  }, FADE_SLIGHT_MS);
  fullTimerRef.current = setTimeout(() => {
    setClassFlag(panel, FADE_CLASS_SLIGHT, false);
    setClassFlag(panel, FADE_CLASS_FULL, true);
    fullTimerRef.current = null;
  }, FADE_FULL_MS);
}

function bindWakeListeners(panel, slightTimerRef, fullTimerRef, ac) {
  const wake = () => {
    scheduleFadeSteps(panel, slightTimerRef, fullTimerRef);
  };
  const events = ["click", "touchstart", "pointerdown", "pointermove", "keydown"];
  const { signal } = ac;
  events.forEach((ev) => {
    const h = (e) => {
      if (ev === "pointermove" && e.buttons === 0) return;
      wake();
    };
    document.addEventListener(ev, h, { capture: true, passive: ev === "pointermove", signal });
  });
}

export function initSplashMenuIdleFade(panelElement) {
  if (!panelElement) return () => {};
  const slightTimerRef = { current: null };
  const fullTimerRef = { current: null };
  const ac = new AbortController();
  scheduleFadeSteps(panelElement, slightTimerRef, fullTimerRef);
  bindWakeListeners(panelElement, slightTimerRef, fullTimerRef, ac);
  return () => {
    if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
    if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
    ac.abort();
    clearFadeClasses(panelElement);
  };
}
