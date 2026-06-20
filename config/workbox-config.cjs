module.exports = {
  globDirectory: "public",
  globPatterns: [
    "index.html",
    "privacy-policy.html",
    "terms-of-service.html",
    "manifest.json",
    "version.json",
    "css/**/*.css",
    "data/**/*.json",
    "img/**/*.{png,svg,jpg,jpeg}",
    "lib/**/*.js",
    "src/**/*.js"
  ],
  globIgnores: ["**/node_modules/**/*"],
  swSrc: "src-sw.js",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};
