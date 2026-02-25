export class GameEventDispatcher {
  constructor(logger) {
    this._listeners = new Map();
    this._logger = logger;
  }

  on(eventName, handler) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, []);
    this._listeners.get(eventName).push(handler);
  }

  off(eventName, handler) {
    const list = this._listeners.get(eventName);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }

  emit(eventName, payload) {
    const list = this._listeners.get(eventName);
    if (!list) return;
    list.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        this._logger?.warn?.(`[Game] Event handler error for "${eventName}":`, err);
      }
    });
  }
}
