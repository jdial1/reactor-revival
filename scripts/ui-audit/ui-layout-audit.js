export class LayoutAuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "LayoutAuditError";
  }
}

export async function auditResearchScrollAtTabletLandscape(page) {
  const ok = await page.evaluate(() => {
    const lab = document.getElementById("experimental_laboratory");
    const wrapper = document.getElementById("experimental_upgrades_content_wrapper");
    const area = document.getElementById("page_content_area");
    if (!lab || !wrapper) return { ok: false, reason: "research DOM missing" };
    const roots = [wrapper, area].filter(Boolean);
    const scrollRoot = roots.find((el) => {
      const style = getComputedStyle(el);
      return style.overflowY === "auto" || style.overflowY === "scroll";
    }) || wrapper;
    const style = getComputedStyle(scrollRoot);
    const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";
    const needsScroll = scrollRoot.scrollHeight > scrollRoot.clientHeight + 2;
    if (!needsScroll) return { ok: true, needsScroll: false };
    if (!canScroll) return { ok: false, reason: "no scroll affordance on content wrapper" };
    const labBottom = lab.offsetTop + lab.offsetHeight;
    return {
      ok: labBottom <= scrollRoot.scrollHeight + 1,
      reason: labBottom > scrollRoot.scrollHeight + 1 ? "laboratory below scroll range" : null,
      needsScroll,
      canScroll,
    };
  });
  if (!ok.ok) {
    throw new LayoutAuditError(
      `research/laboratory not reachable at tablet-landscape (${ok.reason || "scroll container cannot reach laboratory content"})`
    );
  }
}

export async function auditEpStatusPanelNotClipped(page) {
  const ok = await page.evaluate(() => {
    const panels = [...document.querySelectorAll(".ep-status-panel")];
    if (!panels.length) return { ok: true, skipped: true };
    const failures = [];
    for (const panel of panels) {
      const style = getComputedStyle(panel);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = panel.getBoundingClientRect();
      if (rect.height < 4) failures.push("zero-height panel");
      if (rect.top < -2) failures.push("panel above viewport");
      if (rect.bottom > window.innerHeight + 2) failures.push("panel below viewport");
    }
    return { ok: failures.length === 0, failures };
  });
  if (!ok.ok) {
    throw new LayoutAuditError(`EP hazard panel clip at viewport (${(ok.failures || []).join(", ")})`);
  }
}

export async function auditLeaderboardLayoutHeader(page) {
  const ok = await page.evaluate(() => {
    const th = document.querySelector(".leaderboard-col-layout");
    if (!th) return { ok: true, skipped: true };
    const text = (th.textContent || "").trim();
    return { ok: text === "Layout", text };
  });
  if (!ok.ok) {
    throw new LayoutAuditError(`leaderboard layout header is "${ok.text}", expected "Layout"`);
  }
}

export async function auditBottomNavAriaLabels(page) {
  const ok = await page.evaluate(() => {
    const expected = [
      { page: "reactor_section", label: "Reactor (Core)" },
      { page: "upgrades_section", label: "Upgrades (Mods)" },
      { page: "experimental_upgrades_section", label: "Research (Tech)" },
    ];
    const failures = [];
    for (const { page: pageId, label } of expected) {
      const btn = document.querySelector(`#bottom_nav button[data-page="${pageId}"]`);
      if (!btn) {
        failures.push(`missing ${pageId}`);
        continue;
      }
      if (btn.getAttribute("aria-label") !== label) {
        failures.push(`${pageId} aria-label=${btn.getAttribute("aria-label")}`);
      }
    }
    return { ok: failures.length === 0, failures };
  });
  if (!ok.ok) {
    throw new LayoutAuditError(`bottom nav a11y labels (${(ok.failures || []).join("; ")})`);
  }
}

export async function auditHullInfoBarStructure(page) {
  const ok = await page.evaluate(() => {
    const hull = document.querySelector(".info-bar-desktop .info-item.hull");
    if (!hull) return { ok: true, skipped: true };
    const style = getComputedStyle(hull);
    if (style.display === "none") return { ok: true, skipped: true };
    const label = hull.querySelector(".stats-inline-label");
    const icon = hull.querySelector("img.icon");
    const value = hull.querySelector("#info_hull_desktop");
    return {
      ok: !!(label && icon && value && value.classList.contains("value")),
      hasLabel: !!label,
      hasIcon: !!icon,
      hasValue: !!value,
    };
  });
  if (!ok.ok) {
    throw new LayoutAuditError("desktop Hull info bar missing label/icon/value pattern");
  }
}

export async function runPhase3LayoutAudits(page, logStep) {
  const audits = [
    {
      label: "tablet-landscape research scroll",
      viewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
      prepare: async () => {
        await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
        await page.evaluate(() => {
          document.querySelector('[data-page="experimental_upgrades_section"]')?.click();
        });
        await page.waitForFunction(
          () => {
            const section = document.getElementById("experimental_upgrades_section");
            return section && !section.classList.contains("hidden");
          },
          { timeout: 8000 }
        );
      },
      run: () => auditResearchScrollAtTabletLandscape(page),
    },
    {
      label: "tablet-landscape EP hazard panels (reactor)",
      viewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
      prepare: async () => {
        await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
        await page.evaluate(() => {
          document.querySelector('[data-page="reactor_section"]')?.click();
        });
        await page.waitForFunction(
          () => {
            const section = document.getElementById("reactor_section");
            return section && !section.classList.contains("hidden");
          },
          { timeout: 8000 }
        );
      },
      run: () => auditEpStatusPanelNotClipped(page),
    },
    {
      label: "tablet-landscape EP hazard panels (research)",
      viewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
      prepare: async () => {
        await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
        await page.evaluate(() => {
          document.querySelector('[data-page="experimental_upgrades_section"]')?.click();
        });
        await page.waitForFunction(
          () => document.getElementById("exotic_particles_display"),
          { timeout: 8000 }
        );
      },
      run: () => auditEpStatusPanelNotClipped(page),
    },
    {
      label: "leaderboard layout header",
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      prepare: async () => {
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
        await page.evaluate(() => {
          document.querySelector('[data-page="leaderboard_section"]')?.click();
        });
        await page.waitForFunction(
          () => {
            const section = document.getElementById("leaderboard_section");
            return section && !section.classList.contains("hidden");
          },
          { timeout: 8000 }
        );
      },
      run: () => auditLeaderboardLayoutHeader(page),
    },
    {
      label: "bottom nav aria labels",
      viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
      prepare: async () => {
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      },
      run: () => auditBottomNavAriaLabels(page),
    },
    {
      label: "desktop hull info bar",
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      prepare: async () => {
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
        await page.evaluate(() => {
          document.querySelector('[data-page="reactor_section"]')?.click();
        });
      },
      run: () => auditHullInfoBarStructure(page),
    },
  ];

  for (const audit of audits) {
    try {
      await audit.prepare();
      await audit.run();
      logStep(`layout audit passed: ${audit.label}`);
    } catch (error) {
      if (error?.name === "LayoutAuditError") throw error;
      throw new LayoutAuditError(`${audit.label}: ${error?.message || String(error)}`);
    }
  }
}
