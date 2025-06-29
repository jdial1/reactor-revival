#!/usr/bin/env node

/**
 * Download external libraries for local hosting
 * This script downloads the required external libraries to the lib/ directory
 * to improve load times and reduce dependency on external CDNs.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const libraries = [
  {
    name: "pako",
    url: "https://unpkg.com/pako@2.1.0/dist/pako.min.js",
    filename: "pako.min.js",
  },
  {
    name: "zip.js",
    url: "https://unpkg.com/@zip.js/zip.js@2.7.62/dist/zip.min.js",
    filename: "zip.min.js",
  },
];

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);

    const file = fs.createWriteStream(filepath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          const stats = fs.statSync(filepath);
          console.log(
            `✓ Downloaded ${path.basename(filepath)} (${(
              stats.size / 1024
            ).toFixed(1)} KB)`
          );
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filepath, () => {}); // Delete the file if download failed
        reject(err);
      });
  });
}

async function downloadLibraries() {
  console.log("Downloading external libraries...\n");

  // Ensure lib directory exists
  const libDir = path.join(__dirname, "..", "lib");
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
    console.log("Created lib/ directory");
  }

  try {
    for (const lib of libraries) {
      const filepath = path.join(libDir, lib.filename);
      await downloadFile(lib.url, filepath);
    }

    console.log("\n✓ All libraries downloaded successfully!");
    console.log("\nLibraries are now available locally:");
    libraries.forEach((lib) => {
      console.log(`  - lib/${lib.filename}`);
    });
  } catch (error) {
    console.error("\n✗ Error downloading libraries:", error.message);
    process.exit(1);
  }
}

// Run the script
downloadLibraries();
