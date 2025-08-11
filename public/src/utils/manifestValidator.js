/**
 * Manifest Validation Utility
 * Provides comprehensive validation for PWA manifest.json files
 */

export class ManifestValidator {
    constructor(manifest) {
        this.manifest = manifest;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Validate all manifest fields and return results
     */
    validate() {
        this.errors = [];
        this.warnings = [];

        this.validateRequiredFields();
        this.validateRecommendedFields();
        this.validateOptionalFields();
        this.validateAdvancedFeatures();
        this.validateIcons();
        this.validateScreenshots();
        this.validateUrls();
        this.validateSecurity();

        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            score: this.calculateScore()
        };
    }

    /**
     * Validate required PWA manifest fields
     */
    validateRequiredFields() {
        const required = {
            name: { type: 'string', minLength: 1 },
            short_name: { type: 'string', minLength: 1 },
            start_url: { type: 'string', minLength: 1 },
            icons: { type: 'array', minLength: 1 }
        };

        for (const [field, rules] of Object.entries(required)) {
            if (!this.manifest[field]) {
                this.errors.push(`Missing required field: ${field}`);
                continue;
            }

            if (typeof this.manifest[field] !== rules.type) {
                this.errors.push(`Field ${field} must be a ${rules.type}`);
                continue;
            }

            if (rules.type === 'string' && this.manifest[field].length < rules.minLength) {
                this.errors.push(`Field ${field} must have at least ${rules.minLength} character(s)`);
            }

            if (rules.type === 'array' && this.manifest[field].length < rules.minLength) {
                this.errors.push(`Field ${field} must have at least ${rules.minLength} item(s)`);
            }
        }

        // Validate icon sizes
        if (this.manifest.icons && Array.isArray(this.manifest.icons)) {
            this.validateIconSizes();
        }
    }

    /**
     * Validate recommended PWA manifest fields
     */
    validateRecommendedFields() {
        const recommended = {
            background_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ },
            description: { type: 'string', minLength: 1 },
            display: { type: 'string', values: ['fullscreen', 'standalone', 'minimal-ui', 'browser'] },
            id: { type: 'string', minLength: 1 },
            launch_handler: { type: 'object' },
            orientation: { type: 'string', values: ['any', 'natural', 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'] },
            screenshots: { type: 'array', minLength: 1 },
            theme_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ }
        };

        for (const [field, rules] of Object.entries(recommended)) {
            if (!this.manifest[field]) {
                this.warnings.push(`Missing recommended field: ${field}`);
                continue;
            }

            if (typeof this.manifest[field] !== rules.type) {
                this.warnings.push(`Field ${field} should be a ${rules.type}`);
                continue;
            }

            if (rules.pattern && !rules.pattern.test(this.manifest[field])) {
                this.warnings.push(`Field ${field} should match pattern: ${rules.pattern}`);
            }

            if (rules.values && !rules.values.includes(this.manifest[field])) {
                this.warnings.push(`Field ${field} should be one of: ${rules.values.join(', ')}`);
            }

            if (rules.minLength && this.manifest[field].length < rules.minLength) {
                this.warnings.push(`Field ${field} should have at least ${rules.minLength} character(s)`);
            }
        }
    }

    /**
     * Validate optional PWA manifest fields
     */
    validateOptionalFields() {
        const optional = {
            categories: { type: 'array', minLength: 1 },
            dir: { type: 'string', values: ['ltr', 'rtl', 'auto'] },
            iarc_rating_id: { type: 'string', minLength: 1 },
            lang: { type: 'string', minLength: 1 },
            prefer_related_applications: { type: 'boolean' },
            related_applications: { type: 'array' },
            scope: { type: 'string', minLength: 1 }
        };

        for (const [field, rules] of Object.entries(optional)) {
            if (!this.manifest[field]) {
                continue; // Optional fields are not required
            }

            if (typeof this.manifest[field] !== rules.type) {
                this.warnings.push(`Field ${field} should be a ${rules.type}`);
                continue;
            }

            if (rules.values && !rules.values.includes(this.manifest[field])) {
                this.warnings.push(`Field ${field} should be one of: ${rules.values.join(', ')}`);
            }

            if (rules.minLength && this.manifest[field].length < rules.minLength) {
                this.warnings.push(`Field ${field} should have at least ${rules.minLength} character(s)`);
            }
        }
    }

    /**
     * Validate advanced PWA features
     */
    validateAdvancedFeatures() {
        // File handlers
        if (this.manifest.file_handlers) {
            if (!Array.isArray(this.manifest.file_handlers)) {
                this.warnings.push('file_handlers should be an array');
            } else {
                this.manifest.file_handlers.forEach((handler, index) => {
                    if (!handler.action || !handler.accept) {
                        this.warnings.push(`file_handlers[${index}] missing required action or accept fields`);
                    }
                });
            }
        }

        // Protocol handlers
        if (this.manifest.protocol_handlers) {
            if (!Array.isArray(this.manifest.protocol_handlers)) {
                this.warnings.push('protocol_handlers should be an array');
            } else {
                this.manifest.protocol_handlers.forEach((handler, index) => {
                    if (!handler.protocol || !handler.url) {
                        this.warnings.push(`protocol_handlers[${index}] missing required protocol or url fields`);
                    }
                });
            }
        }

        // Shortcuts
        if (this.manifest.shortcuts) {
            if (!Array.isArray(this.manifest.shortcuts)) {
                this.warnings.push('shortcuts should be an array');
            } else {
                this.manifest.shortcuts.forEach((shortcut, index) => {
                    if (!shortcut.name || !shortcut.url) {
                        this.warnings.push(`shortcuts[${index}] missing required name or url fields`);
                    }
                });
            }
        }

        // Widgets
        if (this.manifest.widgets) {
            if (!Array.isArray(this.manifest.widgets)) {
                this.warnings.push('widgets should be an array');
            }
        }

        // Background sync
        if (this.manifest.background_sync) {
            if (typeof this.manifest.background_sync !== 'object') {
                this.warnings.push('background_sync should be an object');
            }
        }

        // Share target
        if (this.manifest.share_target) {
            if (typeof this.manifest.share_target !== 'object') {
                this.warnings.push('share_target should be an object');
            } else if (!this.manifest.share_target.action) {
                this.warnings.push('share_target missing required action field');
            }
        }
    }

    /**
     * Validate icon configuration
     */
    validateIcons() {
        if (!this.manifest.icons || !Array.isArray(this.manifest.icons)) {
            return;
        }

        const iconSizes = this.manifest.icons.map(icon => {
            const sizes = icon.sizes?.split("x") || [];
            return {
                width: parseInt(sizes[0]) || 0,
                height: parseInt(sizes[1]) || 0,
                purpose: icon.purpose || "any"
            };
        });

        // Check for any purpose icons
        const anyPurposeIcons = iconSizes.filter(icon => icon.purpose === "any");
        if (anyPurposeIcons.length === 0) {
            this.warnings.push('No icons with purpose "any" found');
        }

        // Check for appropriate sizes
        const has192Icon = anyPurposeIcons.some(icon => icon.width >= 192 && icon.height >= 192);
        const has512Icon = anyPurposeIcons.some(icon => icon.width >= 512 && icon.height >= 512);

        if (!has192Icon) {
            this.warnings.push('No icon with size 192x192 or larger found for "any" purpose');
        }
        if (!has512Icon) {
            this.warnings.push('No icon with size 512x512 or larger found for "any" purpose');
        }

        // Check for maskable icons
        const maskableIcons = iconSizes.filter(icon => icon.purpose === "maskable");
        if (maskableIcons.length === 0) {
            this.warnings.push('No maskable icons found');
        } else {
            const hasAppropriateMaskableIcon = maskableIcons.some(icon =>
                icon.width >= 192 && icon.height >= 192
            );
            if (!hasAppropriateMaskableIcon) {
                this.warnings.push('No maskable icon with size 192x192 or larger found');
            }
        }
    }

    /**
     * Validate icon sizes specifically
     */
    validateIconSizes() {
        const iconSizes = this.manifest.icons.map(icon => {
            const sizes = icon.sizes?.split("x") || [];
            return {
                width: parseInt(sizes[0]) || 0,
                height: parseInt(sizes[1]) || 0,
                purpose: icon.purpose || "any"
            };
        });

        const anyPurposeIcons = iconSizes.filter(icon => icon.purpose === "any");
        const has192Icon = anyPurposeIcons.some(icon => icon.width >= 192 && icon.height >= 192);
        const has512Icon = anyPurposeIcons.some(icon => icon.width >= 512 && icon.height >= 512);

        if (!has192Icon) {
            this.errors.push('No icon with size 192x192 or larger found for "any" purpose');
        }
        if (!has512Icon) {
            this.errors.push('No icon with size 512x512 or larger found for "any" purpose');
        }
    }

    /**
     * Validate screenshots
     */
    validateScreenshots() {
        if (!this.manifest.screenshots || !Array.isArray(this.manifest.screenshots)) {
            return;
        }

        this.manifest.screenshots.forEach((screenshot, index) => {
            if (!screenshot.src) {
                this.warnings.push(`screenshots[${index}] missing src field`);
            }
            if (!screenshot.sizes) {
                this.warnings.push(`screenshots[${index}] missing sizes field`);
            }
            if (!screenshot.type) {
                this.warnings.push(`screenshots[${index}] missing type field`);
            }
        });

        // Check for different form factors
        const wideScreenshots = this.manifest.screenshots.filter(s => s.form_factor === "wide");
        const narrowScreenshots = this.manifest.screenshots.filter(s => s.form_factor === "narrow");

        if (wideScreenshots.length === 0) {
            this.warnings.push('No screenshots for wide form factor found');
        }
        if (narrowScreenshots.length === 0) {
            this.warnings.push('No screenshots for narrow form factor found');
        }
    }

    /**
     * Validate URLs
     */
    validateUrls() {
        if (this.manifest.start_url && !this.manifest.start_url.startsWith('/')) {
            this.warnings.push('start_url should start with /');
        }

        if (this.manifest.scope && !this.manifest.scope.startsWith('/')) {
            this.warnings.push('scope should start with /');
        }

        if (this.manifest.file_handlers) {
            this.manifest.file_handlers.forEach((handler, index) => {
                if (handler.action && !handler.action.startsWith('/')) {
                    this.warnings.push(`file_handlers[${index}].action should start with /`);
                }
            });
        }

        if (this.manifest.protocol_handlers) {
            this.manifest.protocol_handlers.forEach((handler, index) => {
                if (handler.url && !handler.url.includes('%s')) {
                    this.warnings.push(`protocol_handlers[${index}].url should contain %s placeholder`);
                }
            });
        }
    }

    /**
     * Validate security aspects
     */
    validateSecurity() {
        const manifestString = JSON.stringify(this.manifest).toLowerCase();
        const sensitiveTerms = ["password", "secret", "key", "token", "api"];

        sensitiveTerms.forEach(term => {
            if (manifestString.includes(term)) {
                this.warnings.push(`Manifest contains potentially sensitive term: ${term}`);
            }
        });
    }

    /**
     * Calculate a validation score (0-100)
     */
    calculateScore() {
        const totalChecks = this.errors.length + this.warnings.length;
        if (totalChecks === 0) return 100;

        const errorWeight = 3; // Errors are 3x more important than warnings
        const weightedErrors = this.errors.length * errorWeight;
        const weightedWarnings = this.warnings.length;
        const totalWeightedIssues = weightedErrors + weightedWarnings;

        // Base score calculation (assuming ~50 total possible issues)
        const maxPossibleIssues = 50;
        const score = Math.max(0, 100 - (totalWeightedIssues / maxPossibleIssues) * 100);

        return Math.round(score);
    }

    /**
     * Get a summary report
     */
    getReport() {
        const validation = this.validate();

        return {
            isValid: validation.isValid,
            score: validation.score,
            errors: validation.errors,
            warnings: validation.warnings,
            summary: {
                totalErrors: validation.errors.length,
                totalWarnings: validation.warnings.length,
                requiredFields: this.getRequiredFieldsStatus(),
                recommendedFields: this.getRecommendedFieldsStatus(),
                optionalFields: this.getOptionalFieldsStatus()
            }
        };
    }

    /**
     * Get status of required fields
     */
    getRequiredFieldsStatus() {
        const required = ['name', 'short_name', 'start_url', 'icons'];
        const status = {};

        required.forEach(field => {
            status[field] = {
                present: !!this.manifest[field],
                valid: this.isFieldValid(field, 'required')
            };
        });

        return status;
    }

    /**
     * Get status of recommended fields
     */
    getRecommendedFieldsStatus() {
        const recommended = ['background_color', 'description', 'display', 'id', 'launch_handler', 'orientation', 'screenshots', 'theme_color'];
        const status = {};

        recommended.forEach(field => {
            status[field] = {
                present: !!this.manifest[field],
                valid: this.isFieldValid(field, 'recommended')
            };
        });

        return status;
    }

    /**
     * Get status of optional fields
     */
    getOptionalFieldsStatus() {
        const optional = ['categories', 'dir', 'iarc_rating_id', 'lang', 'prefer_related_applications', 'related_applications', 'scope'];
        const status = {};

        optional.forEach(field => {
            status[field] = {
                present: !!this.manifest[field],
                valid: this.isFieldValid(field, 'optional')
            };
        });

        return status;
    }

    /**
     * Check if a specific field is valid
     */
    isFieldValid(field, category) {
        if (!this.manifest[field]) {
            return category === 'required' ? false : true; // Optional fields can be missing
        }

        // Basic type checking
        const fieldValue = this.manifest[field];

        switch (field) {
            case 'name':
            case 'short_name':
            case 'description':
            case 'id':
            case 'lang':
            case 'iarc_rating_id':
                return typeof fieldValue === 'string' && fieldValue.length > 0;

            case 'start_url':
            case 'scope':
                return typeof fieldValue === 'string' && fieldValue.length > 0 && fieldValue.startsWith('/');

            case 'background_color':
            case 'theme_color':
                return typeof fieldValue === 'string' && /^#[0-9A-Fa-f]{6}$/.test(fieldValue);

            case 'display':
                return ['fullscreen', 'standalone', 'minimal-ui', 'browser'].includes(fieldValue);

            case 'orientation':
                return ['any', 'natural', 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'].includes(fieldValue);

            case 'dir':
                return ['ltr', 'rtl', 'auto'].includes(fieldValue);

            case 'icons':
            case 'screenshots':
            case 'categories':
            case 'related_applications':
                return Array.isArray(fieldValue) && fieldValue.length > 0;

            case 'prefer_related_applications':
                return typeof fieldValue === 'boolean';

            case 'launch_handler':
                return typeof fieldValue === 'object' && fieldValue !== null;

            default:
                return true;
        }
    }
}

/**
 * Static utility function to validate a manifest from file path
 */
export async function validateManifestFromFile(filePath) {
    try {
        const fs = await import('fs');
        const manifestContent = fs.readFileSync(filePath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        const validator = new ManifestValidator(manifest);
        return validator.getReport();
    } catch (error) {
        return {
            isValid: false,
            score: 0,
            errors: [`Failed to load manifest: ${error.message}`],
            warnings: [],
            summary: {
                totalErrors: 1,
                totalWarnings: 0,
                requiredFields: {},
                recommendedFields: {},
                optionalFields: {}
            }
        };
    }
}

/**
 * Static utility function to validate a manifest object
 */
export function validateManifest(manifest) {
    const validator = new ManifestValidator(manifest);
    return validator.getReport();
} 