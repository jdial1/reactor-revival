module.exports = {
  globDirectory: "public",
  globPatterns: [
    "index.html",
    "offline.html",
    "css/**/*.css",
    "data/**/*.js",
    "img/**/*.{png,svg,jpg,jpeg}",
    "pages/**/*.html",
    "components/**/*.html",
    "manifest.json",
    "version.json",
    "lib/**/*.js",
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
