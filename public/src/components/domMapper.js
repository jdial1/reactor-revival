export function getRoot(selector) {
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

let _initPromise = null;

export async function init() {
  if (_initPromise) return _initPromise;
  if (document.readyState === "loading") {
    _initPromise = new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  } else {
    _initPromise = Promise.resolve();
  }
  return _initPromise;
}

if (typeof window !== "undefined") {
  window.domMapper = { getRoot, getSplashContainer, getWrapper, getReactor, init };
}

export default typeof window !== "undefined" ? window.domMapper : null;
