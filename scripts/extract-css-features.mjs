import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, "..", "public", "css");

const FEATURES = [
  {
    file: "upgrades.css",
    sources: ["main.css"],
    patterns: [
      ".upgrade-group",
      ".research-group",
      ".upgrade-card",
      ".upgrade-action-btn",
      ".ep-status-panel",
      "#upgrades_section",
      "#experimental_upgrades_section",
      /\.upgrade-/,
      ".research-collapsible",
      ".research-section",
    ],
  },
  {
    file: "parts-panel.css",
    sources: ["main.css"],
    patterns: [
      "#parts_section",
      ".parts_tabs",
      ".item-grid",
      ".parts-module-info-panel",
      /\.parts_/,
      "#parts_tab",
      "parts_sheet",
      "help-mode-active .item-grid",
    ],
  },
  {
    file: "game-setup.css",
    sources: ["main.css"],
    patterns: [
      ".bios-screen",
      ".doctrine-card",
      ".difficulty-card",
      ".game-setup-header",
      ".doctrine-",
      ".difficulty-",
      ".game-setup-",
      ".bios-param",
      ".bios-preset",
      "#game_setup",
      ".bios-",
      ".tech-tree-overlay",
      ".setup-section",
    ],
  },
  {
    file: "leaderboard.css",
    sources: ["main.css"],
    patterns: [".leaderboard-", "#leaderboard_section"],
  },
  {
    file: "tooltips.css",
    sources: ["main.css", "objectives.css"],
    patterns: [
      "#tooltip",
      "#tooltip_data",
      ".context-modal",
      ".tooltip-bonuses",
      "#tooltip_",
      ".tooltip-",
      "tooltip_showing",
    ],
  },
  {
    file: "legal.css",
    sources: ["main.css", "objectives.css"],
    patterns: [
      "page-privacy_policy",
      "page-terms_of_service",
      ".tos-section",
      ".page-container",
      "body:has(> .page-container)",
      "html:has(body > .page-container)",
    ],
  },
  {
    file: "tutorial.css",
    sources: ["main.css"],
    patterns: [
      "#tutorial-overlay",
      "#tutorial-callout",
      "tutorial-pointer",
      "tutorial-spotlight",
      "tutorial-focus",
      "tutorial-skip",
      "tutorial-hard-skip",
      "tutorial-message",
    ],
  },
  {
    file: "system-alerts.css",
    sources: ["main.css"],
    patterns: [
      ".critical-error-overlay",
      "#critical-error-overlay",
      ".update-toast",
      ".changelog-modal",
      ".version-check-toast",
      ".critical-error-",
      ".changelog-entry",
    ],
  },
  {
    file: "quick-start.css",
    sources: ["objectives.css"],
    patterns: [".quick-start-", ".qs-", "#quick-start"],
  },
  {
    file: "controls-nav.css",
    sources: ["objectives.css"],
    patterns: [
      "#controls_nav",
      ".control-text",
      ".mech-switch",
      ".refund-safety",
      "#controls_nav_root",
      ".control-deck-mech-wrap",
      ".control-deck-mech-cap",
    ],
  },
  {
    file: "splash-extract.css",
    sources: ["objectives.css"],
    patterns: [
      ".splash-menu-panel",
      ".splash-title",
      ".splash-auth-in-footer",
      ".splash-menu-",
      ".splash-signal-",
      ".splash-auth-",
      "#splash-screen .splash-menu",
      ".splash-btn-row",
      ".splash-btn-google",
      ".splash-btn-actions",
      ".splash-screw",
      ".splash-panel-",
      ".splash-control-deck",
      ".splash-version",
      ".splash-stats",
      ".splash-bottom-",
      ".splash-start-options",
      ".splash-user-count",
      ".splash-footer-links",
      "#splash-container",
    ],
  },
  {
    file: "banners.css",
    sources: ["objectives.css"],
    patterns: ["#pause_banner", "#meltdown_banner", ".explosion-emf-overlay", "pause-banner-"],
  },
  {
    file: "prestige.css",
    sources: ["objectives.css"],
    patterns: [".prestige-modal", ".chapter-celebration", "#prestige_"],
  },
  {
    file: "navigation.css",
    sources: ["objectives.css", "reactor-mobile.css"],
    patterns: [
      ".nav-bar-row",
      "ul#reactor_stats",
      "#reactor_stats",
      "#engine_status",
      "#engine_status_indicator",
      "#mobile_top_bar",
      "#main_top_nav",
      ".mobile-passive-top-bar",
      "#mobile_passive_root",
      ".passive-top-",
      "body.page-reactor #wrapper",
      "#wrapper { padding-top: calc(var(--mobile-passive-top-height)",
    ],
  },
  {
    file: "layouts-manager.css",
    sources: ["objectives.css", "settings-modal.css", "splash.css"],
    patterns: [
      "#reactor_copy_paste_modal",
      "#my_layouts_modal",
      ".component-summary-section",
      "#my_layouts_list",
      "#reactor_copy_paste",
      "reactor_copy_paste_btns",
      ".reactor_copy_paste_buttons",
      ".my-layout-",
      ".component-",
      ".part-summary-table",
      ".part-type-checkbox",
      "#reactor_copy_paste_close",
    ],
  },
  {
    file: "control-deck.css",
    sources: ["reactor-mobile.css"],
    patterns: [
      "#reactor_control_deck",
      "#build_above_deck_row",
      ".control-deck-grid",
      ".quick-select-slot",
      ".control-deck-",
      ".quick-select-",
      ".power-capacitor",
      ".heat-vent",
      ".money-scoreboard",
      ".power-fill",
      ".heat-fill",
      ".floating-text",
      ".particle-bolt",
      ".steam-particle",
      ".steam-particles",
    ],
  },
  {
    file: "modals.css",
    sources: ["settings-modal.css", "splash.css"],
    patterns: [".welcome-back-modal", ".reactor-failed-modal"],
  },
  {
    file: "save-slots.css",
    sources: ["splash.css"],
    patterns: ["#save-slot-screen", ".save-slot-"],
  },
];

function matchesSelector(selector, patterns) {
  return patterns.some((p) => (p instanceof RegExp ? p.test(selector) : selector.includes(p)));
}

function ruleMatchesAll(node, patterns) {
  return node.type === "rule" && node.selectors.every((sel) => matchesSelector(sel, patterns));
}

function findFeatureForRule(node) {
  if (node.type !== "rule") return null;
  for (const feature of FEATURES) {
    if (ruleMatchesAll(node, feature.patterns)) return feature;
  }
  return null;
}

function collectAnimationNames(root) {
  const names = new Set();
  root.walkDecls((decl) => {
    if (decl.prop !== "animation" && decl.prop !== "animation-name") return;
    decl.value.split(",").forEach((part) => {
      part
        .trim()
        .split(/\s+/)
        .forEach((token) => {
          if (!token || token === "none") return;
          if (/^(linear|ease|step|infinite|\d)/.test(token)) return;
          if (/m?s$/.test(token) && /\d/.test(token)) return;
          names.add(token);
        });
    });
  });
  return names;
}

function routeNode(node) {
  if (node.type === "rule") {
    const feature = findFeatureForRule(node);
    if (feature) return { type: "route", feature, node: node.clone() };
    return { type: "keep", node: node.clone() };
  }
  if (node.type === "atrule" && node.name === "keyframes") {
    return { type: "keep", node: node.clone() };
  }
  if (!node.nodes?.length) {
    return { type: "keep", node: node.clone() };
  }
  const routes = new Map();
  const keep = [];
  for (const child of node.nodes) {
    const result = routeNode(child);
    if (result.type === "route") {
      const list = routes.get(result.feature.file) ?? [];
      list.push(result.node);
      routes.set(result.feature.file, list);
    } else if (result.type === "keep") {
      keep.push(result.node);
    } else if (result.type === "multi") {
      for (const { feature, node: routed } of result.outputs) {
        const list = routes.get(feature.file) ?? [];
        list.push(routed);
        routes.set(feature.file, list);
      }
    } else if (result.type === "split") {
      keep.push(result.keep);
      for (const { feature, node: routed } of result.outputs) {
        const list = routes.get(feature.file) ?? [];
        list.push(routed);
        routes.set(feature.file, list);
      }
    }
  }
  if (!routes.size) return { type: "keep", node: node.clone({ nodes: keep }) };
  const outputs = [];
  for (const [file, children] of routes) {
    const wrap = node.clone({ nodes: [] });
    children.forEach((c) => wrap.append(c));
    outputs.push({ feature: FEATURES.find((f) => f.file === file), node: wrap });
  }
  if (!keep.length) {
    if (outputs.length === 1) return { type: "route", feature: outputs[0].feature, node: outputs[0].node };
    return { type: "multi", outputs };
  }
  return { type: "split", keep: node.clone({ nodes: keep }), outputs };
}

function processSource(sourceFile, buckets, keptRoots) {
  const filePath = path.join(cssDir, sourceFile);
  const root = postcss.parse(fs.readFileSync(filePath, "utf8"), { from: filePath });
  const kept = postcss.root();
  for (const node of root.nodes) {
    const result = routeNode(node);
    if (result.type === "keep") kept.append(result.node);
    else if (result.type === "route") {
      const list = buckets.get(result.feature.file) ?? [];
      list.push(result.node);
      buckets.set(result.feature.file, list);
    } else if (result.type === "multi") {
      for (const { feature, node } of result.outputs) {
        const list = buckets.get(feature.file) ?? [];
        list.push(node);
        buckets.set(feature.file, list);
      }
    } else if (result.type === "split") {
      kept.append(result.keep);
      for (const { feature, node } of result.outputs) {
        const list = buckets.get(feature.file) ?? [];
        list.push(node);
        buckets.set(feature.file, list);
      }
    }
  }
  keptRoots.set(sourceFile, kept);
}

function attachKeyframes(buckets, keptRoots) {
  for (const [file, nodes] of buckets) {
    const bucketRoot = postcss.root();
    nodes.forEach((n) => bucketRoot.append(n.clone()));
    const needed = collectAnimationNames(bucketRoot);
    if (!needed.size) continue;
    const feature = FEATURES.find((f) => f.file === file);
    if (!feature) continue;
    for (const source of feature.sources) {
      const kept = keptRoots.get(source);
      if (!kept) continue;
      const toMove = [];
      kept.walkAtRules("keyframes", (atRule) => {
        const name = atRule.params.trim();
        if (!needed.has(name)) return;
        toMove.push(atRule);
      });
      for (const atRule of toMove) {
        const stillUsed = collectAnimationNames(kept);
        if (stillUsed.has(atRule.params.trim())) continue;
        const list = buckets.get(file) ?? [];
        list.push(atRule.clone());
        buckets.set(file, list);
        atRule.remove();
      }
    }
  }
}

const buckets = new Map();
const keptRoots = new Map();
const sources = [...new Set(FEATURES.flatMap((f) => f.sources))];
for (const source of sources) processSource(source, buckets, keptRoots);
try {
  attachKeyframes(buckets, keptRoots);
} catch (err) {
  console.warn("attachKeyframes skipped:", err.message);
}

for (const [source, kept] of keptRoots) {
  const filePath = path.join(cssDir, source);
  fs.writeFileSync(filePath, `${kept.toString().trim()}\n`);
  console.log(`Updated ${source}`);
}

const splashExtract = buckets.get("splash-extract.css") ?? [];
buckets.delete("splash-extract.css");
if (splashExtract.length) {
  const splashPath = path.join(cssDir, "splash.css");
  const splashRoot = postcss.parse(fs.readFileSync(splashPath, "utf8"));
  splashExtract.forEach((n) => splashRoot.append(n));
  fs.writeFileSync(splashPath, `${splashRoot.toString().trim()}\n`);
  console.log("Merged splash-extract into splash.css");
}

for (const feature of FEATURES) {
  if (feature.file === "splash-extract.css") continue;
  const nodes = buckets.get(feature.file);
  if (!nodes?.length) {
    console.warn(`No rules for ${feature.file}`);
    continue;
  }
  const outRoot = postcss.root();
  nodes.forEach((n) => outRoot.append(n));
  fs.writeFileSync(path.join(cssDir, feature.file), `${outRoot.toString().trim()}\n`);
  console.log(`Wrote ${feature.file} (${nodes.length} nodes)`);
}
