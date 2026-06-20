import { render, html } from "lit-html";
import { subscribe, subscribeKey } from "../store.js";

const isTestEnv = () =>
  (typeof global !== "undefined" && global.__VITEST__) ||
  (typeof window !== "undefined" && window.__VITEST__);

function containerIdFrom(container) {
  if (typeof container === "string") return container;
  if (container == null) return null;
  try {
    return container.id || null;
  } catch {
    return null;
  }
}

function liveContainer(containerId) {
  if (!containerId || typeof document === "undefined") return null;
  const target = document.getElementById(containerId);
  return target?.isConnected ? target : null;
}

export class ReactiveLitComponent {
  static mount(state, renderFn, container, onAfterRender) {
    const containerId = containerIdFrom(container);
    let raf = null;

    const executeRender = () => {
      const target = liveContainer(containerId);
      if (!target) return;
      try {
        render(renderFn(state), target);
        onAfterRender?.();
      } catch (err) {
        const msg = String(err?.message ?? "");
        if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
        console.error("Lit render error:", err);
      }
    };

    const scheduleRender = () => {
      if (raf) return;
      if (isTestEnv()) {
        executeRender();
        return;
      }
      raf = requestAnimationFrame(() => {
        raf = null;
        executeRender();
      });
    };

    const unsubscribe = subscribe(state, scheduleRender);

    executeRender();

    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }

  static mountMultiStates(states, renderFn, container, onAfterRender) {
    const containerId = containerIdFrom(container);
    let raf = null;
    const executeRender = () => {
      const target = liveContainer(containerId);
      if (!target) return;
      try {
        render(renderFn(), target);
        onAfterRender?.();
      } catch (err) {
        const msg = String(err?.message ?? "");
        if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
        console.error("Lit render error:", err);
      }
    };
    const scheduleRender = () => {
      if (raf) return;
      if (isTestEnv()) {
        executeRender();
        return;
      }
      raf = requestAnimationFrame(() => {
        raf = null;
        executeRender();
      });
    };
    const unsubs = states.map((s) => subscribe(s, scheduleRender));
    executeRender();
    return () => {
      unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
      if (raf) cancelAnimationFrame(raf);
    };
  }

  constructor(state, stateKeys, renderFn, container) {
    this.state = state;
    this.stateKeys = Array.isArray(stateKeys) ? stateKeys : [stateKeys];
    this.renderFn = renderFn;
    this.containerId = containerIdFrom(container);
    this._unsubs = [];
    this._raf = null;
  }

  mount() {
    const scheduleRender = () => {
      if (this._raf) return;
      if (isTestEnv()) {
        this._render();
        return;
      }
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this._render();
      });
    };
    for (const key of this.stateKeys) {
      const unsub = subscribeKey(this.state, key, scheduleRender);
      this._unsubs.push(unsub);
    }
    this._render();
    return () => this.unmount();
  }

  _render() {
    const target = liveContainer(this.containerId);
    if (!target) {
      this.unmount();
      return;
    }
    try {
      const template = this.renderFn(this.state);
      if (template) render(template, target);
    } catch (err) {
      const msg = String(err?.message ?? "");
      if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) {
        return;
      }
      console.error("Lit render error:", err);
    }
  }

  unmount() {
    this._unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
    this._unsubs = [];
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  static mountMulti(subscriptions, renderFn, container, onAfterRender) {
    const containerId = containerIdFrom(container);
    let _raf = null;
    const scheduleRender = () => {
      if (_raf) return;
      const doRender = () => {
        const target = liveContainer(containerId);
        if (!target) return;
        try {
          const template = renderFn();
          if (template) render(template, target);
          onAfterRender?.();
        } catch (err) {
          const msg = String(err?.message ?? "");
          if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
          console.error("Lit render error:", err);
        }
      };
      if (isTestEnv()) {
        doRender();
        return;
      }
      _raf = requestAnimationFrame(() => {
        _raf = null;
        doRender();
      });
    };
    const unsubs = [];
    for (const { state, keys } of subscriptions) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        unsubs.push(subscribeKey(state, key, scheduleRender));
      }
    }
    const initialTarget = liveContainer(containerId);
    if (initialTarget) {
      try {
        const template = renderFn();
        if (template) render(template, initialTarget);
        onAfterRender?.();
      } catch (err) {
        const msg = String(err?.message ?? "");
        if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
        console.error("Lit render error:", err);
      }
    }
    return () => {
      unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
      if (_raf) cancelAnimationFrame(_raf);
    };
  }
}
