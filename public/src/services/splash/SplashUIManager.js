import { logger } from "../../utils/logger.js";
import { BaseComponent } from "../../components/BaseComponent.js";

export class SplashUIManager extends BaseComponent {
  constructor(refs) {
    super();
    this.statusElement = refs.statusElement;
    this.flavorElement = refs.flavorElement;
    this.splashScreen = refs.splashScreen;
    this.flavorInterval = null;
  }

  setRefs(refs) {
    this.statusElement = refs.statusElement;
    this.flavorElement = refs.flavorElement;
    this.splashScreen = refs.splashScreen;
  }

  updateStatus(message, flavorMessages) {
    if (!this.statusElement) {
      logger.log('warn', 'splash', 'Status element not ready, skipping update:', message);
      return;
    }
    this.statusElement.textContent = message;
    this.statusElement.classList.add("splash-element-visible");
    if (!this.flavorInterval && this.flavorElement) {
      this.startFlavorText(flavorMessages);
    }
  }

  startFlavorText(flavorMessages) {
    if (!this.flavorElement || this.flavorInterval) return;
    this.showRandomFlavorText(flavorMessages);
    this.flavorInterval = setInterval(() => this.showRandomFlavorText(flavorMessages), 3000);
  }

  showRandomFlavorText(flavorMessages) {
    if (!this.flavorElement || !flavorMessages?.length) return;
    const randomIndex = Math.floor(Math.random() * flavorMessages.length);
    this.flavorElement.textContent = flavorMessages[randomIndex];
    this.flavorElement.classList.remove("splash-element-hidden");
    this.flavorElement.classList.add("splash-element-visible");
  }

  stopFlavorText() {
    if (this.flavorInterval) {
      clearInterval(this.flavorInterval);
      this.flavorInterval = null;
    }
    if (this.flavorElement) {
      this.flavorElement.classList.remove("splash-element-visible");
      this.flavorElement.classList.add("splash-element-hidden");
    }
  }

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
