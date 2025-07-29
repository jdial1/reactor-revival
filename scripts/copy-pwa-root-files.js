const fs = require("fs");
const path = require("path");

const pwaFiles = [
  "sw.js",
  "manifest.json",
  "offline.html",
  "browserconfig.xml",
];

let allPresent = true;
pwaFiles.forEach((file) => {
  const filePath = path.join(__dirname, "..", "public", file);
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
