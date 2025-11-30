import { describe, it, expect, beforeEach, setupGameWithDOM } from "../helpers/setup.js";
import { TemplateLoader } from "../../public/src/services/templateLoader.js";

describe("TemplateLoader", () => {
    let templateLoader;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        document = setup.document;
        templateLoader = setup.window.templateLoader; 
    });

    it("should load templates from HTML string", () => {
        const html = `<template id="test-template"><div class="test">Content</div></template>`;
        templateLoader.parseAndStoreTemplates(html);
        expect(templateLoader.templates.has("test-template")).toBe(true);
    });

    it("should clone template content", () => {
        const html = `<template id="test-template"><div class="test">Content</div></template>`;
        templateLoader.parseAndStoreTemplates(html);
        const clone = templateLoader.cloneTemplate("test-template");
        expect(clone).toBeDefined();
        expect(clone.querySelector(".test").textContent).toBe("Content");
    });

    it("should modify element properties with helper methods", () => {
        const el = document.createElement("div");
        el.innerHTML = `<span class="target">Original</span>`;
        
        templateLoader.setText(el, ".target", "Updated");
        expect(el.querySelector(".target").textContent).toBe("Updated");

        templateLoader.setVisible(el, ".target", false);
        expect(el.querySelector(".target").style.display).toBe("none");
    });
});

