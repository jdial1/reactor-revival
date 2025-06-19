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
  runtimeCaching: [
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
  ],
};
