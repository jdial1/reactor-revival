export class PauseStateUI {
  constructor(ui) {
    this.ui = ui;
  }

  updatePauseState() {
    if (typeof document === "undefined" || !document.body?.classList) return;
    if (!this.ui.stateManager) return;
    const statePaused = this.ui.stateManager.getVar("pause");
    const isPaused = statePaused === undefined ? !!this.ui.game?.paused : !!statePaused;
    const cls = document.body.classList;
    const isPauseClassPresent = typeof cls.contains === "function" ? cls.contains("game-paused") : (document.body.className || "").includes("game-paused");
    if (isPaused && !isPauseClassPresent) {
      document.body.classList.add("game-paused");
    } else if (!isPaused && isPauseClassPresent) {
      document.body.classList.remove("game-paused");
    }
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
