module.exports = {
  globDirectory: ".",
  globPatterns: ["**/*.{html,css,js,json,png,xml}"],
  globIgnores: [
    "node_modules/**/*",
    "tests/**/*",
    "scripts/**/*",
    "vitest.config.js",
    "package.json",
    "package-lock.json",
    "workbox-config.js",
    "src-sw.js",
    ".github/**/*",
    "README.md",
    ".gitignore",
  ],
  swSrc: "src-sw.js",
  swDest: "sw.js",
};
