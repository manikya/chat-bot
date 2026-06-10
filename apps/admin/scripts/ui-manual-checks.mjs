import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.COMMERCECHAT_ROOT ?? join(__dirname, "../../..");
const sampleCsv = join(repoRoot, "apps/admin/public/sample-products.csv");
const logoPath = "/tmp/test-logo.png";

// Minimal PNG if missing
try {
  readFileSync(logoPath);
} catch {
  writeFileSync(
    logoPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
  );
}

const results = [];
const log = (step, ok, detail) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${step}: ${detail}`);
};

const loginRes = await fetch("http://localhost:3001/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "wa-connect-1780904818@example.com",
    password: "TestPassword123!",
  }),
});
const loginBody = await loginRes.json();
if (!loginRes.ok || !loginBody.data?.accessToken) {
  throw new Error(`API login failed: ${JSON.stringify(loginBody)}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ access, refresh }) => {
      localStorage.setItem("cc_access_token", access);
      localStorage.setItem("cc_refresh_token", refresh);
    },
    {
      access: loginBody.data.accessToken,
      refresh: loginBody.data.refreshToken,
    }
  );
  await page.goto("http://localhost:3000/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  log("login", !page.url().includes("/login"), page.url());

  await page.goto("http://localhost:3000/onboarding/profile", { waitUntil: "domcontentloaded" });
  await page.locator("input").first().fill("WA Test Store");
  await page.locator('input[type="file"][accept*="image"]').setInputFiles(logoPath);
  await page.waitForTimeout(3000);
  const preview = await page.locator('img[alt="Store logo"]').isVisible();
  const changeLogo = await page.getByRole("button", { name: /change logo/i }).isVisible();
  log("profile-logo", preview || changeLogo, preview ? "preview visible" : changeLogo ? "change logo button" : "upload failed");

  await page.goto("http://localhost:3000/onboarding/catalog", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(sampleCsv);
  await page.waitForTimeout(8000);
  const countText = await page.getByText(/products indexed/i).textContent().catch(() => "");
  const importedToast = await page.locator("[data-sonner-toast]").filter({ hasText: /imported/i }).first().textContent().catch(() => "");
  log("catalog-upload", /products indexed/i.test(countText) || /imported/i.test(importedToast), (importedToast || countText).trim());

  await page.goto("http://localhost:3000/settings/team", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Invite" }).click();
  const email = `invite-${Date.now()}@example.com`;
  await page.locator('input[type="email"], input').nth(0).fill(email);
  await page.locator("input").nth(1).fill("Invite Test");
  await page.getByRole("button", { name: "Send invite" }).click();
  await page.getByText(/invite sent to/i).waitFor({ timeout: 15000 });
  log("team-invite", true, email);
} catch (err) {
  log("error", false, err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
if (failed.length) process.exitCode = 1;
