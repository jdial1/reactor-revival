import { html } from "lit-html";
import { calculateSectionCounts } from "../../../core/upgradeset/sectionCountCalculator.js";
import { ReactiveLitComponent } from "../../ReactiveLitComponent.js";

export function updateSectionCountsState(ui, game) {
  if (!ui?.uiState || !game?.upgradeset) return;
  const sections = calculateSectionCounts(game.upgradeset);
  const counts = {};
  sections.forEach((s) => {
    counts[s.name] = { researched: s.researched, total: s.total };
  });
  ui.uiState.section_counts = counts;
}

function mountSectionCountsForWrapper(ui, wrapperId) {
  if (typeof document === "undefined") return [];
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper?.isConnected) return [];
  const h2s = wrapper.querySelectorAll("h2[data-section-name]");
  const unmounts = [];
  h2s.forEach((h2) => {
    const sectionName = h2.getAttribute("data-section-name");
    if (!sectionName) return;
    let countSpan = h2.querySelector(".section-count");
    if (!countSpan) {
      countSpan = document.createElement("span");
      countSpan.className = "section-count";
      h2.appendChild(countSpan);
    }
    const renderFn = () => {
      const section = ui.uiState?.section_counts?.[sectionName] ?? { researched: 0, total: 0 };
      return html` ${section.researched}/${section.total}`;
    };
    unmounts.push(
      ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["section_counts"] }],
        renderFn,
        countSpan
      )
    );
  });
  return unmounts;
}

export function mountSectionCountsReactive(ui, wrapperId) {
  if (!ui?.uiState) return () => {};
  const ids = wrapperId
    ? [wrapperId]
    : ["upgrades_content_wrapper", "experimental_upgrades_content_wrapper"];
  const unmounts = ids.flatMap((id) => mountSectionCountsForWrapper(ui, id));
  return () => unmounts.forEach((fn) => { try { fn(); } catch (_) {} });
}
