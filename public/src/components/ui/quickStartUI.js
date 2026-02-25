import { logger } from "../../utils/logger.js";
import { MODAL_IDS } from "../ModalManager.js";

export class QuickStartUI {
  constructor(ui) {
    this.ui = ui;
  }

  async showDetailedQuickStart() {
    try {
      const response = await fetch("pages/quick-start-modal.html");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const html = await response.text();
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = html;
      document.body.appendChild(modal);
      const page1 = document.getElementById("quick-start-page-1");
      const page2 = document.getElementById("quick-start-page-2");
      page1.classList.add("hidden");
      page2.classList.remove("hidden");
      document.getElementById("quick-start-more-details").onclick = () => {
        page1.classList.add("hidden");
        page2.classList.remove("hidden");
      };
      document.getElementById("quick-start-back").onclick = () => {
        page2.classList.add("hidden");
        page1.classList.remove("hidden");
      };
      const closeModal = () => modal.remove();
      document.getElementById("quick-start-close").onclick = closeModal;
      document.getElementById("quick-start-close-2").onclick = closeModal;
    } catch (error) {
      logger.error("Failed to load quick start modal:", error);
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = `
        <div class="quick-start-overlay">
          <div class="quick-start-screen">
            <div class="quick-start-header">[ REACTOR_BOOT_SEQ_v25 ]</div>
            <div class="bios-content">
              <div class="quick-start-section">
                <div class="quick-start-section-head">>> SYSTEM LOGIC</div>
                <div class="quick-start-list">
                  <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Follow objectives at screen top</span></div>
                </div>
              </div>
            </div>
            <footer class="bios-footer">
              <button type="button" id="quick-start-close-detailed-fallback" class="bios-btn quick-start-next-btn">INITIATE SEQUENCE ></button>
            </footer>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById("quick-start-close-detailed-fallback").onclick = () => modal.remove();
    }
  }

  addHelpButtonToMainPage() {
    const mainTopNav = this.ui.DOMElements?.main_top_nav;
    if (!mainTopNav) return;
    const helpButton = document.createElement("div");
    helpButton.className = "hidden";
    helpButton.title = "Getting Started Guide";
    helpButton.textContent = "?";
    helpButton.style.marginLeft = "8px";
    helpButton.onclick = async () => await this.ui.modalOrchestrator.showModal(MODAL_IDS.DETAILED_QUICK_START);
    const aboutButton = mainTopNav.querySelector("#about_toggle");
    if (aboutButton) mainTopNav.insertBefore(helpButton, aboutButton);
    else mainTopNav.appendChild(helpButton);
  }
}
