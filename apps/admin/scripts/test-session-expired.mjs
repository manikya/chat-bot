import { chromium } from "playwright";

const BASE = process.env.ADMIN_URL ?? "http://localhost:3000";
const EMAIL = process.env.TEST_EMAIL ?? "ui-auth-1780845822@example.com";
const PASSWORD = process.env.TEST_PASSWORD ?? "NewPassword123!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  console.log("1. Logging in...");
  await page.goto(`${BASE}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  console.log("   Landed on:", page.url());

  console.log("2. Invalidating tokens to force refresh failure...");
  await page.evaluate(() => {
    localStorage.setItem("cc_access_token", "expired.invalid.token");
    localStorage.setItem("cc_refresh_token", "invalid-refresh-token");
  });

  console.log("3. Opening protected page (triggers API + refresh)...");
  await page.goto(`${BASE}/settings/profile`);

  console.log("4. Waiting for session expired dialog...");
  const dialog = page.locator("#session-expired-title");
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  const title = await dialog.textContent();
  const description = await page.locator("#session-expired-description").textContent();
  assert(title?.includes("Session expired"), `Unexpected title: ${title}`);
  assert(description?.includes("Sign in again"), `Unexpected description: ${description}`);
  console.log("   Dialog shown:", title);

  console.log("5. Clicking Go to login...");
  await page.getByRole("button", { name: "Go to login" }).click();
  await page.waitForURL((url) => url.pathname === "/login", { timeout: 10000 });
  assert(page.url().endsWith("/login"), `Expected /login, got ${page.url()}`);
  console.log("   Navigated to:", page.url());

  const dialogHidden = await dialog.isVisible().catch(() => false);
  assert(!dialogHidden, "Session expired dialog should be dismissed after navigation");

  console.log("\nPASS: Session expired flow works end-to-end.");
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
