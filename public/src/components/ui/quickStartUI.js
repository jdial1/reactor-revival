import { html } from "lit-html";
import { MODAL_IDS } from "../ModalManager.js";

const accordionClick = (e) => {
  e.preventDefault();
  e.currentTarget.closest(".qs-accordion")?.classList.toggle("qs-accordion-expanded");
};

export const quickStartTemplate = (page, onClose, onMoreDetails, onBack) => html`
  <div class="quick-start-overlay" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div id="quick-start-page-1" class="quick-start-screen" style=${page === 1 ? "" : "display: none;"}>
      <div class="modal-swipe-handle" aria-hidden="true"></div>
      <div class="quick-start-header">
        <span>PROTOCOL_01</span>
        <span class="quick-start-version">v25.07</span>
      </div>
      <div class="bios-content">
        <div class="qs-section qs-accordion qs-accordion-expanded">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>1. OUTPUT CYCLE</div>
          <div class="qs-accordion-body">
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
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>2. MANUAL OVERRIDE</div>
          <div class="qs-accordion-body">
            <div class="qs-action-cards">
              <div class="qs-action-row qs-action-depressible">
                <span class="qs-action-icon qs-power"><img src="img/ui/icons/icon_power.png" alt="" class="qs-icon"></span>
                <span class="qs-action-arrow">▶</span>
                <span class="qs-action-result">SELL ($)</span>
              </div>
              <div class="qs-action-row qs-action-depressible">
                <span class="qs-action-icon qs-heat"><img src="img/ui/icons/icon_heat.png" alt="" class="qs-icon"></span>
                <span class="qs-action-arrow">▶</span>
                <span class="qs-action-result">VENT HEAT</span>
              </div>
            </div>
          </div>
        </div>
        <div class="qs-warning">Excess Heat causes Critical Failure.</div>
      </div>
      <footer class="qs-footer">
        <button type="button" class="qs-btn-primary" @click=${onClose}>INITIATE REACTOR</button>
        <button type="button" class="qs-btn-ghost" @click=${onMoreDetails}>READ FULL MANUAL</button>
      </footer>
    </div>
    <div id="quick-start-page-2" class="quick-start-screen" style=${page === 2 ? "" : "display: none;"}>
      <div class="modal-swipe-handle" aria-hidden="true"></div>
      <div class="quick-start-header">
        <span>OPERATOR_MANUAL</span>
        <span class="quick-start-version">v25.07</span>
      </div>
      <div class="bios-content">
        <div class="qs-section qs-accordion qs-accordion-expanded">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ FIRST STEPS ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Start with $10 - buy a <img src="img/parts/cells/cell_1_1.png" class="objective-part-icon" alt="Uranium Cell" title="Uranium Cell">URANIUM CELL</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Open Parts panel to find components</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Cells: Single, Dual, Quad configs</span></div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ POWER SYSTEM ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/ui/icons/icon_power.png" class="objective-part-icon" alt="POWER" title="POWER"><span class="qs-amber">POWER</span>: Generated by cells</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/capacitors/capacitor_1.png" class="objective-part-icon" alt="Capacitors" title="Capacitors">CAPACITORS increase storage</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Sell power before capacity fills!</span></div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ HEAT SYSTEM ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/ui/icons/icon_heat.png" class="objective-part-icon" alt="HEAT" title="HEAT"><span class="qs-orange">HEAT</span>: Also generated by cells</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/platings/plating_1.png" class="objective-part-icon" alt="Reactor Plating" title="Reactor Plating">Plating: Max Heat Up</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>200% heat = MELTDOWN!</span></div>
          </div>
        </div>
        <div class="qs-section qs-accordion">
          <div class="qs-section-head qs-accordion-head" role="button" tabindex="0" @click=${accordionClick} @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accordionClick(e); } }}>[ HEAT MANAGEMENT ]</div>
          <div class="quick-start-list qs-accordion-body">
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/vents/vent_1.png" class="objective-part-icon" alt="Heat Vent" title="Heat Vent">VENTS: Remove heat from components</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/exchangers/exchanger_1.png" class="objective-part-icon" alt="Heat Exchanger" title="Heat Exchanger">EXCHANGERS: Balance heat between parts</span></div>
            <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/coolants/coolant_cell_1.png" class="objective-part-icon" alt="Coolant Cell" title="Coolant Cell">COOLANT CELLS: Passive heat sinks</span></div>
          </div>
        </div>
      </div>
      <footer class="qs-footer">
        <button type="button" class="qs-btn-ghost" @click=${onBack}>BACK</button>
        <button type="button" class="qs-btn-primary" @click=${onClose}>INITIATE REACTOR</button>
      </footer>
    </div>
  </div>
`;

export class QuickStartUI {
  constructor(ui) {
    this.ui = ui;
  }

  addHelpButtonToMainPage() {
    const mainTopNav = this.ui.registry?.get?.("CoreLoop")?.getElement?.("main_top_nav") ?? this.ui.DOMElements?.main_top_nav;
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
