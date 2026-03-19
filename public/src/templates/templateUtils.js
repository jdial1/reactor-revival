function escapeTemplateValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function interpolateTemplate(template, values = {}) {
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => escapeTemplateValue(values[key]));
}
