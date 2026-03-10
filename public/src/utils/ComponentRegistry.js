export class ComponentRegistry {
  constructor() {
    this._registry = new Map();
  }

  register(name, componentInstance) {
    this._registry.set(name, componentInstance);
  }

  get(name) {
    return this._registry.get(name);
  }

  unregister(name) {
    this._registry.delete(name);
  }
}
