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
        name: "zod",
        source: "https://cdn.jsdelivr.net/npm/zod@3.24.0/+esm",
        target: "public/lib/zod.js",
        isUrl: true,
    },
    {
        name: "break_infinity.js",
        source: "node_modules/break_infinity.js/dist/break_infinity.min.js",
        target: "public/lib/break_infinity.min.js",
    },
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
        name: "lit-html",
        source: "node_modules/lit-html/lit-html.js",
        target: "public/lib/lit-html.js",
    },
];

async function copyFromUrl(url, target) {
    console.log(`Downloading ${url}...`);
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(target, buffer);
    console.log(`✓ Downloaded ${path.basename(target)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

function copyFile(source, target, isUrl = false) {
    if (isUrl) return copyFromUrl(source, target);
    return new Promise((resolve, reject) => {
        console.log(`Copying ${source}...`);
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`Created directory: ${targetDir}`);
        }
        fs.copyFile(source, target, (err) => {
            if (err) {
                reject(err);
                return;
            }
            const stats = fs.statSync(target);
            console.log(`✓ Copied ${path.basename(target)} (${(stats.size / 1024).toFixed(1)} KB)`);
            resolve();
        });
    });
}

async function copyLibraries() {
    console.log("Copying external libraries...\n");

    try {
        for (const lib of libraries) {
            const targetPath = path.join(__dirname, "..", lib.target);
            if (lib.isUrl) {
                await copyFile(lib.source, targetPath, true);
            } else {
                const sourcePath = path.join(__dirname, "..", lib.source);
                if (!fs.existsSync(sourcePath)) {
                    console.warn(`⚠️  Warning: ${lib.source} not found. Skipping...`);
                    continue;
                }
                await copyFile(sourcePath, targetPath);
            }
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