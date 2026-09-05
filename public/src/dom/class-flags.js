// className helpers. These were re-implemented byte-identically in four
// modules; this is the single copy.

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
