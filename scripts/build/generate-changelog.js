#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const versionPath = path.join(root, "public", "version.json");
const changelogPath = path.join(root, "public", "data", "changelog.json");

const MAX_ENTRIES = 5;
const MAX_BULLETS_PER_ENTRY = 20;
const SKIP_SUBJECT_PREFIXES = [
  "Merge pull request",
  "Merge branch",
  "Merge remote-tracking branch",
  "chore: update deploy changelog",
];
const PARENT_LEGACY_SUBSTRINGS = [
  "time flux",
  "timestampfmt function for time flux",
  "findoff/master",
  "updating time flux",
];

const REVIVAL_FORK_MARKERS = [
  "Restore Reactor Revival branding after repo recreation",
  "Add public build, assets, tests, and CI",
];

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFailure) return "";
    throw err;
  }
}

function isGitRepo() {
  try {
    git(["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

function isParentLegacyMessage(line) {
  const lower = line.toLowerCase();
  return PARENT_LEGACY_SUBSTRINGS.some((s) => lower.includes(s));
}

function normalizeBullets(lines) {
  const seen = new Set();
  const out = [];
  for (const raw of lines) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    if (SKIP_SUBJECT_PREFIXES.some((p) => line.startsWith(p))) continue;
    if (isParentLegacyMessage(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_BULLETS_PER_ENTRY) break;
  }
  return out;
}

function commitSubjects(rangeOrArgs) {
  const args = ["log", "--format=%s", "--no-merges", ...rangeOrArgs];
  const out = git(args, { allowFailure: true });
  if (!out) return [];
  return normalizeBullets(out.split("\n"));
}

function readVersionFromDisk() {
  if (!fs.existsSync(versionPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(versionPath, "utf8"));
    return parsed?.version ?? null;
  } catch {
    return null;
  }
}

function readExistingChangelog() {
  if (!fs.existsSync(changelogPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(changelogPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findRevivalForkRoot() {
  const explicit = process.env.CHANGELOG_FORK_ROOT?.trim();
  if (explicit) return explicit;

  for (const marker of REVIVAL_FORK_MARKERS) {
    const hash = git(
      ["log", "--reverse", "--format=%H", "--grep", marker, "-1", "HEAD"],
      { allowFailure: true }
    );
    const first = hash.split("\n").map((h) => h.trim()).find(Boolean);
    if (first) return first;
  }
  return null;
}

function isAncestor(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  try {
    git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function boundedRevivalRange(start, end) {
  const forkRoot = findRevivalForkRoot();
  const sha = end || git(["rev-parse", "HEAD"], { allowFailure: true });
  if (!sha) return null;

  if (!forkRoot) {
    return start ? `${start}..${sha}` : null;
  }

  let from = start || forkRoot;
  if (start && isAncestor(start, forkRoot)) from = forkRoot;
  return `${from}..${sha}`;
}

function bulletsFromGithubPushEvent() {
  const raw = process.env.CHANGELOG_COMMIT_MESSAGES?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return normalizeBullets(parsed.slice().reverse());
    }
  } catch {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length) return normalizeBullets(lines.slice().reverse());
  }
  return null;
}

function deployCommitRange() {
  const explicit = process.env.CHANGELOG_COMMIT_RANGE?.trim();
  if (explicit) {
    const [before, sha] = explicit.split("..");
    return boundedRevivalRange(before, sha);
  }

  const before = process.env.GITHUB_EVENT_BEFORE?.trim();
  const sha = process.env.GITHUB_SHA?.trim() || git(["rev-parse", "HEAD"], { allowFailure: true });
  if (before && sha && before !== "0000000000000000000000000000000000000000") {
    return boundedRevivalRange(before, sha);
  }

  const forkRoot = findRevivalForkRoot();
  if (forkRoot && sha) return `${forkRoot}..${sha}`;
  return null;
}

function bulletsFromGitPushRange(existing = []) {
  const range = deployCommitRange();
  const forkRoot = findRevivalForkRoot();
  const all = range
    ? commitSubjects([range])
    : forkRoot
      ? commitSubjects([`${forkRoot}..HEAD`])
      : commitSubjects(["-30", "HEAD"]);

  const version = readVersionFromDisk();
  const priorBullets = existing.find((e) => e.version === version)?.bullets ?? [];
  return normalizeBullets([...all, ...priorBullets]);
}

function entryDate() {
  const fromEvent = process.env.GITHUB_HEAD_COMMIT_TIMESTAMP?.trim();
  if (fromEvent) return fromEvent.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function writeChangelog() {
  const version = readVersionFromDisk();
  if (!version) {
    console.warn("generate-changelog: version.json missing or invalid; skipping changelog.json");
    return;
  }

  const existing = readExistingChangelog();
  const forkRoot = findRevivalForkRoot();

  let bullets = bulletsFromGithubPushEvent();
  if (!bullets?.length && isGitRepo()) {
    bullets = bulletsFromGitPushRange(existing);
  }
  if (!bullets.length) {
    bullets = [`Production deploy ${version}`];
  }

  const currentEntry = { version, date: entryDate(), bullets };

  const merged = [currentEntry];
  for (const entry of existing) {
    if (entry.version === version) continue;
    if (merged.some((e) => e.version === version)) continue;
    merged.push(entry);
    if (merged.length >= MAX_ENTRIES) break;
  }

  fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
  fs.writeFileSync(changelogPath, JSON.stringify(merged, null, 4) + "\n", "utf8");
  const forkNote = forkRoot ? `fork root ${forkRoot.slice(0, 7)}` : "no fork root";
  console.log(
    `Generated changelog.json: ${merged.length} entries (latest ${version}, ${bullets.length} bullets, ${forkNote})`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeChangelog();
}
