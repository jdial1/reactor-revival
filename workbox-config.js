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
    "src-sw.js", // This is the source, not the destination file
    ".github/**/*",
    "README.md",
    ".gitignore",
  ],
  swSrc: "src-sw.js",
  swDest: "sw.js",
};
