import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, "..", "public", "css");

const FEATURES = [
  {
    file: "variables.css",
    sources: ["main.css"],
    patterns: [
      /^:root$/,
      /^\*$/,
      /^html$/,
      /^body$/,
      /^body::before$/,
      /^nav li$/,
      /^\.page-upgrades$/,
      /^\.page-experimental_upgrades$/,
      /^\.page-leaderboard$/,
    ],
  },
  {
    file: "layout.css",
    sources: ["main.css"],
    patterns: [
      "#app_root",
      "#wrapper",
      "#main",
      "#main_content_wrapper",
      "#page_content_area",
      "body.reactor-meltdown #wrapper",
      "html.reduced-motion-app #app_root",
    ],
  },
  {
    file: "panels.css",
    sources: ["main.css"],
    patterns: [/^\.(pixel-panel|industrial-panel|bevel-panel|inset-well)/],
  },
  {
    file: "animations.css",
    sources: ["main.css", "splash.css"],
    patterns: [
      "@keyframes app-root-jitter",
      "@keyframes crt-horizontal-tear",
      "@keyframes cathode-ignition",
      "@keyframes splash-vhold-reveal",
      "@keyframes splash-menu-vhold",
      ".splash-vhold-mask",
      "splash-vhold-booting",
    ],
  },
  {
    file: "objectives-toast.css",
    sources: ["objectives.css"],
    patterns: [
      ".objectives-toast",
      ".objectives-claim-pill",
      "@keyframes print-reveal",
      "@keyframes objectives-claim-flash",
      "@keyframes objectives-claim-pill-flash",
      "@keyframes objective-char-reveal",
    ],
  },
  {
    file: "progress-bars.css",
    sources: ["objectives.css"],
    patterns: [
      ".objective-progress-bar",
      ".chapter-progress-bar",
      ".objective-progress-bar-container",
      ".chapter-progress-bar-container",
      "@keyframes progress-shine",
    ],
  },
  {
    file: "modal-drawer.css",
    sources: ["main.css", "settings-modal.css", "layouts-manager.css"],
    patterns: [
      /\.modal-drawer-overlay/,
      /\.modal-drawer-panel/,
      /\.modal-drawer-scrim/,
      /\.modal-drawer-metal-handle/,
      /^body\.modal-drawer-open/,
      "@keyframes modalDrawerSlideIn",
      "@keyframes modalOverlayFadeIn",
    ],
  },
  {
    file: "component-grid.css",
    sources: ["layouts-manager.css"],
    patterns: [/^\.component-/],
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
  const name = node.params.trim();
  for (const feature of FEATURES) {
    for (const p of feature.patterns) {
      if (typeof p === "string" && p.startsWith("@keyframes") && name === p.replace("@keyframes ", "").trim()) {
        return feature;
      }
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
  if (!fs.existsSync(filePath)) continue;
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
