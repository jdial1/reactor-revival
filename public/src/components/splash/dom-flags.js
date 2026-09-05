import { getUiElement } from "../shell/page-dom.js";

// Small className helpers shared by the splash components.
export function firstByClass(root, className) {
  if (!root) return null;
  return root.getElementsByClassName(className)[0] ?? null;
}

export function forEachByClass(root, className, fn) {
  if (!root) return;
  const list = root.getElementsByClassName(className);
  for (let i = 0; i < list.length; i++) fn(list[i]);
}

export function setClassFlag(el, className, on) {
  if (!el) return;
  const re = new RegExp(`\\b${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  const base = el.className.replace(re, "").replace(/\s+/g, " ").trim();
  el.className = on ? (base ? `${base} ${className}` : className) : base;
}

export function resolveIdSelector(sel) {
  if (typeof sel === "string" && sel.startsWith("#") && !/[\s>+~[:.]/.test(sel.slice(1))) {
    return getUiElement(null, sel.slice(1));
  }
  return null;
}
