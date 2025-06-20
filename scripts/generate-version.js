#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Generate version in yy_mm_dd_hh_mm format using Central Time
const now = new Date();
const centralTime = new Date(
  now.toLocaleString("en-US", { timeZone: "America/Chicago" })
);

const version =
  centralTime.getFullYear().toString().slice(-2) +
  "_" +
  String(centralTime.getMonth() + 1).padStart(2, "0") +
  "_" +
  String(centralTime.getDate()).padStart(2, "0") +
  "-" +
  String(centralTime.getHours()).padStart(2, "0") +
  String(centralTime.getMinutes()).padStart(2, "0");

// Create version.json file
const versionData = { version: version };
const versionPath = path.join(__dirname, "..", "version.json");

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2));

console.log(`Generated version.json: ${version}`);
console.log(`File location: ${versionPath}`);
console.log(
  `Central Time: ${centralTime.toLocaleString("en-US", {
    timeZone: "America/Chicago",
  })}`
);
