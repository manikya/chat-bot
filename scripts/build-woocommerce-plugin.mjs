#!/usr/bin/env node
/**
 * Build plugins/commercechat-connector.zip and copy to apps/admin/public/
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PLUGIN_DIR = join(ROOT, "plugins/commercechat-connector");
const OUT_ZIP = join(ROOT, "plugins/commercechat-connector.zip");
const ADMIN_ZIP = join(ROOT, "apps/admin/public/commercechat-connector.zip");

if (!existsSync(PLUGIN_DIR)) {
  console.error("Plugin directory not found:", PLUGIN_DIR);
  process.exit(1);
}

rmSync(OUT_ZIP, { force: true });
execFileSync(
  "zip",
  ["-r", OUT_ZIP, "commercechat-connector", "-x", "*.DS_Store"],
  { cwd: join(ROOT, "plugins"), stdio: "inherit" }
);

mkdirSync(join(ROOT, "apps/admin/public"), { recursive: true });
cpSync(OUT_ZIP, ADMIN_ZIP);
console.log("Built", OUT_ZIP);
console.log("Copied to", ADMIN_ZIP);
