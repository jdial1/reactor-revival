import { z } from "zod";
import { bundledGameData } from "./bundledStaticData.js";
import { logger } from "./core/logger.js";

export const ChangelogEntrySchema = z.object({
  version: z.string(),
  date: z.string().optional(),
  bullets: z.array(z.string()).min(1),
});

export const ChangelogSchema = z.array(ChangelogEntrySchema);

let _changelogCache = null;

export function loadChangelog() {
  if (_changelogCache) return _changelogCache;
  try {
    _changelogCache = ChangelogSchema.parse(bundledGameData.changelog ?? []);
  } catch (err) {
    logger.log("warn", "ui", "Failed to parse bundled changelog:", err);
    _changelogCache = [];
  }
  return _changelogCache;
}

export function getRecentChangelogEntries(changelog, limit = 5) {
  if (!changelog?.length) return [];
  return changelog.slice(0, limit);
}

export function findChangelogEntry(changelog, version) {
  if (!version || !changelog?.length) return null;
  return changelog.find((e) => e.version === version) ?? null;
}
