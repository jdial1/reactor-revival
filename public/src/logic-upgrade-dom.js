export {
  computeAffordable,
  computeAffordProgress,
  getAffordanceFlags,
  runCheckAffordability,
  setUpgradeCardRefreshHandler,
} from "./bridge/bridge-upgrades.js";

export { bindPartElement, getPartElement } from "./components/presentation.js";

export function queryUpgradeElement(upgrade) {
  if (typeof document === "undefined" || !upgrade?.id) return null;
  const id = String(upgrade.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  for (const container of document.querySelectorAll(".upgrade-group")) {
    if (!container.isConnected) continue;
    const page = container.closest(".page");
    if (!page || page.classList.contains("hidden")) continue;
    const live = container.querySelector(`[data-id="${id}"]`);
    if (live?.nodeType === 1) return live;
  }
  return null;
}
