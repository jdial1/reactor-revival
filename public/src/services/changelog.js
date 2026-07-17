import { bundledGameData } from "../generated/bundledStaticData.js";
import { logger } from "../core/logger.js";
import { ChangelogSchema } from "../schema/index.js";

export { ChangelogEntrySchema, ChangelogSchema } from "../schema/index.js";

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
