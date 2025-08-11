import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep Vite-aware settings (aliases, publicDir) available even when Vitest
// isn't loading vitest.config.mjs (e.g., raw CI commands). Vitest will also
// pick this up automatically and merge it with its own config.
export default defineConfig({
    publicDir: false,
    resolve: {
        alias: [
            { find: "@components", replacement: path.resolve(__dirname, "public/src/components") },
            { find: "@app/components", replacement: path.resolve(__dirname, "public/src/components") },
            { find: "@app", replacement: path.resolve(__dirname, "public/src") },
            { find: "@public", replacement: path.resolve(__dirname, "public") },
        ],
    },
});


