import { build } from "esbuild";
import { execSync } from "child_process";
import path from "path";

const isWatch = process.argv.includes("--watch");

// Build the client with Vite
console.log("Building client...");
execSync("npx vite build", { stdio: "inherit" });
console.log("Client built successfully");

// Build the server
console.log("Building server...");
await build({
  entryPoints: [path.resolve(import.meta.dirname, "../server/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.cjs",
  packages: "bundle",
  sourcemap: true,
  minify: false,
  banner: {
    js: '"use strict";',
  },
  define: {
    "import.meta.dirname": "__dirname",
  },
});
console.log("Server built successfully");
