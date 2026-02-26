import { render } from "lit-html";
import { subscribeKey } from "../core/store.js";

export class ReactiveLitComponent {
  constructor(state, stateKeys, renderFn, container) {
    this.state = state;
    this.stateKeys = Array.isArray(stateKeys) ? stateKeys : [stateKeys];
    this.renderFn = renderFn;
    this.container = container;
    this._unsubs = [];
  }

  mount() {
    const scheduleRender = () => {
      if (this._raf) return;
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
    if (!this.container?.isConnected) return;
    try {
      const template = this.renderFn(this.state);
      if (template) render(template, this.container);
    } catch (_) {}
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
      _raf = requestAnimationFrame(() => {
        _raf = null;
        if (!container?.isConnected) return;
        try {
          const template = renderFn();
          if (template) render(template, container);
        } catch (_) {}
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
      } catch (_) {}
    }
    return () => {
      unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
      if (_raf) cancelAnimationFrame(_raf);
    };
  }
}
