module.exports = {
  globDirectory: "public",
  globPatterns: [
    "index.html",
    "manifest.json",
    "version.json",
    "css/**/*.css",
    "data/**/*.json",
    "img/**/*.{png,svg,jpg,jpeg}",
    "pages/**/*.html",
    "components/**/*.html",
    "lib/**/*.js",
    "src/**/*.js"
  ],
  globIgnores: [
    "**/node_modules/**/*",
    "css/old_app.css",
    "css/old2_app.css",
  ],
  swSrc: "src-sw.js",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};
