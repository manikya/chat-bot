import * as esbuild from "esbuild";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const handlersDir = join(process.cwd(), "src/handlers");
const outDir = join(process.cwd(), "dist/handlers");
const widgetJsPath = join(process.cwd(), "../widget/public/v1.js");
const widgetJs = readFileSync(widgetJsPath, "utf8");

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
  define: {
    __WIDGET_V1_JS__: JSON.stringify(widgetJs),
  },
});

console.log(`Bundled ${handlers.length} Lambda handlers → dist/handlers/`);
