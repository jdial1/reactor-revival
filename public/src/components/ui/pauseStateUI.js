export class PauseStateUI {
  constructor(ui) {
    this.ui = ui;
  }

  updatePauseState() {
    if (!this.ui.stateManager) return;
    const statePaused = this.ui.stateManager.getVar("pause");
    const isPaused = statePaused === undefined ? !!this.ui.game?.paused : !!statePaused;
    if (this.ui.uiState) this.ui.uiState.is_paused = !!isPaused;
    const doc = (typeof globalThis !== "undefined" && globalThis.document) || (typeof document !== "undefined" && document);
    if (doc?.body) doc.body.classList.toggle("game-paused", !!isPaused);
    if (isPaused) {
      const unpauseBtn = document.getElementById("unpause_btn");
      if (unpauseBtn && !unpauseBtn.hasAttribute("data-listener-added")) {
        unpauseBtn.addEventListener("click", () => {
          this.ui.stateManager.setVar("pause", false);
        });
        unpauseBtn.setAttribute("data-listener-added", "true");
      }
    }
  }
}
