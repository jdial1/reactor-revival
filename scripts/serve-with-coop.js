import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const port = process.env.PORT || 8080;

const app = express();
app.use((_req, res, next) => {
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Cross-Origin-Embedder-Policy", "credentialless");
  next();
});
app.use(express.static(publicDir));
app.listen(port, () => {
  console.log(`Serving with COOP/COEP at http://localhost:${port}`);
});
