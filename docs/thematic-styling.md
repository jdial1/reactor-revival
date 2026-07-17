# Reactor Revival — Thematic Styling & Theming

> **Purpose:** Canonical reference for the game's visual identity, design tokens, diegetic feedback, and how styling ties to simulation state. Use this when adding UI, tuning heat/meltdown presentation, or choosing colors and typography.
>
> **Audience:** Anyone touching CSS, canvas rendering, templates, or sensory feedback.
>
> **Parent doc:** [`design-foundations.md`](./design-foundations.md) — product identity and UX canon.
>
> **Evidence catalog:** [`related-projects-benchmark.md`](./related-projects-benchmark.md) §4.10 (Navalty diegetic immersion), §9 friction #6 (phased meltdown).
>
> **Last updated:** 2026-06-24

---

## 1. Creative North Star

**Fantasy:** You are a stressed Soviet-era reactor operator at a physical control workstation — not a generic idle-game dashboard.

**Tone:** Industrial, heavy, dangerous. Bakelite switches, phosphor CRT readouts, machined steel panels, amber warning lamps. Math is visible; danger is visceral.

**Promise:** Every surface should feel like it could overheat. Abstract simulation values (heat ratio, hull integrity, net heat) drive **diegetic** visual degradation — scanlines intensify, VU meters flicker, the screen jitters, klaxons fire. Flavor arrives via toasts and banners, never modal dialogue walls mid-optimization.

**When in doubt:** Prefer tokens over literals, bevel over flat Material, terminal readouts over friendly sans-serif, and phased warning over sudden death.

---

## 2. How to Use This Document

| Question | Go to |
|----------|-------|
| "What aesthetic are we going for?" | §1 + §3 Visual Pillars |
| "Which color token do I use?" | §5 Token Layers |
| "Which font for this element?" | §6 Typography Roles |
| "How does heat affect the UI?" | §8 Diegetic & Sim-Reactive Styling |
| "Where do I put new CSS?" | §12 File Map + §13 PR Rules |
| "Can I add a light theme?" | §5.1 — not 1.0 |
| "How does canvas get colors?" | §11 Canvas Bridge |

**Rule:** New UI must consume existing CSS custom properties. Hardcoded hex/rgb in component code is allowed only for one-off canvas math or when mirroring a token via `readThemeColor()`.

---

## 3. Visual Pillars

| Pillar | Description | Primary tokens / patterns |
|--------|-------------|---------------------------|
| **Sovietwave palette** | Muted slate chassis, amber phosphor accents, bone paper text, industrial red for danger/commit | `--sovietwave-*` |
| **G.O.S.T. terminal** | Operator console semantics: nominal green, active gold, critical red | `--gost-*` |
| **Retro bevel chrome** | Pseudo-3D panels and buttons — light top/left, dark bottom/right | `--bevel-*`, `.bevel-panel`, `.industrial-btn` |
| **CRT workstation** | Phosphor scanlines, vignette, cathode flicker on meters, screen jitter under stress | `--phosphor-mask`, `--crt-vignette`, `--crt-heat` |
| **Machined surfaces** | Cross-hatch tile backgrounds, knurled scrollbars, inset wells | `--machined-texture`, `--knurled-grip`, `--well-depth` |
| **Diegetic data viz** | Power/heat as VU segments; heat flow arrows on grid; heat-map overlay | `info-bar.css`, `ui-heat-visuals.js` |
| **Stalenhag melancholy** | Splash/carousel backgrounds — desolate industrial landscapes, not stock photos | `stalenhag_bg/*.webp`, `--splash-bg-url` |

---

## 4. Aesthetic Lineage

| Influence | What we take | What we reject |
|-----------|--------------|----------------|
| **IC2 Old Reactor** | Durability bars, hull heat tension, meltdown runway | Inventory-only heat with no spatial overlay |
| **Navalty** | CRT terminal as physical workstation | Visual-novel pacing breaks |
| **Sovietwave / cassette futurism** | Amber-on-slate, military olive, rust accents | Neon cyberpunk, flat iOS cards |
| **Press Start 2P era** | Chunky pixel labels for game chrome | Pixel font for long body copy |
| **Simon Stålenhag** | Splash atmosphere — lonely industrial Scandinavia | Bright cartoon idle aesthetics |

---

## 5. Token Layers

Tokens live in `:root` in `public/css/main.css`. Treat layers as dependency order — never reference a child token from a parent definition.

### 5.1 Theme Mode

| Item | Value | Notes |
|------|-------|-------|
| HTML attribute | `data-theme="dark"` | Set on `<html>` in `index.html` |
| PWA `theme_color` | `#1f2120` | Matches `--sovietwave-slate` (`manifest.json`) |
| Light theme | **Not shipped** | Single dark industrial palette for 1.0; do not add `prefers-color-scheme` overrides without a design pass here |

### 5.2 Sovietwave Core

| Token | Hex / value | Role |
|-------|-------------|------|
| `--sovietwave-slate` | `#1F2120` | Page chassis, `#main` background |
| `--sovietwave-amber` | `#FFB000` | Primary accent — titles, warnings, selected states, CRT glow |
| `--sovietwave-paper` | `#E0D8C3` | Primary readable text on dark panels |
| `--sovietwave-industrial-red` | `#A33B2B` | Destructive actions, critical chrome, meltdown accents |

### 5.3 G.O.S.T. Terminal

| Token | Hex | Role |
|-------|-----|------|
| `--gost-chassis` | `#1A1D1A` | Deep console body (pause banner, BIOS) |
| `--gost-panel` | `#2C302E` | Raised panel fill |
| `--gost-text` | `#E6E6E6` | High-contrast terminal copy |
| `--gost-nominal` | `#6E8B3D` | OK / vent / success readouts |
| `--gost-active` | `#DAA520` | Active / in-progress |
| `--gost-critical` | `#A53A3A` | Critical state text |
| `--gost-bevel-highlight` | `#7A7D7A` | Inner highlight edge |
| `--gost-bevel-shadow` | `#222422` | Inner shadow edge |

### 5.4 Game Semantics

| Token | Role |
|-------|------|
| `--game-success-color` | Money, affordable, positive feedback |
| `--game-warning-color` | Caution, leaderboard offline, affordability hints |
| `--game-danger-color` | Errors, hull empty, cannot afford |
| `--game-primary-color` | Neutral emphasis (EP, links) |

Map UI states to these before inventing new hues.

### 5.5 Bevel & Chrome

| Token | Role |
|-------|------|
| `--bevel-light` / `--bevel-mid` / `--bevel-dark` / `--bevel-shadow` | Standard raised/inset border quadrants |
| `--panel-bg` | Flat panel interior |
| `--inset-bg` | Recessed well interior |
| `--splash-bevel-width` | Heavy splash buttons (5px) |
| `--splash-shadow-solid` | Drop shadow for industrial panels |

**Utility classes:** `.bevel-panel`, `.bevel-btn`, `.industrial-panel`, `.industrial-btn`, `.inset-well` — prefer these over re-declaring border quadrants.

### 5.6 Splash & Onboarding

Splash reuses Sovietwave but adds warmer material tones:

| Token | Role |
|-------|------|
| `--splash-bakelite` / `--splash-bakelite-dark` | Button faces (bakelite switch feel) |
| `--splash-military-green` / `-dark` | Alternate commit surfaces |
| `--splash-rust` / `--splash-rust-dark` | Quick-start headers, destructive emphasis |
| `--splash-charcoal` | Modal/card bodies |
| `--splash-accent-olive` | Mute control, secondary chrome |
| `--splash-font` | `"Share Tech Mono"` — splash-only typography |
| `--splash-bg-url` | Runtime carousel URL (set in `index.html` inline script) |

### 5.7 Texture & Atmosphere

| Token | Role |
|-------|------|
| `--phosphor-mask` | Horizontal scanline overlay on `.page::after` |
| `--crt-vignette` | Edge darkening (available for overlays) |
| `--rail-notches` | Scrollbar track machining |
| `--knurled-grip` | Scrollbar thumb texture |
| `--machined-texture` | Tile/grid machined background |
| `--well-depth` | Deep inset box-shadow recipe |
| `--glow-amber` / `--glow-green` | Hover and nominal glows |

### 5.8 Layout & Density

| Token | Default | Role |
|-------|---------|------|
| `--tile-size` | `48px` | Reactor cell size |
| `--bottom-nav-height` | `40px` (52px mobile) | Footer clearance |
| `--main-top-nav-height` | `60px` | Desktop top bar |
| `--drawer-panel-width` | `min(420px, 92vw)` | Settings/drawer slide |
| `--vu-segments` | `16` | Cathode VU meter divisions |

### 5.9 Canvas & Runtime Tokens

Canvas drawing and inline templates read additional tokens via `theme-colors.js`. These should be defined on `:root` alongside UI tokens (consolidate into `main.css`; avoid scattering).

| Token family | Consumer | Purpose |
|--------------|----------|---------|
| `--surface-gost` | `COLORS.tileBg` | Grid tile fill |
| `--canvas-heat-fill`, `--canvas-heat-bar-bg` | Heat/durability bars on canvas | |
| `--canvas-heat-flow` | Heat-flow arrow overlay | |
| `--canvas-highlight-*`, `--canvas-hover-*` | Placement preview | |
| `--canvas-explosion-*` | Meltdown burst FX | |
| `--canvas-confirm-*`, `--canvas-afford`, `--canvas-cannot-afford` | Modal/copy-paste actions | |
| `--status-danger`, `--text-primary`, `--neutral-*` | Error/splash fallbacks, PWA update modal | |

**Bridge API:** `readThemeColor(name)`, `getCanvasColors()`, `COLORS` proxy, `resetThemeColors()` — `public/src/theme-colors.js`.

### 5.10 Doctrine Accents

Research/tech trees may supply per-tree color in `tech_tree.json` (`color` field). The active doctrine color is exposed as `--doctrine-color` on `#wrapper` via `buildShellStyleMap()` (`ui-state.js`) and on doctrine cards in research UI (`appTemplates.js`). Doctrine accent is **additive** — it tints chrome and accents globally, never replaces global semantic colors.

---

## 6. Typography Roles

Fonts are loaded in `public/css/fonts.css` (copied to `public/lib/fonts/` via `copy-libs`).

| Role | Token / family | Use for |
|------|----------------|---------|
| **Pixel chrome** | `--ui-pixel-font` → Press Start 2P | Nav labels, objectives toast, page `h2`, game buttons, short labels |
| **Terminal body** | `--ui-terminal-font` → Share Tech Mono | About/credits, research hints, leaderboard status, BIOS details, long-form secondary copy |
| **Splash** | `--ui-terminal-font` / `--splash-font` | Splash screen, save slots, auth terminal — Share Tech Mono with wider letter-spacing |
| **Legal / fallback** | System monospace | Error stacks, critical boot failure |

**Rules:**

- Default `body` font is Press Start 2P — override deliberately per section.
- Do not use Press Start 2P for paragraphs longer than ~2 lines; switch to `--ui-terminal-font`.
- Uppercase + letter-spacing (`0.04em`–`0.12em`) for operator labels and section headers.
- Tabular numerals for timers and save-slot playtime (`font-variant-numeric: tabular-nums`).

---

## 7. Surface & Component Patterns

### 7.1 Page Shell

Every in-game page (`.page`) shares:

1. `--sovietwave-slate` base
2. `::before` — subtle green-to-amber vertical grade (facility lighting)
3. `::after` — phosphor scanline mask at 50% opacity
4. `cathode-ignition` entry animation (steps, not ease)

On first paint after navigation, the CRT "powers on" — do not replace with fade-only transitions.

### 7.2 Info Bar (VU Meters)

Desktop power and heat items use **segmented cathode tubes**:

- Cyan segments (`#00e8ff`) for power, amber for heat
- `clip-path` fill driven by `--fill-height`
- `cathode-flicker` animation on active meters
- Extra shake/warm filter when heat exceeds safe band

Mobile condenses the same semantics into the compact `#info_bar` row.

### 7.3 Modals & Drawers

- Square corners (`border-radius: 0` everywhere in industrial chrome)
- 3–6px bevel borders, `4px 4px 0` drop shadows
- Titles in `--sovietwave-amber` with pixel outline text-shadow
- Destructive confirm: `--sovietwave-industrial-red` or `--canvas-confirm-danger`

### 7.4 Objectives & Toasts

- Toast button: collapsible industrial pill, amber complete state
- Chapter flavor: banner/toast only — matches design-foundations §5 R8 (no dialogue walls)

### 7.5 Blueprint Planner Mode

`body.blueprint-planner-active` shifts reactor chrome to **cool cyan** accent (`--blueprint-accent: rgb(0 180 220)`) — visually distinct from live heat stress without a separate theme file.

---

## 8. Diegetic & Sim-Reactive Styling

Simulation state drives CSS variables and classes. This is the core "theming engine" — not user-selectable skins.

### 8.1 Heat Phase Model

| Phase | Heat ratio | Visual behavior | Audio (paired) |
|-------|------------|-----------------|----------------|
| **Nominal** | `< 0.8` | Default scanlines; balanced net heat caps `--core-danger` at 0.5 | Ambient tick hum |
| **Warning** | `≥ 0.8` | `#reactor_background.heat-warning` — red inset glow | Warning manager escalation |
| **Critical** | `≥ 1.0` (unbalanced) | Full `--core-danger`; saturation + hue shift on `#app_root` | Klaxons |
| **Repulsion** | `≥ 1.3` (unbalanced) | `crt-heat-tearing` — horizontal clip tear on `#app_root` | Industrial alarm |
| **Meltdown** | `failure_state === meltdown` | `body.reactor-meltdown` — `hue-rotate(-50deg) contrast(1.5)` on `#wrapper`; meltdown banner | Meltdown SFX |

**Drivers:** `ui-state.js` (`core_danger`, `heat_ratio`), `heatDomSync.js`, `ui-heat-visuals.js`.

**CSS variables (runtime):**

| Variable | Set by | Effect |
|----------|--------|--------|
| `--core-danger` | `ui-state` subscription | `#app_root` saturation/hue-rotate |
| `--crt-heat` | heat ratio normalized | Cathode text-shadow bleed |
| `--crt-jitter-duration` | `20 - heatNorm * 12` seconds | Jitter animation speed |
| `--heat-ratio` | `heatDomSync` | Background alpha classes |

**Balanced net heat:** When `isHeatNetBalanced()` is true, danger visuals are **capped** at `--core-danger` 0.5 (amber) and warning audio (klaxons, geiger) is **suppressed** — the UI respects intentional high-heat designs (EP weave, controlled burn).

### 8.2 Pause & Meltdown Body Classes

| Class | Trigger | Styling |
|-------|---------|---------|
| `game-paused` | `uiState.is_paused` | Pause banner (`#pause_banner`) — amber on `--gost-chassis` |
| `reactor-meltdown` | `uiState.is_melting_down` | Wrapper color distortion + meltdown banner |
| `modal-drawer-open` | Drawer open | `#wrapper` translateX for settings panel |
| `shop-overlay-open` | Shop visible | Reactor remains visible (identity I4) |

### 8.3 Global Noise & Idle

- `body::before` — 3% fractal noise overlay (film grain)
- `html.ui-idle` (45s inactivity via `ui-idle-effects.js`) — dampens CRT flicker, VU animations, phosphor opacity; tab hidden forces idle immediately
- `html.reduced-motion-app` + `prefers-reduced-motion` — disables jitter, tearing, cathode flicker (`preferences.reducedMotion` syncs `--prefers-reduced-motion`)

### 8.4 Failure Flavor

Copy for phased warnings lives in `failure_flavor.json`. Styling must support banner/toast presentation — not full-screen narrative. Wire sensory phases per design-foundations §3.5 meltdown row (partial).

---

## 9. Background Art Direction

### 9.1 Splash Carousel

Inline boot script (`index.html`):

- Default: **Stålenhag** set (`stalenhag_bg/bg_img{N}.webp`, N = 1–30)
- Alternate: `splash_bg{N}.webp` (`USE_STALENHAG_BG = false`)
- Fair rotation via localStorage counts; 30s carousel; sets `--splash-bg-url`
- Ken Burns `splash-ken-burns` on `#splash-screen`

### 9.2 In-Game Reactor

- `#reactor_background` — transparent base; heat classes add inset glow
- No photographic backgrounds behind the grid during play — focus stays on parts and overlays

### 9.3 Asset Rules

- Prefer **WebP** for large backgrounds (PNG sources retired)
- Industrial/desolate tone; no bright stock photography
- Compress via `scripts/build/compress-images.js` before commit

---

## 10. Audio as Thematic Extension

Visual and audio theming are paired — same phases, same mute-safe fallbacks.

| Layer | Module | Thematic role |
|-------|--------|---------------|
| Tick ambience | `services-audio.js`, `audio-industrial-manager.js` | Rhythmic machinery ASMR bound to sim cadence |
| Warnings | `audio-warning-manager.js` | Klaxons scale with heat phase |
| Preferences | `preferences.js` volume channels | Master, effects, alerts, system, ambience |

**Rule:** Every alert SFX must have a visual counterpart (banner, meter, overlay) for mute players — per incremental-sim benchmark effect-pipeline guidance.

---

## 11. Canvas Bridge

Grid rendering (placement preview, heat bars, explosions) must not hardcode colors that diverge from CSS.

```javascript
import { COLORS, readThemeColor, resetThemeColors } from "./theme-colors.js";
```

- `COLORS` reads computed `:root` custom properties once (cached)
- `resetThemeColors()` flushes the cache; `subscribe(preferences, …)` in `theme-colors.js` auto-invalidates on preference changes
- Heat-flow SVG overlays use `--canvas-heat-flow` for stroke/fill
- Grid tile chrome in `reactor-grid.css` uses `--neutral-black` and `--gost-chassis` — no raw hex on `.tile`

---

## 12. File Map

```
public/css/main.css              ← :root tokens, page shell, bevel utilities, BIOS
public/css/fonts.css             ← @font-face declarations
public/css/splash.css            ← splash, save slots, page entry animations
public/css/info-bar.css          ← VU meters, bottom nav, stats chrome
public/css/reactor-grid.css      ← grid tiles (--neutral-black, --gost-chassis), heat-warning classes, blueprint accent
public/css/reactor-mobile.css    ← mobile layout overrides
public/css/objectives.css        ← objectives toast, modals, pause banner
public/css/settings-modal.css    ← settings drawer, pico overrides
public/css/ui-idle-effects.css   ← idle + reduced-motion dampening
public/css/ui-secondary-pages.css← upgrades hub, about, leaderboard accents

public/src/theme-colors.js       ← canvas token bridge; preference subscription auto-reset
public/src/ui-idle-effects.js    ← ui-idle class toggling
public/src/heatDomSync.js        ← reactor background heat classes; isHeatNetBalanced
public/src/state/ui-state.js     ← --core-danger, meltdown body classes, declarative shell flags
public/src/components/ui-heat-visuals.js ← overlays, heat-flow arrows
public/src/state/preferences.js  ← reducedMotion DOM sync

public/img/misc/stalenhag_bg/    ← splash carousel art
public/img/misc/backgrounds/     ← alternate splash backgrounds
```

**Load order** (from `index.html`): `fonts` → `main` → feature CSS → `ui-idle-effects` → `ui-secondary-pages` → `prod_fixes` (deploy alignment layer when present).

---

## 13. PR Rules & Hard Rejects

### Do

- Add or extend tokens in `main.css` `:root` before using new colors in feature CSS
- Merge into existing selectors (check for duplicate rules first)
- Use semantic tokens (`--game-warning-color`) for state colors
- Respect `reducedMotion` and `prefers-reduced-motion`
- Keep blueprint mode visually distinct via `blueprint-planner-active` pattern

### Do not

| Reject | Why |
|--------|-----|
| Flat Material/iOS cards (rounded 12px, soft gray shadows) | Breaks industrial fantasy |
| Purple gradient idle-game palette | Genre drift |
| Light theme toggle without full token audit | Half-dark breaks bevel readability |
| Full-screen white modal over reactor | Identity I4 — shop overlay solved this |
| Animation-only danger (no meter/banner) | Mute accessibility |
| Random hex in `public/src` templates | Use `var(--token)` or `readThemeColor` |
| Photoreal UI chrome | Stålenhag is for splash atmosphere only |
| Pulsing rainbow / chain-reaction RNG VFX | Determinism + design-foundations §3.5 |

---

## 14. Known Gaps

| Gap | Canonical target | Fix direction |
|-----|------------------|---------------|
| Surge / EP weave celebration VFX | Radioactive Idle deterministic ripples | **Fixed** — deterministic `fx-ep`, `fx-power`, and `fx-heat` sprites spawn on thresholds via `ui-heat-visuals.js` and worker events. |
| `prod_fixes.css` alignment layer | Production parity | Keep generated/audited; tokens upstream to `main.css` |
| Doctrine color only on research chrome | Data-driven accents | **Fixed** — active doctrine color exposed on `#wrapper` via `buildShellStyleMap()` in `ui-state.js`; CSS consumes `var(--doctrine-color, var(--sovietwave-amber))` globally |
| i18n / RTL layout | Post-1.0 | String tables first; mirror bevel logic carefully |
*(Resolved: Canvas tokens mapped to CSS via `theme-colors.js`, Meltdown sensory phases fully wired, and surge/EP weave VFX shipped)*

Rollup priority aligns with design-foundations §8 P1 (grid undo history).

---

## 15. Document Hierarchy

```
design-foundations.md          ← product & UX source of truth
├── thematic-styling.md        ← YOU ARE HERE (visual identity & tokens)
├── related-projects-benchmark.md      ← genre sensory evidence (Navalty, IC2)
├── incremental-sim-architecture-benchmark.md  ← effect pipeline engineering
└── public/css/main.css        ← token implementation authority
```

**Maintenance**

- New token → add to §5 here, then `main.css`, then consumers.
- New diegetic phase → update §8.1 table and design-foundations §3.5 meltdown row.
- Quarterly: verify canvas bridge tokens match `:root` (grep `--canvas-`).

---

## 16. One-Page Summary

| Layer | We build | We reject |
|-------|----------|-----------|
| **Palette** | Sovietwave slate + amber + industrial red | Neon cyberpunk, pastel idle |
| **Chrome** | Bevel panels, inset wells, knurled scrollbars | Flat cards, 12px radius |
| **Type** | Press Start 2P chrome + Share Tech Mono body | Inter/Roboto default |
| **Atmosphere** | CRT scanlines, phosphor, film grain | Clean flat white UI |
| **Reactivity** | Heat → danger vars → jitter/tear/meltdown | Static danger color only |
| **Splash** | Stålenhag carousel, bakelite buttons | Stock photos, gradient blobs |
| **Canvas** | `theme-colors.js` reads CSS tokens | Hardcoded draw colors |
| **A11y** | Reduced motion + ui-idle dampening | Motion-only warnings |
| **Blueprint** | Cool cyan planner accent | Second full theme file |

**North star in one line:** *A Soviet industrial CRT workstation where the UI itself overheats — one dark token system, simulation-driven diegetic styling, canvas parity with CSS.*
