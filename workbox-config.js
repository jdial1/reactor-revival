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
    "sw.js", // We will use this as our source file
  ],
  swSrc: "src-sw.js",
  swDest: "sw.js",
};
