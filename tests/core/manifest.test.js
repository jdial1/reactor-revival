import { describe, it, expect, beforeEach, fs, path } from "../helpers/setup.js";

describe("Manifest Validation", () => {
    let manifest;

    beforeEach(() => {
        const manifestPath = path.resolve(__dirname, "../../public/manifest.json");
        const manifestContent = fs.readFileSync(manifestPath, "utf-8");
        manifest = JSON.parse(manifestContent);
    });

    describe("Required Fields", () => {
        it("should have a name field", () => {
            expect(manifest.name).toBeDefined();
            expect(typeof manifest.name).toBe("string");
            expect(manifest.name.length).toBeGreaterThan(0);
        });

        it("should have a short_name field", () => {
            expect(manifest.short_name).toBeDefined();
            expect(typeof manifest.short_name).toBe("string");
            expect(manifest.short_name.length).toBeGreaterThan(0);
        });

        it("should have a start_url field", () => {
            expect(manifest.start_url).toBeDefined();
            expect(typeof manifest.start_url).toBe("string");
            expect(manifest.start_url.length).toBeGreaterThan(0);
        });

        it("should have an icons field", () => {
            expect(manifest.icons).toBeDefined();
            expect(Array.isArray(manifest.icons)).toBe(true);
            expect(manifest.icons.length).toBeGreaterThan(0);
        });

        it("should have suitable icons with proper sizes", () => {
            const iconSizes = manifest.icons.map(icon => {
                const sizes = icon.sizes?.split("x") || [];
                return {
                    width: parseInt(sizes[0]) || 0,
                    height: parseInt(sizes[1]) || 0,
                    purpose: icon.purpose || "any"
                };
            });

            // Check for at least one icon with purpose "any"
            const anyPurposeIcons = iconSizes.filter(icon => icon.purpose === "any");
            expect(anyPurposeIcons.length).toBeGreaterThan(0);

            // Check for appropriate icon sizes (at least 192x192 and 512x512)
            const has192Icon = anyPurposeIcons.some(icon =>
                icon.width >= 192 && icon.height >= 192
            );
            const has512Icon = anyPurposeIcons.some(icon =>
                icon.width >= 512 && icon.height >= 512
            );

            expect(has192Icon).toBe(true);
            expect(has512Icon).toBe(true);
        });
    });

    describe("Recommended Fields", () => {
        it("should have a hex encoded background_color", () => {
            expect(manifest.background_color).toBeDefined();
            expect(typeof manifest.background_color).toBe("string");
            expect(manifest.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });

        it("should have a description field", () => {
            expect(manifest.description).toBeDefined();
            expect(typeof manifest.description).toBe("string");
            expect(manifest.description.length).toBeGreaterThan(0);
        });

        it("should have a display field", () => {
            expect(manifest.display).toBeDefined();
            expect(typeof manifest.display).toBe("string");
            const validDisplays = ["standalone", "minimal-ui", "browser"];
            expect(validDisplays).toContain(manifest.display);
        });

        it("should have an app ID", () => {
            expect(manifest.id).toBeDefined();
            expect(typeof manifest.id).toBe("string");
            expect(manifest.id.length).toBeGreaterThan(0);
        });

        it("should have a launch_handler field", () => {
            expect(manifest.launch_handler).toBeDefined();
            expect(typeof manifest.launch_handler).toBe("object");
            expect(manifest.launch_handler.client_mode).toBeDefined();
            expect(Array.isArray(manifest.launch_handler.client_mode)).toBe(true);
        });

        it("should have an orientation field", () => {
            expect(manifest.orientation).toBeDefined();
            expect(typeof manifest.orientation).toBe("string");
            const validOrientations = [
                "any", "natural", "landscape", "portrait",
                "portrait-primary", "portrait-secondary",
                "landscape-primary", "landscape-secondary"
            ];
            expect(validOrientations).toContain(manifest.orientation);
        });

        it("should have a screenshots field", () => {
            expect(manifest.screenshots).toBeDefined();
            expect(Array.isArray(manifest.screenshots)).toBe(true);
            expect(manifest.screenshots.length).toBeGreaterThan(0);
        });

        it("should have a hex encoded theme_color", () => {
            expect(manifest.theme_color).toBeDefined();
            expect(typeof manifest.theme_color).toBe("string");
            expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
    });

    describe("Optional Fields", () => {
        it("should have categories field", () => {
            expect(manifest.categories).toBeDefined();
            expect(Array.isArray(manifest.categories)).toBe(true);
            expect(manifest.categories.length).toBeGreaterThan(0);
        });

        it("should specify a default direction of text", () => {
            expect(manifest.dir).toBeDefined();
            expect(typeof manifest.dir).toBe("string");
            const validDirections = ["ltr", "rtl", "auto"];
            expect(validDirections).toContain(manifest.dir);
        });

        it("should have iarc_rating_id field", () => {
            expect(manifest.iarc_rating_id).toBeDefined();
            expect(typeof manifest.iarc_rating_id).toBe("string");
            expect(manifest.iarc_rating_id.length).toBeGreaterThan(0);
        });

        it("should specify a language", () => {
            expect(manifest.lang).toBeDefined();
            expect(typeof manifest.lang).toBe("string");
            expect(manifest.lang.length).toBeGreaterThan(0);
        });

        it("should properly set prefer_related_applications field", () => {
            expect(manifest.prefer_related_applications).toBeDefined();
            expect(typeof manifest.prefer_related_applications).toBe("boolean");
        });

        it("should have related_applications field", () => {
            expect(manifest.related_applications).toBeDefined();
            expect(Array.isArray(manifest.related_applications)).toBe(true);
        });

        it("should have scope field", () => {
            expect(manifest.scope).toBeDefined();
            expect(typeof manifest.scope).toBe("string");
            expect(manifest.scope.length).toBeGreaterThan(0);
        });
    });

    describe("Advanced PWA Features", () => {
        it("should have file_handlers for .reactor files", () => {
            expect(manifest.file_handlers).toBeDefined();
            expect(Array.isArray(manifest.file_handlers)).toBe(true);

            const reactorHandler = manifest.file_handlers.find(handler =>
                handler.accept && handler.accept["application/json"]
            );
            expect(reactorHandler).toBeDefined();
            expect(reactorHandler.accept["application/json"]).toContain(".reactor");
        });

        it("should have protocol_handlers for web+reactor", () => {
            expect(manifest.protocol_handlers).toBeDefined();
            expect(Array.isArray(manifest.protocol_handlers)).toBe(true);

            const reactorProtocol = manifest.protocol_handlers.find(handler =>
                handler.protocol === "web+reactor"
            );
            expect(reactorProtocol).toBeDefined();
        });

        it("should have shortcuts for quick actions", () => {
            expect(manifest.shortcuts).toBeDefined();
            expect(Array.isArray(manifest.shortcuts)).toBe(true);
            expect(manifest.shortcuts.length).toBeGreaterThan(0);

            const newGameShortcut = manifest.shortcuts.find(shortcut =>
                shortcut.name === "Start New Game"
            );
            expect(newGameShortcut).toBeDefined();
        });

        it("should have widgets configuration", () => {
            expect(manifest.widgets).toBeDefined();
            expect(Array.isArray(manifest.widgets)).toBe(true);
            expect(manifest.widgets.length).toBeGreaterThan(0);
        });

        it("should have background_sync configuration", () => {
            expect(manifest.background_sync).toBeDefined();
            expect(typeof manifest.background_sync).toBe("object");
            expect(manifest.background_sync.periodic).toBe(true);
        });

        it("should have share_target configuration", () => {
            expect(manifest.share_target).toBeDefined();
            expect(typeof manifest.share_target).toBe("object");
            expect(manifest.share_target.action).toBeDefined();
            expect(manifest.share_target.method).toBe("POST");
        });
    });

    describe("Icon Validation", () => {
        it("should have maskable icons", () => {
            const maskableIcons = manifest.icons.filter(icon =>
                icon.purpose === "maskable"
            );
            expect(maskableIcons.length).toBeGreaterThan(0);

            // Check for appropriate maskable icon sizes
            const maskableSizes = maskableIcons.map(icon => {
                const sizes = icon.sizes?.split("x") || [];
                return {
                    width: parseInt(sizes[0]) || 0,
                    height: parseInt(sizes[1]) || 0
                };
            });

            const hasAppropriateMaskableIcon = maskableSizes.some(icon =>
                icon.width >= 192 && icon.height >= 192
            );
            expect(hasAppropriateMaskableIcon).toBe(true);
        });

        it("should have platform-specific icons", () => {
            const iosIcons = manifest.icons.filter(icon =>
                icon.platform === "ios"
            );
            expect(iosIcons.length).toBeGreaterThan(0);
        });

        it("should have form_factor specific icons", () => {
            const wideIcons = manifest.icons.filter(icon =>
                icon.form_factor === "wide"
            );
            expect(wideIcons.length).toBeGreaterThan(0);
        });
    });

    describe("Screenshot Validation", () => {
        it("should have screenshots for different form factors", () => {
            const wideScreenshots = manifest.screenshots.filter(screenshot =>
                screenshot.form_factor === "wide"
            );
            const narrowScreenshots = manifest.screenshots.filter(screenshot =>
                screenshot.form_factor === "narrow"
            );

            expect(wideScreenshots.length).toBeGreaterThan(0);
            expect(narrowScreenshots.length).toBeGreaterThan(0);
        });

        it("should have proper screenshot metadata", () => {
            manifest.screenshots.forEach(screenshot => {
                expect(screenshot.src).toBeDefined();
                expect(screenshot.sizes).toBeDefined();
                expect(screenshot.type).toBeDefined();
                expect(screenshot.label).toBeDefined();
            });
        });
    });

    describe("JSON Schema Validation", () => {
        it("should be valid JSON", () => {
            expect(() => JSON.parse(JSON.stringify(manifest))).not.toThrow();
        });

        it("should not have circular references", () => {
            const hasCircularReference = (obj, seen = new WeakSet()) => {
                if (obj !== null && typeof obj === "object") {
                    if (seen.has(obj)) {
                        return true;
                    }
                    seen.add(obj);
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            if (hasCircularReference(obj[key], seen)) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            };

            expect(hasCircularReference(manifest)).toBe(false);
        });
    });

    describe("URL Validation", () => {
        it("should have valid start_url", () => {
            expect(manifest.start_url).toMatch(/^\//);
        });

        it("should have valid scope", () => {
            expect(manifest.scope).toMatch(/^\//);
        });

        it("should have valid file handler action", () => {
            manifest.file_handlers.forEach(handler => {
                expect(handler.action).toMatch(/^\//);
            });
        });

        it("should have valid protocol handler URL", () => {
            manifest.protocol_handlers.forEach(handler => {
                expect(handler.url).toMatch(/^\/.*%s$/);
            });
        });
    });

    describe("Content Security", () => {
        it("should not contain sensitive information in manifest", () => {
            const manifestString = JSON.stringify(manifest).toLowerCase();
            const sensitiveTerms = ["password", "secret", "key", "token", "api"];

            sensitiveTerms.forEach(term => {
                expect(manifestString).not.toContain(term);
            });
        });
    });
}); 