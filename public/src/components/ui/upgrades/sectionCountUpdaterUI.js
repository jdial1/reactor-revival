import { calculateSectionCounts } from "../../../core/upgradeset/sectionCountCalculator.js";

export function renderSectionCounts(game) {
  if (typeof document === "undefined" || !game?.upgradeset) return;
  const sections = calculateSectionCounts(game.upgradeset);
  sections.forEach((section) => {
    const wrapper = section.isResearch
      ? document.getElementById("experimental_upgrades_content_wrapper")
      : document.getElementById("upgrades_content_wrapper");
    if (!wrapper) return;
    const article = Array.from(wrapper.querySelectorAll("article")).find((art) => {
      const h2 = art.querySelector("h2");
      if (!h2) return false;
      let headerText = h2.textContent.trim();
      const countSpan = h2.querySelector(".section-count");
      if (countSpan) headerText = headerText.replace(countSpan.textContent, "").trim();
      return headerText === section.name;
    });
    if (article) {
      const h2 = article.querySelector("h2");
      if (!h2) return;
      let countSpan = h2.querySelector(".section-count");
      if (!countSpan) {
        countSpan = document.createElement("span");
        countSpan.className = "section-count";
        h2.appendChild(countSpan);
      }
      countSpan.textContent = ` ${section.researched}/${section.total}`;
    }
  });
}
