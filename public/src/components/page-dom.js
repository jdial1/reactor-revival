export const SHOP_OVERLAY_PAGE_IDS = new Set([
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

export function isLitRenderContainer(node) {
  return isDomElement(node) && node.tagName !== "TEMPLATE";
}

export function isDomElement(node) {
  return (
    node &&
    typeof node === "object" &&
    node.nodeType === 1 &&
    node.isConnected === true &&
    typeof node.appendChild === "function"
  );
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

export function getRoot(selector) {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector);
}

export function getSplashContainer() {
  return getRoot("#splash-container");
}

export function getWrapper() {
  return getRoot("#wrapper");
}

export function getReactor() {
  return getRoot("#reactor");
}

let _domMapperInitPromise = null;

export async function initDomMapper() {
  if (_domMapperInitPromise) return _domMapperInitPromise;
  if (typeof document === "undefined") {
    _domMapperInitPromise = Promise.resolve();
    return _domMapperInitPromise;
  }
  if (document.readyState === "loading") {
    _domMapperInitPromise = new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  } else {
    _domMapperInitPromise = Promise.resolve();
  }
  return _domMapperInitPromise;
}

export const domMapper = {
  getRoot,
  getSplashContainer,
  getWrapper,
  getReactor,
  init: initDomMapper,
};

export default domMapper;
