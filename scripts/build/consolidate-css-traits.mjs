#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import combine from "postcss-combine-duplicated-selectors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, "../..", "public", "css");

const SKIP = new Set(["variables.css", "fonts.css", "app.css", "utilities.css"]);
const TRAIT_MIN = 2;
const BLOCK_MIN = 2;
const MAX_PASSES = 6;
const DUP_TRAIT_TARGET = 10;

const GLOBAL_TRAIT_PROPS = new Set([
  "opacity",
  "content",
  "font-weight",
  "font-style",
  "font-display",
  "pointer-events",
  "visibility",
  "z-index",
]);

const IDENTITY_VALUES = new Set([
  "scale(1)",
  "translateX(0)",
  "translateY(0)",
  "translate(0, 0)",
  "translate(-50%, -50%)",
  "translate(-50%, 0)",
  "rotate(0deg)",
  "skewX(0)",
  "skewX(0deg)",
]);

function mediaKey(node) {
  const parts = [];
  let parent = node.parent;
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule" && parent.name === "media") {
      parts.unshift(parent.params.trim());
    }
    parent = parent.parent;
  }
  return parts.join("||");
}

function inKeyframes(rule) {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === "atrule" && parent.name === "keyframes") return true;
    parent = parent.parent;
  }
  return false;
}

function selectorText(rule) {
  return rule.selector.replace(/\s+/g, " ").trim();
}

function isValidSelector(sel) {
  const s = sel.trim();
  if (!s || s.length > 500) return false;
  if (/^[a-z][a-z0-9-]*\s*:/i.test(s)) return false;
  if (s.startsWith("background:") || s.startsWith("border:") || s.startsWith("display:")) return false;
  return true;
}

function declKey(decl) {
  const value = String(decl.value).trim();
  if (/[\r\n]/.test(value)) return null;
  return `${String(decl.prop).trim().toLowerCase()}::${value}`;
}

function blockDeclKey(decl) {
  return `${String(decl.prop).trim().toLowerCase()}::${String(decl.value).trim()}`;
}

function blockKey(decls) {
  return decls
    .map((d) => blockDeclKey(d))
    .sort()
    .join("|");
}

function parseFile(filePath) {
  return postcss.parse(fs.readFileSync(filePath, "utf8"), { from: filePath });
}

function walkRules(root, cb) {
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && rule.parent.name !== "media") return;
    cb(rule);
  });
}

function countTraits(roots) {
  const traits = new Map();
  const blocks = new Map();
  for (const root of roots.values()) {
    walkRules(root, (rule) => {
      const decls = rule.nodes?.filter((n) => n.type === "decl") ?? [];
      for (const decl of decls) {
        const key = declKey(decl);
        if (!key) continue;
        traits.set(key, (traits.get(key) ?? 0) + 1);
      }
      if (decls.length >= 2) {
        const key = blockKey(decls);
        blocks.set(key, (blocks.get(key) ?? 0) + 1);
      }
    });
  }
  return { traits, blocks };
}

function estimateDupTraits(traits) {
  let dup = 0;
  for (const n of traits.values()) {
    if (n > 1) dup += n - 1;
  }
  return dup;
}

function isGlobalTrait(decl) {
  const prop = String(decl.prop).trim().toLowerCase();
  if (GLOBAL_TRAIT_PROPS.has(prop)) return true;
  if (prop === "transform" && IDENTITY_VALUES.has(String(decl.value).trim())) return true;
  return false;
}

function stripRedundantDefaults(roots) {
  for (const root of roots.values()) {
    walkRules(root, (rule) => {
      const decls = rule.nodes?.filter((n) => n.type === "decl") ?? [];
      for (const decl of decls) {
        const prop = String(decl.prop).trim().toLowerCase();
        const value = String(decl.value).trim();
        if (!inKeyframes(rule) && prop === "opacity" && (value === "1" || value === "1.0")) {
          decl.remove();
        }
        if (!inKeyframes(rule) && prop === "transform" && IDENTITY_VALUES.has(value)) {
          decl.remove();
        }
      }
      if (!rule.nodes?.length) rule.remove();
    });

    root.walkAtRules("keyframes", (atRule) => {
      mergeDuplicateKeyframeSteps(atRule);

      const steps = atRule.nodes?.filter((n) => n.type === "rule") ?? [];
      const opacitySteps = steps.map((step) => {
        const decls = step.nodes?.filter((n) => n.type === "decl") ?? [];
        const opacity = decls.find((d) => String(d.prop).trim().toLowerCase() === "opacity");
        return { step, decls, opacity, value: opacity ? String(opacity.value).trim() : null };
      });
      const withOpacity = opacitySteps.filter((s) => s.opacity);
      if (withOpacity.length) {
        const allUnity = withOpacity.every((s) => s.value === "1" || s.value === "1.0");
        if (allUnity && withOpacity.length === steps.length) {
          for (const { opacity } of withOpacity) opacity.remove();
        }
      }

      const transformSteps = steps.filter((step) =>
        step.nodes?.some((n) => n.type === "decl" && String(n.prop).trim().toLowerCase() === "transform")
      );
      if (transformSteps.length) {
        const allIdentity = transformSteps.every((step) => {
          const decl = step.nodes.find(
            (n) => n.type === "decl" && String(n.prop).trim().toLowerCase() === "transform"
          );
          return decl && IDENTITY_VALUES.has(String(decl.value).trim());
        });
        if (allIdentity) {
          for (const step of transformSteps) {
            step.nodes
              ?.filter((n) => n.type === "decl" && String(n.prop).trim().toLowerCase() === "transform")
              .forEach((decl) => decl.remove());
          }
        }
      }

      for (const step of steps) {
        if (!step.nodes?.length) step.remove();
      }
      if (!atRule.nodes?.length) atRule.remove();
    });

    root.walk((node) => {
      if (node.type === "rule" && !node.nodes?.length) node.remove();
      if (node.type === "atrule" && node.name === "keyframes" && !node.nodes?.length) node.remove();
    });
  }
}

function mergeDuplicateKeyframeSteps(atRule) {
  const seen = new Map();
  for (const step of atRule.nodes?.filter((n) => n.type === "rule") ?? []) {
    const decls = step.nodes?.filter((n) => n.type === "decl") ?? [];
    if (!decls.length) {
      step.remove();
      continue;
    }
    const key = blockKey(decls);
    if (seen.has(key)) {
      const prev = seen.get(key);
      prev.selector = `${prev.selector}, ${step.selector}`;
      step.remove();
    } else {
      seen.set(key, step);
    }
  }
}

function traitBucketMedia(rule, decl) {
  if (isGlobalTrait(decl)) return "";
  return mediaKey(rule);
}

function formatDecl(prop, value) {
  return `  ${prop}: ${value};`;
}

function traitBody(traitLabel) {
  const idx = traitLabel.indexOf("::");
  if (idx < 0) return traitLabel;
  const prop = traitLabel.slice(0, idx);
  const value = traitLabel.slice(idx + 2);
  return `  ${prop}: ${value};`;
}

function buildGroupCss(groups) {
  const sections = [];
  for (const [media, buckets] of groups) {
    for (const [traitLabel, selectors] of buckets) {
      if (selectors.length < 2) continue;
      const unique = [...new Set(selectors)].filter(isValidSelector).sort();
      if (unique.length < 2) continue;
      const body = traitBody(traitLabel);
      const rule = `${unique.join(",\n")} {\n${body}\n}`;
      sections.push(media ? `@media ${media} {\n${rule}\n}` : rule);
    }
  }
  return sections.join("\n\n");
}

function buildBlockCss(groups) {
  const sections = [];
  for (const [media, buckets] of groups) {
    for (const [blockBody, selectors] of buckets) {
      if (selectors.length < 2) continue;
      const unique = [...new Set(selectors)].filter(isValidSelector).sort();
      if (unique.length < 2) continue;
      const rule = `${unique.join(",\n")} {\n${blockBody}\n}`;
      sections.push(media ? `@media ${media} {\n${rule}\n}` : rule);
    }
  }
  return sections.join("\n\n");
}

function loadRoots() {
  const files = fs
    .readdirSync(cssDir)
    .filter((f) => f.endsWith(".css") && !SKIP.has(f))
    .sort();
  const roots = new Map();
  for (const file of files) {
    roots.set(file, parseFile(path.join(cssDir, file)));
  }
  return roots;
}

function consolidatePass(roots) {
  stripRedundantDefaults(roots);

  const { traits, blocks } = countTraits(roots);
  const traitTargets = new Set(
    [...traits.entries()].filter(([, n]) => n >= TRAIT_MIN).map(([k]) => k)
  );
  const blockTargets = new Set(
    [...blocks.entries()].filter(([, n]) => n >= BLOCK_MIN).map(([k]) => k)
  );

  const traitGroups = new Map();
  const blockGroups = new Map();

  for (const [, root] of roots) {
    walkRules(root, (rule) => {
      const decls = rule.nodes?.filter((n) => n.type === "decl") ?? [];
      if (!decls.length) return;
      const sel = selectorText(rule);
      if (!isValidSelector(sel)) return;

      const blockK = blockKey(decls);
      if (decls.length >= 2 && blockTargets.has(blockK)) {
        const media = mediaKey(rule);
        if (!blockGroups.has(media)) blockGroups.set(media, new Map());
        const body = decls.map((d) => formatDecl(d.prop, d.value)).join("\n");
        const buckets = blockGroups.get(media);
        if (!buckets.has(body)) buckets.set(body, []);
        buckets.get(body).push(sel);
        rule.removeAll();
        return;
      }

      const removable = decls.filter((d) => {
        const key = declKey(d);
        return key && traitTargets.has(key);
      });
      if (!removable.length) return;

      for (const decl of removable) {
        const key = declKey(decl);
        const media = traitBucketMedia(rule, decl);
        if (!traitGroups.has(media)) traitGroups.set(media, new Map());
        const buckets = traitGroups.get(media);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(sel);
        decl.remove();
      }
      if (!rule.nodes?.length) rule.remove();
    });
  }

  for (const [, root] of roots) {
    root.walk((node) => {
      if (node.type === "rule" && !node.nodes?.length) node.remove();
    });
  }

  return { traitGroups, blockGroups };
}

async function dedupeFile(filePath) {
  const input = fs.readFileSync(filePath, "utf8");
  const result = await postcss([combine]).process(input, { from: filePath, to: filePath });
  fs.writeFileSync(filePath, result.css);
}

async function run() {
  const utilitiesPath = path.join(cssDir, "utilities.css");

  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const roots = loadRoots();
    const { traitGroups, blockGroups } = consolidatePass(roots);

    const traitCss = buildGroupCss(traitGroups);
    const blockCss = buildBlockCss(blockGroups);

    const utilitiesRoot = roots.get("utilities.css");
    let utilities = utilitiesRoot
      ? utilitiesRoot.toString()
      : fs.existsSync(utilitiesPath)
        ? fs.readFileSync(utilitiesPath, "utf8")
        : "/* shared trait/block groups extracted by css:consolidate */\n";
    utilities = utilities.replace(/\n\/\* consolidated trait groups \*\/[\s\S]*$/, "");
    utilities = utilities.trimEnd() + "\n";

    const consolidated = [traitCss, blockCss].filter(Boolean).join("\n\n");
    if (consolidated) {
      utilities += "\n/* consolidated trait groups */\n\n" + consolidated + "\n";
    }

    fs.writeFileSync(utilitiesPath, utilities);
    await dedupeFile(utilitiesPath);

    for (const [file, root] of roots) {
      if (file === "utilities.css") continue;
      fs.writeFileSync(path.join(cssDir, file), root.toString());
      await dedupeFile(path.join(cssDir, file));
    }

    const allRoots = loadRoots();
    const { traits } = countTraits(allRoots);
    const dupTraits = estimateDupTraits(traits);
    console.log(`Pass ${pass}: estimated dup traits ${dupTraits}, dup blocks ${estimateDupTraits(countTraits(allRoots).blocks)}`);
    if (dupTraits <= DUP_TRAIT_TARGET) break;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
