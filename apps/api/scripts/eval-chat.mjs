#!/usr/bin/env node
/** @deprecated Use apps/api/scripts/eval-chat/run.mjs */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(dir, "eval-chat/run.mjs")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
