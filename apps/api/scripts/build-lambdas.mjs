import * as esbuild from "esbuild";
import { readdirSync } from "fs";
import { join } from "path";

const handlersDir = join(process.cwd(), "src/handlers");
const outDir = join(process.cwd(), "dist/handlers");

const handlers = readdirSync(handlersDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(".ts", ""));

await esbuild.build({
  entryPoints: handlers.map((h) => `src/handlers/${h}.ts`),
  outdir: outDir,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  external: ["@aws-sdk/*"],
  outExtension: { ".js": ".cjs" },
});

console.log(`Bundled ${handlers.length} Lambda handlers → dist/handlers/`);
