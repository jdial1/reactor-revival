module.exports = {
  globDirectory: "public",
  globPatterns: [
    "index.html",
    "privacy-policy.html",
    "terms-of-service.html",
    "manifest.json",
    "version.json",
    "css/app.css",
    "fonts/**/*.{otf,woff,woff2,ttf}",
    "lib/fonts/**/*.{woff2,woff,otf,ttf}",
    "data/**/*.json",
    "img/**/*.{png,svg,jpg,jpeg,webp}",
    "lib/**/*.js",
    "lib/reactor-core/games/**/*.json",
    "src/**/*.js"
  ],
  globIgnores: ["**/node_modules/**/*"],
  swSrc: "src-sw.js",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};
