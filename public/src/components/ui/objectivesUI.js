export class ObjectivesUI {
  constructor(ui, controller = null) {
    this.ui = ui;
    this.controller = controller;
  }

  updateObjectiveDisplay() {
    if (this.controller) return this.controller.updateDisplay();
  }

  animateObjectiveCompletion() {
    if (this.controller) return this.controller.animateCompletion();
  }

  showObjectivesForPage(pageId) {
    if (this.controller) return this.controller.showForPage(pageId);
  }

  setupObjectivesListeners() {
    if (this.controller) return this.controller.setupListeners();
  }
}
