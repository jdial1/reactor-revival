#!/usr/bin/env node

/**
 * Copy external libraries from node_modules to public/lib
 * This script copies the required external libraries to the public/lib directory
 * so they can be served directly to the browser.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libraries = [
    {
        name: "pako",
        source: "node_modules/pako/dist/pako.min.js",
        target: "public/lib/pako.min.js",
    },
    {
        name: "zip.js",
        source: "node_modules/@zip.js/zip.js/dist/zip.min.js",
        target: "public/lib/zip.min.js",
    },
    {
        name: "sqlite3",
        source: "node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.js",
        target: "public/lib/sqlite3.js",
    },
    {
        name: "sqlite3-wasm",
        source: "node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm",
        target: "public/lib/sqlite3.wasm",
    },
];

function copyFile(source, target) {
    return new Promise((resolve, reject) => {
        console.log(`Copying ${source}...`);

        // Ensure target directory exists
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`Created directory: ${targetDir}`);
        }

        // Copy the file
        fs.copyFile(source, target, (err) => {
            if (err) {
                reject(err);
                return;
            }

            const stats = fs.statSync(target);
            console.log(
                `✓ Copied ${path.basename(target)} (${(
                    stats.size / 1024
                ).toFixed(1)} KB)`
            );
            resolve();
        });
    });
}

async function copyLibraries() {
    console.log("Copying external libraries...\n");

    try {
        for (const lib of libraries) {
            const sourcePath = path.join(__dirname, "..", lib.source);
            const targetPath = path.join(__dirname, "..", lib.target);

            if (!fs.existsSync(sourcePath)) {
                console.warn(`⚠️  Warning: ${lib.source} not found. Skipping...`);
                continue;
            }

            await copyFile(sourcePath, targetPath);
        }

        console.log("\n✓ All libraries copied successfully!");
        console.log("\nLibraries are now available in public/lib:");
        libraries.forEach((lib) => {
            console.log(`  - ${lib.target}`);
        });
    } catch (error) {
        console.error("\n✗ Error copying libraries:", error.message);
        process.exit(1);
    }
}

// Run the script
copyLibraries(); 