import * as esbuild from "esbuild";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const handlersDir = join(process.cwd(), "src/handlers");
const outDir = join(process.cwd(), "dist/handlers");
const widgetJsPath = join(process.cwd(), "../widget/public/v1.js");
const widgetJs = readFileSync(widgetJsPath, "utf8");

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

const requestedHandlers = (arg("handlers") ?? process.env.HANDLERS ?? "")
  .split(",")
  .map((handler) => handler.trim())
  .filter(Boolean);

const allHandlers = readdirSync(handlersDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(".ts", ""));

const handlers = requestedHandlers.length ? requestedHandlers : allHandlers;
const missing = handlers.filter((handler) => !allHandlers.includes(handler));
if (missing.length) {
  throw new Error(`Unknown Lambda handler(s): ${missing.join(", ")}`);
}

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

console.log(`Bundled ${handlers.length} Lambda handler${handlers.length === 1 ? "" : "s"} → dist/handlers/`);
