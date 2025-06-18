const fs = require("fs");
const path = require("path");

const rootFiles = [
  "sw.js",
  "manifest.json",
  "offline.html",
  "browserconfig.xml",
];

let allPresent = true;
rootFiles.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ Found: ${file}`);
  } else {
    console.warn(`❌ Missing: ${file}`);
    allPresent = false;
  }
});

if (!allPresent) {
  process.exitCode = 1;
}
