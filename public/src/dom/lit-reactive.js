import { render } from "lit-html";
import { subscribe, subscribeKey } from "../store.js";
import { isTestEnv } from "../simUtils.js";

function bindContainerKey(container) {
  if (typeof container === "string") return container;
  if (container == null) return null;
  if (typeof container === "object" && typeof container.id === "string" && container.id) {
    return container.id;
  }
  if (typeof container === "object" && typeof container.nodeType === "number" && container.nodeType === 1) {
    const id = `lit-host-${Math.random().toString(36).slice(2, 11)}`;
    container.id = id;
    return id;
  }
  return null;
}

function isValidRenderTarget(node) {
  return (
    node &&
    typeof node === "object" &&
    node.nodeType === 1 &&
    node.tagName !== "TEMPLATE" &&
    typeof node.appendChild === "function" &&
    node.isConnected === true
  );
}

function resolveLiveContainer(containerKey) {
  if (typeof document === "undefined" || containerKey == null) return null;
  try {
    const node = document.getElementById(containerKey) ?? null;
    return isValidRenderTarget(node) ? node : null;
  } catch {
    return null;
  }
}

function isIgnorableLitRenderError(err) {
  const msg = String(err?.message ?? "");
  if (msg.includes("Illegal invocation")) return true;
  if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return true;
  if (msg.includes("null") && msg.includes("setting 'data'")) return true;
  return msg.includes("HTMLTemplateElement");
}

function scheduleLitRender(executeRender, rafRef) {
  if (rafRef.current) return;
  if (isTestEnv()) {
    executeRender();
    return;
  }
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = null;
    executeRender();
  });
}

export function bindLitRender(state, renderFn, container, onAfterRender) {
  const containerKey = bindContainerKey(container);
  const rafRef = { current: null };

  const executeRender = () => {
    const target = resolveLiveContainer(containerKey);
    if (!target) return;
    try {
      render(renderFn(state), target);
      onAfterRender?.();
    } catch (err) {
      if (isIgnorableLitRenderError(err)) return;
      console.error("Lit render error:", err);
    }
  };

  const scheduleRender = () => scheduleLitRender(executeRender, rafRef);
  const unsubscribe = subscribe(state, scheduleRender);
  executeRender();

  return () => {
    unsubscribe();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}

export function bindLitRenderMultiStates(states, renderFn, container, onAfterRender) {
  const containerKey = bindContainerKey(container);
  const rafRef = { current: null };

  const executeRender = () => {
    const target = resolveLiveContainer(containerKey);
    if (!target) return;
    try {
      render(renderFn(), target);
      onAfterRender?.();
    } catch (err) {
      if (isIgnorableLitRenderError(err)) return;
      console.error("Lit render error:", err);
    }
  };

  const scheduleRender = () => scheduleLitRender(executeRender, rafRef);
  const unsubs = states.map((s) => subscribe(s, scheduleRender));
  executeRender();

  return () => {
    unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}

export function bindLitRenderMulti(subscriptions, renderFn, container, onAfterRender) {
  const containerKey = bindContainerKey(container);
  const rafRef = { current: null };

  const executeRender = () => {
    const target = resolveLiveContainer(containerKey);
    if (!target) return;
    try {
      const template = renderFn();
      if (template) render(template, target);
      onAfterRender?.();
    } catch (err) {
      if (isIgnorableLitRenderError(err)) return;
      console.error("Lit render error:", err);
    }
  };

  const scheduleRender = () => scheduleLitRender(executeRender, rafRef);
  const unsubs = [];
  for (const { state, keys } of subscriptions) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      unsubs.push(subscribeKey(state, key, scheduleRender));
    }
  }

  const initialTarget = resolveLiveContainer(containerKey);
  if (initialTarget) executeRender();

  return () => {
    unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}

export function bindLitRenderKeyed(state, stateKeys, renderFn, container) {
  const keys = Array.isArray(stateKeys) ? stateKeys : [stateKeys];
  return bindLitRenderMulti([{ state, keys }], () => renderFn(state), container);
}
