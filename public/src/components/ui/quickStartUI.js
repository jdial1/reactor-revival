import { html, render } from "lit-html";
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
      const bindAccordions = (container) => {
        container?.querySelectorAll(".qs-accordion").forEach((section) => {
          const head = section.querySelector(".qs-accordion-head");
          if (head) {
            head.addEventListener("click", () => section.classList.toggle("qs-accordion-expanded"));
            head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); section.classList.toggle("qs-accordion-expanded"); } });
          }
        });
      };
      bindAccordions(page1);
      bindAccordions(page2);
    } catch (error) {
      logger.error("Failed to load quick start modal:", error);
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      const onClose = () => modal.remove();
      render(html`
        <div class="quick-start-overlay">
          <div class="quick-start-screen">
            <div class="quick-start-header">PROTOCOL_01</div>
            <div class="bios-content">
              <div class="qs-section">
                <div class="qs-section-head">1. OUTPUT CYCLE</div>
                <div class="qs-flow">
                  <div class="qs-flow-diagram">
                    <span class="qs-flow-icon qs-flow-fuel"><img src="img/parts/cells/cell_1_1.png" alt="FUEL" class="qs-icon"></span>
                    <span class="qs-flow-arrow">▶</span>
                    <span class="qs-flow-icon qs-flow-power"><img src="img/ui/icons/icon_power.png" alt="POWER" class="qs-icon"></span>
                    <span class="qs-flow-plus">+</span>
                    <span class="qs-flow-icon qs-flow-heat"><img src="img/ui/icons/icon_heat.png" alt="HEAT" class="qs-icon"></span>
                  </div>
                  <div class="qs-flow-caption">Generates Power & Heat</div>
                </div>
              </div>
              <div class="qs-section">
                <div class="qs-section-head">2. MANUAL OVERRIDE</div>
                <div class="qs-action-cards">
                  <div class="qs-action-row">
                    <span class="qs-action-label">TAP</span>
                    <span class="qs-action-icon qs-power"><img src="img/ui/icons/icon_power.png" alt="" class="qs-icon"></span>
                    <span class="qs-action-arrow">▶</span>
                    <span class="qs-action-result">SELL ($)</span>
                  </div>
                  <div class="qs-action-row">
                    <span class="qs-action-label">TAP</span>
                    <span class="qs-action-icon qs-heat"><img src="img/ui/icons/icon_heat.png" alt="" class="qs-icon"></span>
                    <span class="qs-action-arrow">▶</span>
                    <span class="qs-action-result">VENT HEAT</span>
                  </div>
                </div>
              </div>
              <div class="qs-warning">Excess Heat causes Critical Failure.</div>
            </div>
            <footer class="qs-footer">
              <button type="button" class="qs-btn-primary" @click=${onClose}>INITIATE REACTOR</button>
            </footer>
          </div>
        </div>
      `, modal);
      document.body.appendChild(modal);
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
