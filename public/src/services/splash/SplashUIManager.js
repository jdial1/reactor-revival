import { logger } from "../../utils/logger.js";
import { BaseComponent } from "../../components/BaseComponent.js";

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
      logger.log('warn', 'splash', 'Status element not ready, skipping update:', message);
      return;
    }
    this.statusElement.textContent = message;
    this.statusElement.classList.add("splash-element-visible");
  }

  stopFlavorText() {}

  hide(onHidden) {
    if (!this.splashScreen) return;
    this.stopFlavorText();
    this.splashScreen.classList.add("fade-out");
    setTimeout(() => {
      this.isVisible = false;
      this.setElementVisible(this.splashScreen, false);
      onHidden?.();
    }, 500);
  }

  show() {
    if (this.splashScreen) {
      this.isVisible = true;
      this.splashScreen.classList.remove("fade-out");
      this.setElementVisible(this.splashScreen, true);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isVisible = false;
      this.splashScreen.classList.add("fade-out");
      this.setElementVisible(this.splashScreen, false);
    }
  }
}
