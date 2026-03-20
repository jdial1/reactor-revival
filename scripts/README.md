# Scripts

Utility scripts for the Reactor Revival project. Commands wired from `package.json` use `npm run <script>`. Use `npm run dev` for local work: it serves `public/` with COOP/COEP headers (needed for workers and shared memory paths).

## npm scripts


| Script                 | File                      | Purpose                                                             |
| ---------------------- | ------------------------- | ------------------------------------------------------------------- |
| `generate-version`     | `generate-version.js`     | Writes `public/version.json` (Central Time timestamp).              |
| `copy-libs`            | `copy-libs.js`            | Copies/bundles vendor JS into `public/lib` (runs on `postinstall`). |
| `dev`                  | `serve-with-coop.js`      | Local static server with COOP/COEP headers.                         |
| `check-pwa-root-files` | `check-pwa-root-files.js` | Verifies required PWA files exist under `public/`.                  |
| `remove-console-logs`  | `remove-console-logs.js`  | Strips `console` calls from selected sources (manual maintenance).  |
| `compress-images`      | `compress-images.js`      | Image compression helper.                                           |
| `generate-bg-count`    | `generate-bg-count.js`    | Regenerates background image count metadata.                        |


## CI-only (GitHub Actions)


| File                           | Purpose                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| `fix-github-pages-manifest.js` | Adjusts `manifest.json` `start_url` / `scope` for GitHub Pages.       |
| `post-deploy-pwa-check.js`     | Post-deploy checks against the live Pages URL (manifest, SW, assets). |


## Project structure (`public/`)

Static app root: `index.html`, `privacy-policy.html`, `terms-of-service.html`, `manifest.json`, `browserconfig.xml`, generated `version.json` and `sw.js`, plus `css/`, `data/`, `img/`, `lib/`, `schema/`, and `src/`.

**Page templates (Lit):** Routed game chrome and sections live under `public/src/templates/`: `pageShellTemplates.js` (main nav / `#wrapper` shell), `sectionPageTemplates.js` (tab pages, leaderboard, about, etc.), `legalPageTemplates.js` (privacy + terms body shared by the in-app router and standalone legal pages). `pageTemplates.js` re-exports these for a single import path. Standalone shareable legal URLs use `public/privacy-policy.html` and `public/terms-of-service.html`, which load `src/renderLegalStandalone.js` and the same legal templates (no duplicate copy).

### `public/src/` (application JS)

- `app.js` — bootstrap
- `logic.js`, `state.js`, `services.js`, `utils.js` — core game and app logic
- `components/` — UI modules (grid, modals, tooltips, controllers, etc.)
- `templates/` — Lit templates for UI and routed pages; `renderLegalStandalone.js` bootstraps legal HTML entrypoints only
- `worker/` — web workers (game loop, physics)

Service worker source lives at repo root `src-sw.js`; `npm run build:sw` generates `public/sw.js` via Workbox (`config/workbox-config.cjs`).

### Tooling

- `config/workbox-config.cjs` — service worker precache glob config
- `config/vitest.config.mjs` — tests
- `config/eslint.config.js`, `config/.stylelintrc.json` — linting
- Root `jsconfig.json` — editor/JS project hints

