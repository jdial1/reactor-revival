import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const srcDir = path.join(projectRoot, "src");
const publicSrcDir = path.join(projectRoot, "public", "src");

function copyDirectory(src, dest) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    // Read source directory
    const items = fs.readdirSync(src);

    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            // Recursively copy subdirectories
            copyDirectory(srcPath, destPath);
        } else {
            // Copy file
            fs.copyFileSync(srcPath, destPath);
            console.log(`✓ Copied ${item}`);
        }
    }
}

function cleanSrcFromPublic() {
    if (fs.existsSync(publicSrcDir)) {
        fs.rmSync(publicSrcDir, { recursive: true, force: true });
        console.log("🧹 Cleaned public/src directory");
    }
}

function main() {
    const command = process.argv[2];

    if (command === "clean") {
        console.log("Cleaning public/src directory...");
        cleanSrcFromPublic();
        return;
    }

    console.log("Building for deployment...");

    try {
        // Check if src directory exists
        if (!fs.existsSync(srcDir)) {
            console.error("❌ Source directory 'src' not found!");
            process.exit(1);
        }

        // Copy src directory to public/src
        copyDirectory(srcDir, publicSrcDir);

        console.log("✅ Build for deployment completed!");
        console.log(`📁 Source: ${srcDir}`);
        console.log(`📁 Destination: ${publicSrcDir}`);
        console.log("💡 Run 'node scripts/build-for-deploy.js clean' to remove the copied files");

    } catch (error) {
        console.error("❌ Error building for deployment:", error.message);
        process.exit(1);
    }
}

main();