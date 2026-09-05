import { BaseComponent } from "../../dom/lit.js";
import { logger } from "../../core/logger.js";
import { setClassFlag } from "../../dom/class-flags.js";

export class SplashUIManager extends BaseComponent {
  constructor(refs) {
    super();
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  setRefs(refs) {
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  updateStatus(message) {
    if (!this.statusElement) {
      logger.log("warn", "splash", "Status element not ready, skipping update:", message);
      return;
    }
    this.statusElement.textContent = message;
    setClassFlag(this.statusElement, "splash-element-visible", true);
  }

  stopFlavorText() {}

  hide(onHidden) {
    if (!this.splashScreen) return;
    this.stopFlavorText();
    setClassFlag(this.splashScreen, "fade-out", true);
    setTimeout(() => {
      this.isVisible = false;
      this.setElementVisible(this.splashScreen, false);
      onHidden?.();
    }, 500);
  }

  show() {
    if (this.splashScreen) {
      this.isVisible = true;
      setClassFlag(this.splashScreen, "fade-out", false);
      this.setElementVisible(this.splashScreen, true);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isVisible = false;
      setClassFlag(this.splashScreen, "fade-out", true);
      this.setElementVisible(this.splashScreen, false);
    }
  }
}
