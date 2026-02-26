export class ObjectivesUI {
  constructor(ui, controller = null) {
    this.ui = ui;
    this.controller = controller;
  }

  updateObjectiveDisplay() {
    if (this.controller) return this.controller.updateDisplay();
  }

  updateObjectiveDisplayFromState() {
    if (this.controller) return this.controller.updateDisplayFromState();
  }

  animateObjectiveCompletion() {
    if (this.controller) return this.controller.animateCompletion();
  }

  showObjectivesForPage(pageId) {
    if (this.ui?.uiState) this.ui.uiState.active_page = pageId;
    if (this.controller) return this.controller.showForPage(pageId);
  }

  setupObjectivesListeners() {
    if (this.controller) return this.controller.setupListeners();
  }
}
