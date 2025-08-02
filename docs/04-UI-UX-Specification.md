# Reactor Revival: User Interface & Experience (UI/UX) Specification
## 1. Overview
This document specifies the requirements for the User Interface (UI), User Experience (UX), and key interaction models for the Reactor Revival game. It aims to ensure a responsive, intuitive, and informative player experience across all devices.
## 2. UI Principles
- **Clarity and Readability:** Game state (Money, Power, Heat) must be visible and easily understood at all times. Text and icons should be legible, using a pixel-art aesthetic.
- **Responsive Design:** The UI must adapt seamlessly from mobile (portrait) to desktop (landscape) layouts.
- **Immediate Feedback:** Player actions (placing parts, purchasing upgrades, selling resources) must provide immediate visual or auditory feedback.
- **Data-Driven UI:** UI elements such as part lists, upgrade buttons, and objectives must be dynamically generated from the external data files (`/public/data/*.json`).


- PWA manifest icons
- Browser favicons
- High-resolution displays
### 3.3 Performance Benefits

- **Faster Loading:** Fewer network requests improve initial page load times
## 4. Screen Flow & Layout
The application consists of a primary "Splash Screen" for game entry and a main "Game Layout" which hosts the different game views.
### 3.1. Screen Flow

(Start) --> [Splash Screen] --+--> [Game Layout: Reactor View] <--> [Game Layout: Upgrades View] <--> [Game Layout: Research View] | +--> [About/Privacy/Terms Pages (Stateless)] <---------+

### 3.2. Main Game Layout
The main game interface is composed of several persistent components:
- **Top Navigation (Desktop):** Provides primary navigation between Reactor, Upgrades, and Research views.
- **Bottom Navigation (Mobile):** Provides primary navigation for smaller screens.
- **Parts Panel:** A sidebar (desktop) or slide-out panel (mobile) for selecting and purchasing reactor components.
- **Info Bar:** A persistent footer displaying critical real-time stats: Money, Power, Heat, and Exotic Particles.
- **Objectives Bar:** A banner at the top of the Reactor view displaying the current objective and its reward.
## 4. Key UI Components & Functional Requirements
### FR-UI-NAV: Navigation
- **FR-UI-NAV-1:** The UI shall provide clear navigation between the **Reactor**, **Upgrades**, and **Research** screens.
- **FR-UI-NAV-2:** On viewports wider than 900px, navigation shall be presented as a persistent top bar.
- **FR-UI-NAV-3:** On viewports 900px or narrower, navigation shall be presented as a persistent bottom bar.
### FR-UI-PARTS: Parts Panel
- **FR-UI-PARTS-1:** The panel shall dynamically display all purchasable parts, loaded from `part_list.json`.
- **FR-UI-PARTS-2:** Parts shall be organized into functional tabs (e.g., Power, Heat).
- **FR-UI-PARTS-3:** A button's affordability state (based on player's Money or EP) must be visually indicated (e.g., grayscale, reduced opacity). Unaffordable parts remain clickable to show a tooltip.
- **FR-UI-PARTS-4:** A visual indicator (e.g., border color) shall show the currently selected part for placement.
### FR-UI-UPGRADES: Upgrade & Research Panels
- **FR-UI-UPGRADES-1:** The panels shall dynamically display all purchasable upgrades, loaded from `upgrade_list.json`.
- **FR-UI-UPGRADES-2:** The panels shall dynamically create and populate all upgrade categories and their contents from upgrade_list.json. UI elements for each category (e.g., headers, containers) must be generated at runtime based on the type field of the available upgrades.
- **FR-UI-UPGRADES-3:** A button's affordability state must be visually indicated (e.g., grayscale, reduced opacity) based on the appropriate currency:
- Standard Upgrades (Money cost): based on player's Money
- Experimental Upgrades (EP cost): based on player's Exotic Particles
- **FR-UI-UPGRADES-4:** Unaffordable upgrades remain clickable to show a tooltip.
- **FR-UI-UPGRADES-5:** Upgrades with prerequisites shall be visually disabled until their prerequisites are met.
### FR-UI-GRID: Reactor Grid
- **FR-UI-GRID-1:** The grid must visually represent the `Tileset` from the core logic, displaying placed parts.
- **FR-UI-GRID-2:** Tiles must have a distinct hover state to indicate the target for an action.
- **FR-UI-GRID-3:** Placed parts with finite lifespans or heat containment must display a status bar indicating their current condition (e.g., remaining ticks, heat level).
- **FR-UI-GRID-4:** Part explosions shall be represented by a brief, clear animation on the affected tile.
### FR-UI-INFO: Info Bar
- **FR-UI-INFO-1:** The bar must display the player's current Money, Power/Max Power, and Heat/Max Heat.
- **FR-UI-INFO-2:** The Exotic Particles display shall be hidden until the player has earned their first particle.
- **FR-UI-INFO-3:** The Power and Heat displays shall function as buttons for manually selling power and venting heat, respectively.
### FR-UI-OBJECTIVE: Objectives Bar
- **FR-UI-OBJECTIVE-1:** The bar shall display the title of the current objective from `objective_list.json`.
- **FR-UI-OBJECTIVE-2:** The reward for the current objective shall be displayed.
- **FR-UI-OBJECTIVE-3:** Upon completion, the bar's appearance shall change (e.g., flash, change border color) and present a "Claim" button if a reward is available.
### FR-UI-TOOLTIP: Tooltip System
- **FR-UI-TOOLTIP-1:** Hovering over a part or upgrade button shall display a tooltip with its title, description, cost, and relevant stats.
- **FR-UI-TOOLTIP-2:** On mobile, a tap on a part/upgrade button shall "lock" the tooltip open, allowing the user to read it and interact with a "Buy" button within the tooltip. A second tap or tap outside the tooltip closes it.
## 5. Visual Feedback Requirements
- **NFR-UI-FB-1 (Heat Warning):** The reactor grid's background shall begin to glow or change color as `current_heat` approaches `max_heat` to provide a clear visual warning.
- **NFR-UI-FB-2 (Meltdown):** A meltdown shall trigger a screen-wide visual effect (e.g., red overlay, screen shake) and a persistent "MELTDOWN" banner.
- **NFR-UI-FB-3 (Objective Flash):** The objective bar shall flash upon completion to draw the player's attention.
- **NFR-UI-FB-4 (Resource Change):** Changes to Money and Exotic Particles should be subtly animated to indicate the change.
