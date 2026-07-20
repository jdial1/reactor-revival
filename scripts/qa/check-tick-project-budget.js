import { performance } from "node:perf_hooks";
import Decimal from "break_infinity.js";
import { createGameSession } from "reactor-core-lib";

globalThis.Decimal = Decimal;

const GRID = 12;
const WARMUP = 20;
const SAMPLES = 100;
const BUDGET_MS = 1000 / 60;
const PART_A = "uranium1";
const PART_B = "vent1";

async function fillRepresentativeGrid(session) {
  const rows = session.grid.rows;
  const cols = session.grid.cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = (r + c) % 2 === 0 ? PART_A : PART_B;
      session.placeComponent(r, c, id);
    }
  }
  if (typeof session.grid.recalculateCaps === "function") {
    session.grid.recalculateCaps();
  }
}

function measureTickProject(session) {
  const t0 = performance.now();
  session.tick();
  session.getSnapshot();
  return performance.now() - t0;
}

async function main() {
  const session = await createGameSession({ gameId: "reactor_revival" });
  if (session.grid.rows !== GRID || session.grid.cols !== GRID) {
    console.error(
      `check-tick-project-budget: expected ${GRID}x${GRID} grid, got ${session.grid.rows}x${session.grid.cols}`
    );
    process.exit(1);
  }
  await fillRepresentativeGrid(session);

  for (let i = 0; i < WARMUP; i++) measureTickProject(session);

  let sum = 0;
  let max = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const ms = measureTickProject(session);
    sum += ms;
    if (ms > max) max = ms;
  }
  const avg = sum / SAMPLES;

  console.log(
    `check-tick-project-budget: ${GRID}x${GRID} avg=${avg.toFixed(3)}ms max=${max.toFixed(3)}ms budget=${BUDGET_MS.toFixed(3)}ms (n=${SAMPLES})`
  );

  if (!(avg > 0) || Number.isNaN(avg)) {
    console.error("check-tick-project-budget: no timing samples");
    process.exit(1);
  }
  if (avg > BUDGET_MS) {
    console.error(
      `check-tick-project-budget (Step 4d) failed: avg ${avg.toFixed(3)}ms exceeds ${BUDGET_MS.toFixed(3)}ms (60fps)`
    );
    process.exit(1);
  }
  console.log("check-tick-project-budget: ok");
}

main().catch((err) => {
  console.error("check-tick-project-budget failed:", err);
  process.exit(1);
});
