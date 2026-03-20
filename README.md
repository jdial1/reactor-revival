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
- **`scripts/`** — version stamp, vendor copy/bundle, PWA checks, image helpers, and workflow-only helpers (`fix-github-pages-manifest.js`, `post-deploy-pwa-check.js`). **`config/`** — ESLint, Vitest, Workbox, Stylelint. See `package.json` `scripts` for the full list.

---
