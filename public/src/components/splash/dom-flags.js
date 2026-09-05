import { getUiElement } from "../shell/page-dom.js";


export function resolveIdSelector(sel) {
  if (typeof sel === "string" && sel.startsWith("#") && !/[\s>+~[:.]/.test(sel.slice(1))) {
    return getUiElement(null, sel.slice(1));
  }
  return null;
}
