export class BaseComponent {
  constructor() {
    this.isVisible = false;
  }

  teardown() {}
  show() {}
  hide() {}

  setElementVisible(el, visible) {
    if (!el?.classList) return;
    el.classList.toggle("hidden", !visible);
  }

  removeOverlay(el) {
    if (el) el.remove();
    return null;
  }
}
