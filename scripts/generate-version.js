#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Generate version in yy_mm_dd_hh_mm format using Central Time
const now = new Date();

// Use Intl.DateTimeFormat to get Central Time components
const centralFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const centralParts = centralFormatter.formatToParts(now);
const centralValues = {};
centralParts.forEach((part) => {
  centralValues[part.type] = part.value;
});

const version =
  centralValues.year +
  "_" +
  centralValues.month +
  "_" +
  centralValues.day +
  "-" +
  centralValues.hour +
  centralValues.minute;

// Create version.json file in public folder
const versionData = { version: version };
const versionPath = path.join(__dirname, "..", "public", "version.json");

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2));

console.log(`Generated version.json: ${version}`);
console.log(`File location: ${versionPath}`);
console.log(`UTC Time: ${now.toISOString()}`);
console.log(`Central Time: ${centralFormatter.format(now)}`);
