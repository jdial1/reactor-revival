import { MODAL_IDS } from "../ModalManager.js";

export class ModalOrchestrationUI {
  constructor(ui) {
    this.ui = ui;
    this._contextModalHandler = null;
  }

  subscribeToContextModalEvents(game) {
    if (!game?.on) return;
    this._contextModalHandler = (payload) => this.ui.modalOrchestrator.showModal(MODAL_IDS.CONTEXT, payload);
    game.on("showContextModal", this._contextModalHandler);
  }

  unsubscribeContextModal(game) {
    if (game?.off && this._contextModalHandler) game.off("showContextModal", this._contextModalHandler);
    this._contextModalHandler = null;
  }

  showChapterCelebration(chapterIndex) {
    const names = ["First Fission", "Scaling Production", "High-Energy Systems", "The Experimental Frontier"];
    const name = names[chapterIndex] || `Chapter ${chapterIndex + 1}`;
    const overlay = document.createElement("div");
    overlay.className = "chapter-celebration-overlay";
    overlay.setAttribute("role", "alert");
    overlay.innerHTML = `<div class="chapter-celebration-content"><div class="chapter-celebration-badge">Chapter Complete</div><h2 class="chapter-celebration-title">${name}</h2></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("chapter-celebration-visible"));
    if (this.ui.game?.audio) this.ui.game.audio.play("upgrade");
    const t = setTimeout(() => {
      overlay.classList.remove("chapter-celebration-visible");
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 400);
    }, 3200);
    overlay._celebrationTimer = t;
  }

  initializeSellAllButton() {
    const sellAllBtn = document.getElementById("reactor_sell_all_btn");
    if (sellAllBtn) {
      sellAllBtn.onclick = () => {
        if (!this.ui.game || !this.ui.game.tileset) return;

        const wasPaused = this.ui.stateManager.getVar("pause");
        this.ui.stateManager.setVar("pause", true);

        const existingSummary = this.buildExistingPartSummary();

        let checkedTypes = {};
        existingSummary.forEach(item => { checkedTypes[item.id] = true; });

        this.ui.modalOrchestrator.showModal(MODAL_IDS.COPY_PASTE, {
          action: "sell",
          summary: existingSummary,
          checkedTypes,
          previousPauseState: wasPaused,
        });
      };
    }
  }

  buildExistingPartSummary() {
    const ui = this.ui;
    if (!ui.game || !ui.game.tileset || !ui.game.tileset.tiles_list) return [];

    const summary = {};
    ui.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) {
        const key = `${tile.part.id}|${tile.part.level || 1}`;
        if (!summary[key]) {
          summary[key] = {
            id: tile.part.id,
            type: tile.part.type,
            lvl: tile.part.level || 1,
            title: tile.part.title || tile.part.id,
            unitPrice: tile.part.cost,
            count: 0,
            total: 0,
            tileIds: []
          };
        }
        summary[key].count++;
        summary[key].total += tile.calculateSellValue?.() ?? tile.part.cost;
        summary[key].tileIds.push(tile.id);
      }
    });

    return Object.values(summary);
  }

  hideModal() {
    this.ui.modalOrchestrator.hideModal(MODAL_IDS.COPY_PASTE);
  }
}
