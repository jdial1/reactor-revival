
---
# <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_1_1.png" width="35" alt="Reactor Revival icon"> Reactor Revival


<p align="center">
  <img src="https://github.com/jdial1/reactor-revival/blob/master/img/misc/preview.png" width="250" alt="Reactor Revival preview">
</p>

**Reactor Revival** is a modern browser-based incremental reactor simulator. Build and optimize nuclear reactors using realistic mechanics inspired by the **IndustrialCraft²** mod for Minecraft—and the long line of games and tools that came after it.

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_1_2.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  A Legacy of Reactor Design

Reactor Revival is the latest step in a storied chain of reactor games and planners:
*  **<img src="https://wiki.industrial-craft.net/images/archive/c/cc/20120922200247%21Grid_Uranium_Cell.png" width="64" alt="Industrial Craft Cell">  [ IndustrialCraft² ](https://wiki.industrial-craft.net/index.php?title=Old_Reactor_Mechanics_and_Components)** - The Original IC2 Reactor Minecraft Mod.
*  **<img src="https://github.com/jdial1/reactor-revival/blob/master/img/misc/reactor_planner.png" width="64" alt="Reactor Planner Cell">  [ Talonius’s Reactor Planner ](https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/)** – An IC2 reactor planner tool.
*  **<img src="https://github.com/MauveCloud/Ic2ExpReactorPlanner/blob/master/src/assets/ic2/textures/items/reactorUraniumSimple.png?raw=true)" width="64" alt="Exp Reactor Planner Cell">  [ MauveCloud’s IC2 Experimental Planner ](https://github.com/MauveCloud/Ic2ExpReactorPlanner)** – A rebuilt IC2 reactor planner tool supporting GregTech and IC2 Experimental mechanics.
*  **<img src="https://github.com/jdial1/reactor-revival/blob/master/img/misc/reactor_incremental.png" width="64" alt="Exp Reactor Incremental Cell"> [ Reactor Incremental ](https://www.kongregate.com/games/Cael/reactor-incremental)** by Cael (with help from Mephyst) – A clicker/idle game that turned IC2-style reactors into a rewarding progression system with prestige and exotic particles.
*  **<img src="https://github.com/cwmonkey/reactor-knockoff/blob/master/img/cell_1_1.gif?raw=true" width="64" alt="Reactor Knockoff Cell">[ Reactor Knockoff ](https://github.com/cwmonkey/reactor-knockoff)** by cwmonkey – A HTML5/JavaScript web adaptation of Reactor Incremental.

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_2_1.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Play Now

 [Launch Reactor Revival in your browser](https://jdial1.github.io/reactor-revival/)

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_2_2.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Features

* **Complex Reactor Simulation** – Manage energy generation, heat flow, and cooling in a tick-based simulation.
* **Deep Component System** – Fuel cells, heat vents, exchangers, capacitors, reflectors, and more.
* **Prestige & Exotic Particles** – Unlock long-term upgrades through experimentation and reactor resets.
* **Objective-Based Gameplay** – Learn and expand your strategy via a guided progression system.
* **Pixel-Perfect UI** – Stylish industrial visuals with responsive layout, tooltips, and clarity.
* **Offline Support** – Built as a Progressive Web App (PWA), installable and playable offline.
* **Save System** – Automatic saves using local browser storage.
* **Tested Core Logic** – Powered by Vitest for maintainable and reliable development.

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_3_1.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Gameplay Overview

1. **Build a Reactor** – Place cells and cooling parts on the grid.
2. **Manage Heat** – Prevent meltdowns with cooling strategies.
3. **Generate Power** – Sell energy for money, then reinvest.
4. **Upgrade and Expand** – Enhance your setup and unlock new mechanics.
5. **Prestige for EP** – Use Exotic Particles to gain powerful persistent upgrades.
6. **Repeat and Optimize** – Build smarter with each cycle.
   
---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_3_2.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Getting Started (Local Dev)

```bash
git clone https://github.com/jdial1/reactor-knockoff.git
cd reactor-knockoff
npm install
npm run dev
```

Then open your browser to the game.

Other commands:

```bash
npm start        # Start simple server
npm test         # Run test suite
npm run build:sw # Build the service worker
```

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_4_1.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Project Structure

```
css/         → Styling
data/        → Reactor parts, upgrades, and objective data
img/         → All pixel-art and UI assets
js/          → Game engine and logic (modular)
scripts/     → Node development scripts
tests/       → Vitest tests
index.html   → Main HTML entry
sw.js        → Service worker
manifest.json → PWA settings
```

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_4_2.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Testing

Run unit and integration tests via:

```bash
npm test
```

Tests cover engine behavior, part behavior, objective logic, and more.

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_5_1.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Contributing

PRs are welcome! If you want to suggest changes, add features, or improve performance:

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Push to GitHub
5. Open a Pull Request

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_5_2.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  License

MIT License. See [LICENSE](LICENSE) for details.

---

## <img src="https://github.com/jdial1/reactor-revival/blob/master/img/parts/cells/cell_6_1.png" width="35" alt="Reactor Revival Cell Icon" style="vertical-align: middle;">  Credits

* **Talonius** – Original IC2 reactor planner
* **MauveCloud** – Experimental/GregTech planner
* **Cael** and **Mephyst** – Reactor Incremental
* **cwmonkey** – Reactor Knockoff

---
