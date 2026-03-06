import { render, html } from "lit-html";
import { subscribe, subscribeKey } from "../core/store.js";

const isTestEnv = () =>
  (typeof global !== "undefined" && global.__VITEST__) ||
  (typeof window !== "undefined" && window.__VITEST__);

export class ReactiveLitComponent {
  static mount(state, renderFn, container) {
    let raf = null;

    const executeRender = () => {
      if (!container?.isConnected) return;
      try {
        render(renderFn(state), container);
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

  constructor(state, stateKeys, renderFn, container) {
    this.state = state;
    this.stateKeys = Array.isArray(stateKeys) ? stateKeys : [stateKeys];
    this.renderFn = renderFn;
    this.container = container;
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
    if (!this.container?.isConnected) {
      this.unmount();
      return;
    }
    try {
      const template = this.renderFn(this.state);
      if (template) render(template, this.container);
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

  static mountMulti(subscriptions, renderFn, container) {
    let _raf = null;
    const scheduleRender = () => {
      if (_raf) return;
      const doRender = () => {
        if (!container?.isConnected) return;
        try {
          const template = renderFn();
          if (template) render(template, container);
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
    if (container?.isConnected) {
      try {
        const template = renderFn();
        if (template) render(template, container);
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
