# <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_1_1.png" width="35" alt="Reactor Revival icon"> Reactor Revival

[▶ Launch in browser](https://jdial1.github.io/reactor-revival/)

<p align="center">
  <img src="https://raw.githubusercontent.com/jdial1/reactor-revival/master/public/img/misc/preview.png" width="250" alt="Reactor Revival preview">
</p>

**Reactor Revival** is a modern browser-based incremental reactor simulator.  
Build and optimize nuclear reactors using realistic mechanics inspired by **IndustrialCraft²** and its many spiritual successors.

---

## 🔗 Inspirations & Lineage

Reactor Revival draws inspiration from a legacy of reactor simulators:

| Project                | Author(s)           | Link                                                                 |
|------------------------|---------------------|----------------------------------------------------------------------|
| IndustrialCraft²         | IC2 Team             | [Link](https://wiki.industrial-craft.net/index.php?title=Old_Reactor_Mechanics_and_Components) |
| Reactor Planner          | Talonius             | [Link](https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/)   |
| Ic2Exp Reactor Planner   | MauveCloud           | [Link](https://github.com/MauveCloud/Ic2ExpReactorPlanner)           |
| Reactor Incremental      | Cael, Mephyst        | [Link](https://www.kongregate.com/games/Cael/reactor-incremental)    |
| Reactor Knockoff         | cwmonkey             | [Link](https://github.com/cwmonkey/reactor-knockoff)                 |

---

## 🎨 Attribution

Some visual assets (e.g. reactor parts and UI elements) are adapted from **Reactor Knockoff** by [cwmonkey](https://github.com/cwmonkey), used with attribution and respect for the original creator.

If you are the original creator and have concerns or attribution preferences, please [open an issue](https://github.com/jdial1/reactor-revival/issues) or reach out directly.

No assets or code from IndustrialCraft² or Reactor Incremental are used in this project.

---

## Development

Static app lives under `public/` (GitHub Pages deploys that folder). Run **`npm install`** then **`npm run dev`** to serve `public/` locally with COOP/COEP headers (needed for workers and shared-memory paths).

- **`npm run build:sw`** — Workbox injects the precache manifest from root `src-sw.js` into `public/sw.js` (`config/workbox-config.cjs`).
- **Tests** — `npm test` / `npm run test:ci` (full suite); `npm run test:deploy` matches the CI subset (see `package.json`).
- **`scripts/`** — `generate-metadata.js` (version + splash BG counts), vendor copy/bundle (`copy-libs.js`), unified `pwa-check.js` (local root files, `--fix-manifest`, `--remote` post-deploy checks), image compression, console stripping, and the dev server. **`config/`** — ESLint, Vitest, Workbox, Stylelint. See `package.json` `scripts` for the full list.

### Repository layout

- **`public/`** — Everything the host/CDN serves: HTML, CSS, assets, `manifest.json`, and application code as native ES modules under `public/src/` (there is no separate top-level `src/` for app code; that keeps the static-site root obvious).
- **`src-sw.js` (repo root)** — Service worker **source** for Workbox. `npm run build:sw` injects the precache manifest into **`public/sw.js`**, which is what browsers load. Do not edit `public/sw.js` by hand.
- **`config/`** — ESLint, Vitest, Workbox, Stylelint configs.
- **`tests/`** — Vitest suites. `tests/core/` uses domain subfolders (`grid/`, `thermodynamics/`, `engine/`, …); see `tests/README.md`. Tests import app modules via the `@app/` alias (see `jsconfig.json`).

```
repo root:  src-sw.js, config/, scripts/, tests/
ship:       public/   (index.html, sw.js built, public/src/*.js, data/, schema/, …)
```

---
