import fs from "fs";
import path from "path";
import crypto from "crypto";

export function normalizeCssText(text) {
  return text.replace(/\s+/g, " ").trim();
}

export function ruleFingerprint(selector, body, media = null) {
  const payload = `${media ?? ""}|${normalizeCssText(selector)}|${normalizeCssText(body)}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseCssBlocks(css) {
  const rules = [];
  let index = 0;

  function skipWhitespace() {
    while (index < css.length && /\s/.test(css[index])) index += 1;
  }

  function readBlock() {
    if (css[index] !== "{") return "";
    index += 1;
    let depth = 1;
    const start = index;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    return css.slice(start, index - 1).trim();
  }

  function readPrelude() {
    const start = index;
    while (index < css.length && css[index] !== "{") index += 1;
    return css.slice(start, index).trim();
  }

  while (index < css.length) {
    skipWhitespace();
    if (index >= css.length) break;
    if (css[index] === "@") {
      const prelude = readPrelude();
      const block = readBlock();
      if (prelude.startsWith("@media")) {
        rules.push(
          ...parseCssBlocks(block).map((rule) => ({
            ...rule,
            media: prelude.replace(/^@media\s*/i, "").trim(),
          }))
        );
      }
      continue;
    }
    const selector = readPrelude();
    const body = readBlock();
    if (!selector || !body) continue;
    for (const part of selector.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      rules.push({ selector: trimmed, body, media: null });
    }
  }

  return rules;
}

export function loadCssCorpus(cssDirs, { exclude = [] } = {}) {
  const excludeSet = new Set(exclude);
  const corpus = [];
  for (const dir of cssDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".css") && !excludeSet.has(name))) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      corpus.push({ file, source: dir, content, rules: parseCssBlocks(content) });
    }
  }
  return corpus;
}

export function buildRuleIndex(corpus) {
  const byFingerprint = new Map();
  const bySelector = new Map();
  for (const entry of corpus) {
    for (const rule of entry.rules) {
      const fp = ruleFingerprint(rule.selector, rule.body, rule.media);
      if (!byFingerprint.has(fp)) {
        byFingerprint.set(fp, { ...rule, file: entry.file, source: entry.source });
      }
      const selectorKey = normalizeCssText(rule.selector);
      if (!bySelector.has(selectorKey)) bySelector.set(selectorKey, []);
      bySelector.get(selectorKey).push({ ...rule, file: entry.file, source: entry.source });
    }
  }
  return { byFingerprint, bySelector };
}

export function selectorMatchesClass(selector, className) {
  const pattern = new RegExp(`\\.${escapeRegExp(className)}(?:[\\s,:.#\\[#>+~)]|$)`);
  return pattern.test(selector);
}

export function selectorMatchesId(selector, id) {
  const pattern = new RegExp(`#${escapeRegExp(id)}(?:[\\s,.:#\\[#>+~)]|$)`);
  return pattern.test(selector);
}

export function findRulesForClass(className, corpus) {
  const matches = [];
  for (const entry of corpus) {
    for (const rule of entry.rules) {
      if (selectorMatchesClass(rule.selector, className)) {
        matches.push({ ...rule, file: entry.file, source: entry.source });
      }
    }
  }
  return matches;
}

export function findRulesForId(id, corpus) {
  const matches = [];
  for (const entry of corpus) {
    for (const rule of entry.rules) {
      if (selectorMatchesId(rule.selector, id)) {
        matches.push({ ...rule, file: entry.file, source: entry.source });
      }
    }
  }
  return matches;
}

export function ruleExistsInIndex(rule, index) {
  const fp = ruleFingerprint(rule.selector, rule.body, rule.media);
  return index.byFingerprint.has(fp);
}

export function classCoveredInCorpus(className, corpus) {
  const pattern = new RegExp(`\\.${escapeRegExp(className)}(?:[\\s,{:.\\[#>+~]|$)`);
  for (const entry of corpus) {
    if (pattern.test(entry.content)) return true;
  }
  return false;
}

export function importantizeDeclaration(declaration) {
  const trimmed = declaration.trim().replace(/;\s*$/, "");
  if (!trimmed) return trimmed;
  if (/!important\s*$/i.test(trimmed)) return trimmed;
  return `${trimmed} !important`;
}

export function importantizeBody(body) {
  return body
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => importantizeDeclaration(part))
    .join("; ");
}

export function formatRuleBodyLines(body, indent = "  ") {
  return importantizeBody(body)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${indent}${part};`)
    .join("\n");
}

export function importantizeProdFixesCssContent(content) {
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith("/*") ||
        trimmed.endsWith("{") ||
        trimmed === "}" ||
        trimmed.startsWith("@")
      ) {
        return line;
      }
      if (/^[\w-]+\s*:/.test(trimmed) && !/!important/i.test(trimmed)) {
        return line.replace(/;\s*$/, " !important;");
      }
      return line;
    })
    .join("\n");
}

export function formatRuleBlock(rule) {
  const body = formatRuleBodyLines(rule.body);
  if (rule.media) {
    return `@media ${rule.media} {\n  ${rule.selector} {\n${body}\n  }\n}`;
  }
  return `${rule.selector} {\n${body}\n}`;
}

export function formatPageSection(resolutionKey, targetName, rules) {
  if (!rules.length) {
    return `\n/* === ${resolutionKey} / ${targetName} (no new rules) === */\n`;
  }
  const blocks = rules.map((rule) => formatRuleBlock(rule));
  return `\n/* === ${resolutionKey} / ${targetName} (+${rules.length} rules) === */\n${blocks.join("\n\n")}\n`;
}

export function dedupeRules(rules) {
  const seen = new Map();
  for (const rule of rules) {
    const fp = ruleFingerprint(rule.selector, rule.body, rule.media);
    if (!seen.has(fp)) seen.set(fp, rule);
  }
  return [...seen.values()];
}

export function sectionMarker(resolutionKey, targetName) {
  return `/* === ${resolutionKey} / ${targetName}`;
}

export function pageMarker(targetName) {
  return `/* --- ${targetName} --- */`;
}

export function buildProdFixesHeader(sourceUrl, ruleCount = 0, inProgress = true) {
  const lines = [
    "/* prod_fixes.css — production alignment overrides (auto-generated) */",
    `/* source: ${sourceUrl} */`,
    `/* rules: ${ruleCount}${inProgress ? " (in progress)" : ""} */`,
    "/* Run: npm run ui:prod-fixes */",
    "/* All declarations use !important to override local cascade */",
    "/* Reset file: PROD_FIXES_FRESH=1 npm run ui:prod-fixes */",
  ];
  return `${lines.join("\n")}\n`;
}

export function mergeRulesToCss(rules, headerComment) {
  const mediaGroups = new Map();
  const baseRules = [];

  for (const rule of rules) {
    if (rule.media) {
      if (!mediaGroups.has(rule.media)) mediaGroups.set(rule.media, []);
      mediaGroups.get(rule.media).push(rule);
    } else {
      baseRules.push(rule);
    }
  }

  const sections = [headerComment, ""];
  for (const rule of baseRules) {
    sections.push(formatRuleBlock(rule), "");
  }
  for (const [media, grouped] of [...mediaGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    sections.push(`@media ${media} {`);
    for (const rule of grouped) {
      sections.push(`  ${rule.selector} {`, formatRuleBodyLines(rule.body, "    "), "  }", "");
    }
    sections.push("}", "");
  }
  return `${sections.join("\n").trim()}\n`;
}

export const STYLE_PROPS = [
  "display",
  "visibility",
  "position",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "opacity",
  "zIndex",
  "overflow",
  "overflowX",
  "overflowY",
  "backgroundColor",
  "color",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRadius",
  "boxShadow",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "gridTemplateColumns",
  "gridTemplateRows",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "transform",
  "top",
  "left",
  "right",
  "bottom",
];

export function fingerprintStyles(styleObj) {
  return STYLE_PROPS.map((prop) => `${prop}:${styleObj[prop] ?? ""}`).join("|");
}

export function diffStyleObjects(production, local) {
  const changed = {};
  for (const prop of STYLE_PROPS) {
    const prod = production?.[prop] ?? "";
    const loc = local?.[prop] ?? "";
    if (prod !== loc) changed[prop] = prod;
  }
  return changed;
}

export function computedOverridesToRule(selector, overrides) {
  const body = Object.entries(overrides)
    .map(([prop, value]) => importantizeDeclaration(`${camelToKebab(prop)}: ${value}`))
    .join("; ");
  return { selector, body, media: null, synthetic: true };
}

function camelToKebab(prop) {
  return prop.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
