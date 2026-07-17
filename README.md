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

Static app lives under `public/` (GitHub Pages deploys that folder). Run **`npm install`** then **`npm run dev`** to serve `public/` locally.

- **`npm run build:sw`** — Workbox injects the precache manifest from `config/src-sw.js` into `public/sw.js`.
- **Tests** — `npm test` (lint + syntax + Vitest). Playwright e2e is separate: `npm run test:e2e` (`e2e/`). See `tests/README.md`.
- **`scripts/`** — `build/` (serve, copy-libs, generate/bundle), `qa/` (test/lint/pwa/debt), `ui-audit/` (screenshots/console). See `package.json` `scripts`.

### Repository layout

- **`public/`** — Ship root: HTML, CSS, assets, `manifest.json`, `public/src/` app modules.
- **`public/data/`** — Host-facing JSON (objectives, help, changelog, splash counts, etc.). Bundled into `public/src/generated/bundledStaticData.js`.
- **`game-data/reactor_revival/`** — Lib-shaped catalog overlay (`parts.json`, `upgrades.json`, …) copied into `public/lib/reactor-core/games/` by `copy-libs`. Not the host UI data dir.
- **`config/src-sw.js`** — Service worker source. Do not edit `public/sw.js` by hand.
- **`config/`** — ESLint, Vitest, Workbox, Stylelint, SW source.
- **`tests/`** — Vitest (unit/integration/UI-in-jsdom). **`e2e/`** — Playwright browser flows.
- **`docs/`** — Design notes and lib cutover notes.

### Splash backgrounds

Both sets are live, selected by `USE_STALENHAG_BG` in `public/index.html`:

- `public/img/misc/stalenhag_bg/` — primary when the flag is on
- `public/img/misc/backgrounds/splash_bg*.webp` — fallback set

```
repo:   config/, scripts/{build,qa,ui-audit}/, tests/, e2e/, game-data/, docs/
ship:   public/  (index.html, sw.js, src/, data/, css/, img/, fonts/)
```

---
