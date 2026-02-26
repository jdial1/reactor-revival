/**
 * @deprecated Migrating to lit-html. DO NOT DELETE until consumers are migrated:
 * - tooltip.js: cloneTemplate("tooltip-body-template") -> migrate to lit-html tooltip template
 * - gameSetupFlow.js: cloneTemplateElement("game-setup-template") -> migrate to lit-html game setup template
 * - public/components/templates.html: can be deleted only after above migrations complete
 */
import { logger } from "../utils/logger.js";

export class TemplateLoader {
  constructor() {
    this.templates = new Map();
    this.loaded = false;
  }

  /**
   * Load all template files
   */
  async loadTemplates() {
    if (this.loaded) return;

    try {
      const response = await fetch("components/templates.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();
      this.parseAndStoreTemplates(html);
      this.loaded = true;
    } catch (error) {
      logger.log('error', 'data', 'Failed to load templates:', error);
    }
  }

  parseAndStoreTemplates(html) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const templates = tempDiv.querySelectorAll("template");
    templates.forEach((template) => {
      if (template.id) {
        this.templates.set(template.id, template);
      }
    });
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  /**
   * Clone a template and return the element
   */
  cloneTemplate(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      logger.log('warn', 'data', `Template not found: ${templateId}`);
      return null;
    }
    return template.content.cloneNode(true);
  }

  /**
   * Clone a template and return the first element
   */
  cloneTemplateElement(templateId) {
    const clone = this.cloneTemplate(templateId);
    if (!clone) return null;
    const element = clone.firstElementChild;
    if (!element) {
      logger.log('warn', 'data', `No element found in template: ${templateId}`);
      return null;
    }
    return element;
  }

  /**
   * Set text content for an element within a template
   */
  setText(element, selector, text) {
    const target = element.querySelector(selector);
    if (target) {
      target.textContent = text;
    }
  }

  /**
   * Set attribute for an element within a template
   */
  setAttribute(element, selector, attribute, value) {
    const target = element.querySelector(selector);
    if (target) {
      target.setAttribute(attribute, value);
    }
  }

  /**
   * Set data attribute for an element within a template
   */
  setData(element, selector, dataAttr, value) {
    const target = element.querySelector(selector);
    if (target) {
      target.dataset[dataAttr] = value;
    }
  }

  /**
   * Set style property for an element within a template
   */
  setStyle(element, selector, property, value) {
    const target = element.querySelector(selector);
    if (target) {
      target.style[property] = value;
    }
  }

  /**
   * Show/hide an element within a template
   */
  setVisible(element, selector, visible) {
    const target = element.querySelector(selector);
    if (target) {
      target.style.display = visible ? "" : "none";
    }
  }

  /**
   * Add event listener to an element within a template
   */
  addEventListener(element, selector, event, handler) {
    const target = element.querySelector(selector);
    if (target) {
      target.addEventListener(event, handler);
    }
  }
}

// Create global instance
if (typeof window !== "undefined") {
    window.templateLoader = new TemplateLoader();
}
