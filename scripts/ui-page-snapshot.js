import fs from "fs";
import path from "path";

export async function extractStylesheetInventory(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({
      href: link.href,
      media: link.media || "all",
    }))
  );
}

export async function extractPageDomSnapshot(page, { rootSelector, pageId, targetName }) {
  return page.evaluate(({ rootSelector, pageId, targetName }) => {
    const root =
      (rootSelector ? document.querySelector(rootSelector) : null) ??
      (pageId ? document.getElementById(pageId) : null) ??
      document.getElementById("wrapper") ??
      document.body;

    const classSet = new Set();
    const idSet = new Set();
    root.querySelectorAll("[class]").forEach((el) => el.classList.forEach((cls) => classSet.add(cls)));
    root.querySelectorAll("[id]").forEach((el) => {
      if (el.id) idSet.add(el.id);
    });

    const keySelectors = [
      "#app_root",
      "#wrapper",
      "#splash-screen",
      "#splash-container",
      "#page_content_area",
      "#reactor_section",
      "#main_top_nav",
      "#bottom_nav",
      "#info_bar_root",
      "#modal-root",
      ".splash-menu-panel",
      ".settings-modal-overlay",
      "#quick-start-overlay",
    ];

    const computedStyles = {};
    for (const selector of keySelectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const style = getComputedStyle(el);
      computedStyles[selector] = {
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        width: style.width,
        height: style.height,
        opacity: style.opacity,
        zIndex: style.zIndex,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        padding: style.padding,
        margin: style.margin,
        flexDirection: style.flexDirection,
        gridTemplateColumns: style.gridTemplateColumns,
        overflow: style.overflow,
      };
    }

    return {
      targetName,
      pageId: pageId ?? null,
      rootSelector: rootSelector ?? (pageId ? `#${pageId}` : null),
      title: document.title,
      url: location.href,
      bodyClass: document.body.className,
      htmlClass: document.documentElement.className,
      htmlAttrs: {
        lang: document.documentElement.lang,
        "data-theme": document.documentElement.getAttribute("data-theme"),
      },
      classes: [...classSet].sort(),
      ids: [...idSet].sort(),
      html: root.outerHTML,
      computedStyles,
    };
  }, { rootSelector, pageId, targetName });
}

export async function savePageSnapshot(outputDir, targetName, snapshot) {
  const pageDir = path.join(outputDir, "pages", targetName);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, "dom.html"), snapshot.html);
  fs.writeFileSync(
    path.join(pageDir, "snapshot.json"),
    `${JSON.stringify(
      {
        targetName: snapshot.targetName,
        pageId: snapshot.pageId,
        rootSelector: snapshot.rootSelector,
        title: snapshot.title,
        url: snapshot.url,
        bodyClass: snapshot.bodyClass,
        htmlClass: snapshot.htmlClass,
        htmlAttrs: snapshot.htmlAttrs,
        classes: snapshot.classes,
        ids: snapshot.ids,
        computedStyles: snapshot.computedStyles,
      },
      null,
      2
    )}\n`
  );
}

export async function downloadStylesheets(stylesheets, outputCssDir, logStep) {
  fs.mkdirSync(outputCssDir, { recursive: true });
  const saved = [];
  for (const sheet of stylesheets) {
    const url = new URL(sheet.href);
    const baseName = path.basename(url.pathname) || "stylesheet.css";
    const dest = path.join(outputCssDir, baseName);
    if (fs.existsSync(dest)) {
      saved.push({ file: baseName, href: sheet.href, skipped: true });
      continue;
    }
    try {
      const response = await fetch(sheet.href);
      if (!response.ok) {
        logStep?.(`WARN: css fetch ${response.status} ${sheet.href}`);
        continue;
      }
      fs.writeFileSync(dest, await response.text());
      saved.push({ file: baseName, href: sheet.href, skipped: false });
    } catch (error) {
      logStep?.(`WARN: css fetch failed ${sheet.href} — ${error.message}`);
    }
  }
  return saved;
}

export function diffStringSets(production, local) {
  const prodSet = new Set(production);
  const localSet = new Set(local);
  return {
    missingInLocal: [...prodSet].filter((item) => !localSet.has(item)).sort(),
    extraInLocal: [...localSet].filter((item) => !prodSet.has(item)).sort(),
    shared: [...prodSet].filter((item) => localSet.has(item)).sort(),
  };
}

export function diffComputedStyles(production, local) {
  const selectors = new Set([...Object.keys(production ?? {}), ...Object.keys(local ?? {})]);
  const diffs = [];
  for (const selector of selectors) {
    const prod = production?.[selector];
    const loc = local?.[selector];
    if (!prod && loc) {
      diffs.push({ selector, kind: "missing_in_production" });
      continue;
    }
    if (prod && !loc) {
      diffs.push({ selector, kind: "missing_in_local" });
      continue;
    }
    if (!prod || !loc) continue;
    const changed = {};
    for (const key of new Set([...Object.keys(prod), ...Object.keys(loc)])) {
      if (prod[key] !== loc[key]) changed[key] = { production: prod[key], local: loc[key] };
    }
    if (Object.keys(changed).length) diffs.push({ selector, kind: "style_changed", changed });
  }
  return diffs;
}

export function indexLocalCssFiles(publicCssDir) {
  const index = new Map();
  if (!fs.existsSync(publicCssDir)) return index;
  for (const file of fs.readdirSync(publicCssDir).filter((name) => name.endsWith(".css"))) {
    const content = fs.readFileSync(path.join(publicCssDir, file), "utf8");
    index.set(file, content);
  }
  return index;
}

export function findCssFilesForClass(className, cssIndex) {
  const matches = [];
  const pattern = new RegExp(`\\.${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[\\s,{:.\\[#>+~]|$)`);
  for (const [file, content] of cssIndex.entries()) {
    if (pattern.test(content)) matches.push(file);
  }
  return matches;
}
