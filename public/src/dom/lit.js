import { render as litRender } from "../../lib/lit-html.js";
import { classMap as litClassMap } from "../../lib/lit-class-map.js";
import { styleMap as litStyleMap } from "../../lib/lit-style-map.js";
import { repeat as litRepeat } from "../../lib/lit-repeat.js";
import { when as litWhen } from "../../lib/lit-when.js";
import { unsafeHTML as litUnsafeHTML } from "../../lib/lit-unsafe-html.js";

export const render = litRender;
export const classMap = litClassMap;
export const styleMap = litStyleMap;
export const repeat = litRepeat;
export const when = litWhen;
export const unsafeHTML = litUnsafeHTML;

export function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

export function bindEvents(container, eventMap, { signal } = {}) {
  const owned = !signal;
  const controller = owned ? new AbortController() : null;
  const addOpts = { signal: signal ?? controller.signal };
  for (const [selector, config] of Object.entries(eventMap)) {
    const handlers = typeof config === "function" ? { click: config } : config;
    const elements = container.querySelectorAll(selector);
    elements.forEach((el) => { for (const [eventType, fn] of Object.entries(handlers)) el.addEventListener(eventType, fn, addOpts); });
  }
  if (owned) return () => controller.abort();
}

export const on = (parentElement, selector, eventType, handler) => {
  if (!parentElement) return () => {};
  const listener = (event) => {
    const targetElement = event.target.closest(selector);
    if (targetElement && parentElement.contains(targetElement)) handler.call(targetElement, event);
  };
  parentElement.addEventListener(eventType, listener);
  return () => parentElement.removeEventListener(eventType, listener);
};

export function resolveDomElement(node, fallbackId = null) {
  if (typeof document === "undefined") return null;
  let id = fallbackId;
  if (!id && node != null) {
    try {
      id = node.id;
    } catch {
      id = null;
    }
  }
  if (typeof id === "string" && id) return document.getElementById(id);
  return null;
}

export function getDomElementById(id) {
  if (!id || typeof document === "undefined") return null;
  return document.getElementById(id);
}

export class BaseComponent {
  constructor() {
    this.isVisible = false;
    this.teardown = () => {};
    this.show = () => {};
    this.hide = () => {};
  }
  setElementVisible(el, visible) {
    if (!el?.classList) return;
    el.classList.toggle("hidden", !visible);
  }
  removeOverlay(el) {
    if (el) el.remove();
    return null;
  }
}

export const performance = (typeof window !== 'undefined' && window.performance) || { now: () => new Date().getTime() };

export function getBasePath() {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) return '';
  try {
    const isGitHubPages = window.location.hostname && window.location.hostname.includes('github.io');
    if (isGitHubPages && window.location.pathname) {
      const pathParts = window.location.pathname.split('/');
      const repoName = pathParts.length > 1 && pathParts[1] ? pathParts[1] : '';
      return repoName ? `/${repoName}` : '';
    }
  } catch (_) {}
  return '';
}

export function getResourceUrl(resourcePath) {
  const basePath = getBasePath();
  if (resourcePath.startsWith('/')) return `${basePath}${resourcePath}`;
  return `${basePath}/${resourcePath}`;
}
