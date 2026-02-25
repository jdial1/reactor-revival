export function bindEvents(container, eventMap, { signal } = {}) {
  const addOpts = signal ? { signal } : {};
  for (const [selector, config] of Object.entries(eventMap)) {
    const handlers = typeof config === "function" ? { click: config } : config;
    const elements = container.querySelectorAll(selector);
    elements.forEach((el) => {
      for (const [eventType, fn] of Object.entries(handlers)) {
        el.addEventListener(eventType, fn, addOpts);
      }
    });
  }
}
