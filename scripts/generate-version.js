#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Generate version in yy_mm_dd_hh_mm format
const now = new Date();
const version =
  now.getFullYear().toString().slice(-2) +
  "_" +
  String(now.getMonth() + 1).padStart(2, "0") +
  "_" +
  String(now.getDate()).padStart(2, "0") +
  "-" +
  String(now.getHours()).padStart(2, "0") +
  "-" +
  String(now.getMinutes()).padStart(2, "0");

// Create version.json file
const versionData = { version: version };
const versionPath = path.join(__dirname, "..", "version.json");

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2));

console.log(`Generated version.json: ${version}`);
console.log(`File location: ${versionPath}`);
