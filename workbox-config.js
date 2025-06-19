module.exports = {
  globDirectory: ".",
  globPatterns: [
    "**/*.{html,css}",
    "js/*.js",
    "data/*.js",
    "img/**/*.{png,svg,jpg,jpeg}",
    "manifest.json",
    "version.json",
  ],
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
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
  dontCacheBustURLsMatching: /\.(js|css)$/,
};
