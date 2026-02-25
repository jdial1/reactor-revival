const FIELD_RULES = {
  required: {
    name: { type: 'string', minLength: 1 },
    short_name: { type: 'string', minLength: 1 },
    start_url: { type: 'string', minLength: 1 },
    icons: { type: 'array', minLength: 1 },
  },
  recommended: {
    background_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ },
    description: { type: 'string', minLength: 1 },
    display: { type: 'string', values: ['fullscreen', 'standalone', 'minimal-ui', 'browser'] },
    id: { type: 'string', minLength: 1 },
    launch_handler: { type: 'object' },
    orientation: { type: 'string', values: ['any', 'natural', 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'] },
    screenshots: { type: 'array', minLength: 1 },
    theme_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ },
  },
  optional: {
    categories: { type: 'array', minLength: 1 },
    dir: { type: 'string', values: ['ltr', 'rtl', 'auto'] },
    iarc_rating_id: { type: 'string', minLength: 1 },
    lang: { type: 'string', minLength: 1 },
    prefer_related_applications: { type: 'boolean' },
    related_applications: { type: 'array' },
    scope: { type: 'string', minLength: 1 },
  }
};

const ARRAY_HANDLER_RULES = [
  { key: 'file_handlers', requiredKeys: ['action', 'accept'] },
  { key: 'protocol_handlers', requiredKeys: ['protocol', 'url'] },
  { key: 'shortcuts', requiredKeys: ['name', 'url'] },
  { key: 'widgets', requiredKeys: [] },
];

const URL_RULES = [
  { key: 'start_url', check: v => v.startsWith('/'), msg: 'start_url should start with /' },
  { key: 'scope', check: v => v.startsWith('/'), msg: 'scope should start with /' },
];

const SENSITIVE_TERMS = ["password", "secret", "key", "token", "api"];

const SCORE_ERROR_WEIGHT = 3;
const SCORE_MAX_ISSUES = 50;

function validateFieldGroup(manifest, fields, severity, errors, warnings) {
  const collector = severity === 'error' ? errors : warnings;
  const label = severity === 'error' ? 'required' : 'recommended';

  for (const [field, rules] of Object.entries(fields)) {
    if (!manifest[field]) {
      if (severity === 'error') errors.push(`Missing required field: ${field}`);
      else if (severity !== 'skip') warnings.push(`Missing ${label} field: ${field}`);
      continue;
    }
    if (typeof manifest[field] !== rules.type) {
      collector.push(`Field ${field} ${severity === 'error' ? 'must' : 'should'} be a ${rules.type}`);
      continue;
    }
    if (rules.pattern && !rules.pattern.test(manifest[field])) {
      collector.push(`Field ${field} should match pattern: ${rules.pattern}`);
    }
    if (rules.values && !rules.values.includes(manifest[field])) {
      collector.push(`Field ${field} should be one of: ${rules.values.join(', ')}`);
    }
    if (rules.minLength && manifest[field].length < rules.minLength) {
      collector.push(`Field ${field} ${severity === 'error' ? 'must' : 'should'} have at least ${rules.minLength} character(s)`);
    }
  }
}

function validateIconRequirements(icons, errors, warnings) {
  if (!icons || !Array.isArray(icons)) return;

  const parsed = icons.map(icon => {
    const sizes = icon.sizes?.split("x") || [];
    return { width: parseInt(sizes[0]) || 0, height: parseInt(sizes[1]) || 0, purpose: icon.purpose || "any" };
  });

  const anyIcons = parsed.filter(i => i.purpose === "any");
  if (anyIcons.length === 0) warnings.push('No icons with purpose "any" found');

  const checkSize = (list, size, label, collector) => {
    if (!list.some(i => i.width >= size && i.height >= size)) {
      collector.push(`No icon with size ${size}x${size} or larger found for "${label}" purpose`);
    }
  };

  checkSize(anyIcons, 192, "any", errors);
  checkSize(anyIcons, 512, "any", errors);

  const maskable = parsed.filter(i => i.purpose === "maskable");
  if (maskable.length === 0) warnings.push('No maskable icons found');
  else checkSize(maskable, 192, "maskable", warnings);
}

function validateScreenshotRequirements(screenshots, warnings) {
  if (!screenshots || !Array.isArray(screenshots)) return;

  screenshots.forEach((s, i) => {
    if (!s.src) warnings.push(`screenshots[${i}] missing src field`);
    if (!s.sizes) warnings.push(`screenshots[${i}] missing sizes field`);
    if (!s.type) warnings.push(`screenshots[${i}] missing type field`);
  });

  if (!screenshots.some(s => s.form_factor === "wide")) warnings.push('No screenshots for wide form factor found');
  if (!screenshots.some(s => s.form_factor === "narrow")) warnings.push('No screenshots for narrow form factor found');
}

function validateArrayHandlers(manifest, warnings) {
  for (const { key, requiredKeys } of ARRAY_HANDLER_RULES) {
    if (!manifest[key]) continue;
    if (!Array.isArray(manifest[key])) {
      warnings.push(`${key} should be an array`);
      continue;
    }
    if (requiredKeys.length === 0) continue;
    manifest[key].forEach((item, i) => {
      const missing = requiredKeys.filter(k => !item[k]);
      if (missing.length) warnings.push(`${key}[${i}] missing required ${missing.join(' or ')} fields`);
    });
  }

  if (manifest.background_sync && typeof manifest.background_sync !== 'object') {
    warnings.push('background_sync should be an object');
  }
  if (manifest.share_target) {
    if (typeof manifest.share_target !== 'object') warnings.push('share_target should be an object');
    else if (!manifest.share_target.action) warnings.push('share_target missing required action field');
  }
}

function validateUrls(manifest, warnings) {
  for (const { key, check, msg } of URL_RULES) {
    if (manifest[key] && !check(manifest[key])) warnings.push(msg);
  }

  if (manifest.file_handlers) {
    manifest.file_handlers.forEach((h, i) => {
      if (h.action && !h.action.startsWith('/')) warnings.push(`file_handlers[${i}].action should start with /`);
    });
  }
  if (manifest.protocol_handlers) {
    manifest.protocol_handlers.forEach((h, i) => {
      if (h.url && !h.url.includes('%s')) warnings.push(`protocol_handlers[${i}].url should contain %s placeholder`);
    });
  }
}

function validateSecurity(manifest, warnings) {
  const str = JSON.stringify(manifest).toLowerCase();
  SENSITIVE_TERMS.forEach(term => {
    if (str.includes(term)) warnings.push(`Manifest contains potentially sensitive term: ${term}`);
  });
}

function calculateScore(errors, warnings) {
  const weighted = errors.length * SCORE_ERROR_WEIGHT + warnings.length;
  return Math.round(Math.max(0, 100 - (weighted / SCORE_MAX_ISSUES) * 100));
}

function isFieldValid(manifest, field) {
  const value = manifest[field];
  if (value == null) return false;
  const allRules = { ...FIELD_RULES.required, ...FIELD_RULES.recommended, ...FIELD_RULES.optional };
  const rules = allRules[field];
  if (!rules) return true;
  if (typeof value !== rules.type) return false;
  if (rules.pattern && !rules.pattern.test(value)) return false;
  if (rules.values && !rules.values.includes(value)) return false;
  if (rules.minLength && value.length < rules.minLength) return false;
  if (field === 'start_url' || field === 'scope') return typeof value === 'string' && value.startsWith('/');
  return true;
}

function getFieldGroupStatus(manifest, fields) {
  const status = {};
  for (const field of Object.keys(fields)) {
    status[field] = { present: !!manifest[field], valid: isFieldValid(manifest, field) };
  }
  return status;
}

export class ManifestValidator {
  constructor(manifest) {
    this.manifest = manifest;
    this.errors = [];
    this.warnings = [];
  }

  validate() {
    this.errors = [];
    this.warnings = [];

    validateFieldGroup(this.manifest, FIELD_RULES.required, 'error', this.errors, this.warnings);
    validateFieldGroup(this.manifest, FIELD_RULES.recommended, 'warning', this.errors, this.warnings);
    validateFieldGroup(this.manifest, FIELD_RULES.optional, 'skip', this.errors, this.warnings);
    validateArrayHandlers(this.manifest, this.warnings);
    validateIconRequirements(this.manifest.icons, this.errors, this.warnings);
    validateScreenshotRequirements(this.manifest.screenshots, this.warnings);
    validateUrls(this.manifest, this.warnings);
    validateSecurity(this.manifest, this.warnings);

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      score: calculateScore(this.errors, this.warnings),
    };
  }

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
        requiredFields: getFieldGroupStatus(this.manifest, FIELD_RULES.required),
        recommendedFields: getFieldGroupStatus(this.manifest, FIELD_RULES.recommended),
        optionalFields: getFieldGroupStatus(this.manifest, FIELD_RULES.optional),
      }
    };
  }
}

export async function validateManifestFromFile(filePath) {
  try {
    const fs = await import('fs');
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return new ManifestValidator(manifest).getReport();
  } catch (error) {
    return {
      isValid: false, score: 0,
      errors: [`Failed to load manifest: ${error.message}`], warnings: [],
      summary: { totalErrors: 1, totalWarnings: 0, requiredFields: {}, recommendedFields: {}, optionalFields: {} }
    };
  }
}

export function validateManifest(manifest) {
  return new ManifestValidator(manifest).getReport();
}
