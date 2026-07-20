import { performance } from "node:perf_hooks";
import Decimal from "break_infinity.js";
import { createGameSession } from "reactor-core-lib";
import { buildHostStatePatch } from "../../public/src/bridge/core-state-projection.js";
import { createPart } from "../../public/src/domain/part.js";

globalThis.Decimal = Decimal;

const errors = [];

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isAllowedLeaf(value) {
  if (value == null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") return true;
  if (typeof Decimal !== "undefined" && value instanceof Decimal) return true;
  return false;
}

function assertMethodless(value, label, seen = new WeakSet()) {
  if (isAllowedLeaf(value)) return;
  if (typeof value === "function") {
    errors.push(`${label}: function value`);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertMethodless(value[i], `${label}[${i}]`, seen);
    }
    return;
  }

  if (!isPlainObject(value)) {
    const ctor = value?.constructor?.name || Object.getPrototypeOf(value)?.constructor?.name || "?";
    errors.push(`${label}: non-POJO (${ctor})`);
    return;
  }

  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === "function") {
      errors.push(`${label}.${key}: own function`);
      continue;
    }
    assertMethodless(child, `${label}.${key}`, seen);
  }
}

function assertCreatePartPojo(part, label) {
  if (!isPlainObject(part)) {
    const ctor = part?.constructor?.name || "?";
    errors.push(`${label}: createPart must return Object.prototype POJO (got ${ctor})`);
    return;
  }
  for (const key of Object.keys(part)) {
    if (typeof part[key] === "function") {
      errors.push(`${label}.${key}: own function on part POJO`);
    }
  }
}

async function fillGrid(session) {
  const rows = Math.min(session.grid.rows, 4);
  const cols = Math.min(session.grid.cols, 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      session.placeComponent(r, c, (r + c) % 2 === 0 ? "uranium1" : "vent1");
    }
  }
}

async function main() {
  const t0 = performance.now();
  const session = await createGameSession({ gameId: "reactor_revival" });
  await fillGrid(session);
  session.tick();
  const snap = session.getSnapshot();
  if (!snap || typeof snap !== "object") {
    errors.push("getSnapshot(): missing object");
  } else {
    assertMethodless(snap, "snapshot");
  }

  const patch = buildHostStatePatch(snap, { meltdown: false }, { multiplier: 1 });
  if (!patch || typeof patch !== "object") {
    errors.push("buildHostStatePatch(): missing object");
  } else {
    assertMethodless(patch, "hostPatch");
  }

  const compiled = session.listParts?.()?.[0] ?? session.getPart?.("uranium1");
  if (!compiled) {
    errors.push("createPart: no compiled part from session");
  } else {
    const part = createPart(compiled);
    assertCreatePartPojo(part, "createPart");
    if ("game" in part) {
      errors.push("createPart: must not attach game reference on part POJO");
    }
  }

  const ms = performance.now() - t0;
  if (errors.length) {
    console.error("check-methodless-projection (Step 4d) failed:");
    errors.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }

  console.log(`check-methodless-projection: ok (${ms.toFixed(1)}ms)`);
}

main().catch((err) => {
  console.error("check-methodless-projection failed:", err);
  process.exit(1);
});
