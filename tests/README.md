# Reactor Revival Test Suite

Vitest runs against the app under `public/` with jsdom. Shared setup lives in `tests/helpers/setup.js` and `tests/helpers/setupDecimal.js` (see `config/vitest.config.mjs`).

## Layout

| Directory | Role |
|-----------|------|
| **`tests/core/`** | Game engine, reactor grid, parts, upgrades, heat, objectives, save/load, service worker behavior, audio, and related integration-style cases |
| **`tests/ui/`** | DOM, components, layout, hotkeys, EP display, modals, and user-driven flows |
| **`tests/simulation/`** | Longer or scripted simulation runs (e.g. speedrun-style scenarios) |
| **`tests/services/`** | External-facing services (e.g. leaderboard) |
| **`tests/helpers/`** | Shared test utilities and Vitest setup |
| **`tests/fixtures/`** | Static data used by tests (e.g. layouts) |

`tests/core/performance.test.js` is excluded from the default Vitest run; use `npm run test:performance` for that file.

## Commands

Full suite (see `package.json`):

```bash
npm test
npm run test:ci
```

Subset by folder (pass paths after `--`):

```bash
npm test -- tests/core
npm test -- tests/ui
npm test -- tests/simulation
npm test -- tests/services
```

Single file:

```bash
npm test -- tests/core/engine.test.js
```

Performance test:

```bash
npm run test:performance
```

Deploy-style subset (matches CI `test:deploy` exclusions):

```bash
npm run test:deploy
```
