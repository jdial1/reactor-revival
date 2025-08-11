# Scripts

This folder contains utility scripts for the Reactor Revival project.

## Scripts Overview

### `generate-version.js`
Generates a version.json file with a timestamp in Central Time format (yy_mm_dd-hhmm).
- **Usage**: `npm run generate-version`
- **Output**: Creates `public/version.json`

### `copy-libs.js`
Copies external libraries from node_modules to public/lib for browser access.
- **Usage**: `npm run postinstall` (runs automatically after npm install)
- **Output**: Creates `public/lib/pako.min.js` and `public/lib/zip.min.js`

### `copy-pwa-root-files.js`
Validates that all required PWA files are present in the public directory.
- **Usage**: Called by build process
- **Checks**: sw.js, manifest.json, offline.html, browserconfig.xml

### `fix-github-pages-manifest.js`
Updates manifest.json for GitHub Pages deployment by adjusting start_url and scope.
- **Usage**: Called by GitHub Actions workflow
- **Updates**: start_url, scope, shortcuts URLs

### `post-deploy-pwa-check.js`
Validates PWA deployment by checking manifest, service worker, and critical assets.
- **Usage**: Called by GitHub Actions workflow
- **Checks**: Manifest validity, service worker accessibility, critical assets

## Project Structure

The project now uses `public/` as the single source of truth for both static assets and application code.

### `public/` - Application and assets
- `index.html` - Main application entry point
- `manifest.json` - PWA manifest
- `sw.js` - Service worker
- `offline.html` - Offline fallback page
- `browserconfig.xml` - Browser configuration
- `version.json` - Generated version information
- `css/` - Stylesheets
- `img/` - Images and icons
- `data/` - Game data files
- `pages/` - HTML partials
- `components/` - UI components
- `lib/` - External libraries (copied from node_modules)
- `src/` - JavaScript source code
  - `app.js` - App bootstrap
  - `core/` - Core game logic (engine, game, reactor, etc.)
  - `services/` - External services (PWA, Google Drive, etc.)
  - `components/` - UI components and DOM manipulation
  - `utils/` - Utility functions and helpers

### Root - Project configuration
- `workbox-config.js` - Service worker build configuration
- `vitest.config.mjs` - Test configuration
- `jsconfig.json` - JavaScript configuration
- `src-sw.js` - Service worker source file