const SHOP_OVERLAY_PAGE_IDS = new Set([
  "upgrades_section",
  "experimental_upgrades_section",
]);

export function isShopOverlayPage(pageId) {
  return SHOP_OVERLAY_PAGE_IDS.has(pageId);
}

export function isSimVisiblePage(pageId) {
  return pageId === "reactor_section" || isShopOverlayPage(pageId);
}

export function getUiElement(_ui, id) {
  if (typeof document === "undefined") return null;
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function isDomElement(node) {
  return (
    node &&
    typeof node === "object" &&
    node.nodeType === 1 &&
    node.isConnected === true &&
    typeof node.appendChild === "function"
  );
}

export function isLitRenderContainer(node) {
  return isDomElement(node) && node.tagName !== "TEMPLATE";
}

export function dedupeReactorStatsDom() {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll("#reactor_stats");
  if (nodes.length <= 1) return nodes[0] ?? null;
  const keep =
    document.querySelector("#main_top_nav #reactor_stats") ??
    document.querySelector(".mobile-top-stats #reactor_stats") ??
    nodes[0];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] !== keep) nodes[i].remove();
  }
  return keep ?? null;
}

export function getPageReactor(ui) {
  return getUiElement(ui, "reactor");
}

export function getPageReactorWrapper(ui) {
  return getUiElement(ui, "reactor_wrapper");
}

export function getPageReactorBackground(ui) {
  return getUiElement(ui, "reactor_background");
}
