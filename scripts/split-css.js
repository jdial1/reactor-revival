import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, "..", "public", "css");
const mainPath = path.join(cssDir, "main.css");
const lines = fs.readFileSync(mainPath, "utf8").split("\n");

function findLine(pred) {
  const i = lines.findIndex(pred);
  if (i < 0) throw new Error(`Marker not found: ${pred}`);
  return i;
}

const splits = [
  {
    file: "splash.css",
    start: (l) => l.startsWith("#splash-container"),
    end: (l) => l.startsWith("#parts_section"),
  },
  {
    file: "reactor-grid.css",
    start: (l) => l.includes("Heat warning glow effect"),
    end: (l) => l.includes("BUILD ROW (Above Control Deck"),
  },
  {
    file: "reactor-mobile.css",
    start: (l) => l.includes("BUILD ROW (Above Control Deck"),
    end: (l) => l.includes("Legacy Info Bar (Desktop)"),
  },
  {
    file: "info-bar.css",
    start: (l) => l.includes("Legacy Info Bar (Desktop)"),
    end: (l) => l.includes("--- Navigation Bars (Top & Bottom) ---"),
  },
  {
    file: "objectives.css",
    start: (l) => l.startsWith("#objectives_section"),
    end: (l) => l.includes("Welcome Back Modal"),
  },
  {
    file: "settings-modal.css",
    start: (l) => l.includes("Welcome Back Modal"),
    end: (l) => l.trim() === "/* Soundboard Page Styles */",
  },
];

const ranges = splits.map(({ file, start, end }) => {
  const s = findLine(start);
  const e = findLine(end);
  return { file, start: s, end: e };
}).sort((a, b) => b.start - a.start);

for (const { file, start, end } of ranges) {
  const chunk = lines.slice(start, end).join("\n");
  fs.writeFileSync(path.join(cssDir, file), chunk + "\n");
  lines.splice(start, end - start);
  console.log(`Wrote ${file} (${end - start} lines)`);
}

fs.writeFileSync(mainPath, lines.join("\n"));
console.log("Updated main.css, remaining lines:", lines.length);
