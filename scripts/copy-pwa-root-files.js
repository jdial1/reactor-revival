import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
