import { subscribe } from "valtio/vanilla";
import { teardownAll } from "../core/teardown.js";

export function derive(entries, { proxy: target }) {
  const derivedKeys = Object.keys(entries);
  const get = (obj) => obj;
  const recompute = () => {
    for (let i = 0; i < derivedKeys.length; i++) {
      const key = derivedKeys[i];
      target[key] = entries[key](get);
    }
  };
  recompute();
  const unsubs = [];
  unsubs.push(subscribe(target, (ops) => {
    if (ops.every((op) => op[1].length === 1 && derivedKeys.includes(op[1][0]))) return;
    recompute();
  }));
  target._deriveTeardown = () => {
    teardownAll(unsubs);
    unsubs.length = 0;
  };
  return target;
}
