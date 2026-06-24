import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, "..", "public", "css");

const FEATURES = [
  {
    file: "about.css",
    sources: ["main.css"],
    patterns: ["#about_section", ".page-about"],
  },
  {
    file: "buttons.css",
    sources: ["main.css"],
    patterns: [".pixel-btn", ".nav-btn", ".bevel-btn", ".industrial-btn", ".research-buttons-container"],
  },
  {
    file: "scrollbars.css",
    sources: ["main.css"],
    patterns: ["::-webkit-scrollbar"],
  },
  {
    file: "soundboard.css",
    sources: ["main.css"],
    patterns: [".soundboard-page", ".soundboard-"],
  },
  {
    file: "prestige.css",
    sources: ["main.css"],
    patterns: ["#exotic_particles_display"],
    merge: true,
  },
  {
    file: "visual-fx.css",
    sources: ["control-deck.css"],
    patterns: [".floating-text", ".particle-bolt", ".steam-particle", ".steam-particles", "@keyframes float-up", "@keyframes bolt-fly", "@keyframes steam-rise"],
  },
  {
    file: "time-flux.css",
    sources: ["reactor-grid.css", "settings-modal.css"],
    patterns: [".time-flux-sim-"],
  },
  {
    file: "navigation.css",
    sources: ["main.css", "info-bar.css", "objectives.css"],
    patterns: ["#bottom_nav", "footer#bottom_nav"],
    merge: true,
  },
  {
    file: "toggle-switch.css",
    sources: ["controls-nav.css"],
    patterns: [
      /^\.mech-switch-row/,
      /^\.mech-switch($|[.:\s])/,
      /^\.mech-switch-off/,
      /^\.mech-switch-on/,
      /^\.mech-switch-track/,
      /^\.mech-switch-thumb/,
    ],
  },
  {
    file: "audio-controls.css",
    sources: ["settings-modal.css"],
    patterns: [".volume-stepper", ".volume-block", ".volume-control"],
  },
  {
    file: "auth.css",
    sources: ["splash.css"],
    patterns: [
      ".splash-auth-in-panel",
      "#splash-email-auth-form",
      ".nav-auth-modal",
      ".nav-auth-",
      ".splash-auth-terminal-form",
      ".splash-auth-form-",
      ".splash-auth-message",
      ".splash-auth-back-btn",
      ".splash-auth-signed-in",
      ".splash-auth-icon-btn",
      ".splash-auth-comms-",
    ],
  },
  {
    file: "research.css",
    sources: ["upgrades.css", "ui-secondary-pages.css"],
    patterns: [".research-collapsible", ".research-ep-hint", ".research-section-header", ".research-section-body"],
  },
];

function matchesSelector(selector, patterns) {
  return patterns.some((p) => (p instanceof RegExp ? p.test(selector) : selector.includes(p)));
}

function findFeatureForRule(node) {
  if (node.type !== "rule") return null;
  for (const feature of FEATURES) {
    if (node.selectors.every((sel) => matchesSelector(sel, feature.patterns))) return feature;
  }
  return null;
}

function findFeatureForKeyframes(node) {
  for (const feature of FEATURES) {
    if (feature.patterns.some((p) => typeof p === "string" && p.includes("keyframes") && node.params.includes(p.replace("@keyframes ", "").trim()))) {
      return feature;
    }
  }
  return null;
}

function routeNode(node) {
  if (node.type === "rule") {
    const feature = findFeatureForRule(node);
    if (feature) return { type: "route", feature, node: node.clone() };
    return { type: "keep", node: node.clone() };
  }
  if (node.type === "atrule" && node.name === "keyframes") {
    const feature = findFeatureForKeyframes(node);
    if (feature) return { type: "route", feature, node: node.clone() };
    return { type: "keep", node: node.clone() };
  }
  if (!node.nodes?.length) return { type: "keep", node: node.clone() };
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

const buckets = new Map();
const keptRoots = new Map();
const sources = [...new Set(FEATURES.flatMap((f) => f.sources))];

for (const source of sources) {
  const filePath = path.join(cssDir, source);
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
  keptRoots.set(source, kept);
}

for (const [source, kept] of keptRoots) {
  fs.writeFileSync(path.join(cssDir, source), `${kept.toString().trim()}\n`);
  console.log(`Updated ${source}`);
}

for (const feature of FEATURES) {
  const nodes = buckets.get(feature.file);
  if (!nodes?.length) {
    console.warn(`No rules for ${feature.file}`);
    continue;
  }
  const outRoot = postcss.root();
  nodes.forEach((n) => outRoot.append(n));
  const outPath = path.join(cssDir, feature.file);
  const body = `${outRoot.toString().trim()}\n`;
  if (feature.merge && fs.existsSync(outPath)) {
    const existing = fs.readFileSync(outPath, "utf8").trimEnd();
    fs.writeFileSync(outPath, `${existing}\n\n${body}`);
  } else {
    fs.writeFileSync(outPath, body);
  }
  console.log(`Wrote ${feature.file} (${nodes.length} nodes)`);
}
