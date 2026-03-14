import { build } from "esbuild";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Building client...");
execSync("npx vite build", { stdio: "inherit" });

console.log("Building server...");
await build({
  entryPoints: [path.resolve(__dirname, "../server/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: path.resolve(__dirname, "../dist/index.js"),
  format: "esm",
  external: [
    "express",
    "drizzle-orm",
    "@neondatabase/serverless",
    "drizzle-orm/neon-serverless",
    "drizzle-orm/postgres-js",
    "postgres",
    "vite",
  ],
});

console.log("Build complete!");
