import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const SIM_ROOTS = [
  "tests/core/thermodynamics",
  "tests/core/grid",
  "tests/core/progression",
];

const FORBIDDEN = [
  [/setupGameWithDOM/, "must not call setupGameWithDOM"],
  [/\bsetupGameLogicOnly\b/, "must not call setupGameLogicOnly"],
  [/\bsetupGame\b/, "must not call setupGame"],
  [/helpers\/setup\.js/, "must not import host helpers/setup.js (use vitest + sessionHelpers)"],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const errors = [];
for (const rel of SIM_ROOTS) {
  for (const file of walk(path.join(root, rel))) {
    const text = fs.readFileSync(file, "utf8");
    for (const [re, msg] of FORBIDDEN) {
      if (!re.test(text)) continue;
      errors.push(`${path.relative(root, file)}: sim suites ${msg} (Step 9a/9b)`);
    }
  }
}

if (errors.length) {
  console.error("check-sim-no-dom (Step 9a/9b) failed:");
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

console.log("check-sim-no-dom: ok");
