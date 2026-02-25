export function applyMobileTooltipPosition(tooltipEl) {
  const partsPanel = document.getElementById("parts_section");
  const margin = 8;
  const sidePadding = 8;
  const gap = 8;

  const top = margin;

  const isPartsPanelOpen = partsPanel && !partsPanel.classList.contains("collapsed");
  const partsPanelWidth = isPartsPanelOpen && partsPanel
    ? partsPanel.getBoundingClientRect().width
    : 0;

  const leftPosition = isPartsPanelOpen
    ? partsPanelWidth + gap
    : sidePadding;

  const rightPadding = sidePadding;
  const viewportWidth = window.innerWidth;
  const maxWidth = viewportWidth - leftPosition - rightPadding;

  tooltipEl.style.left = `${leftPosition}px`;
  tooltipEl.style.right = `${rightPadding}px`;
  tooltipEl.style.width = "";
  tooltipEl.style.maxWidth = `${maxWidth}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.transform = "none";
  tooltipEl.style.boxSizing = "border-box";
}

export function clearDesktopTooltipPosition(tooltipEl) {
  tooltipEl.style.top = "";
  tooltipEl.style.left = "";
  tooltipEl.style.right = "";
  tooltipEl.style.transform = "";
}
