/**
 * E2E against dev/local API: billing overview, lifecycle cron, widget SSE, page-voice gates.
 */
const API = (process.env.API_URL ?? "https://fimfx57xwl.execute-api.us-east-1.amazonaws.com").replace(
  /\/$/,
  ""
);
const email = process.env.TEST_EMAIL ?? `limits-${Date.now()}@example.com`;
const password = process.env.TEST_PASSWORD ?? "TestPassword123!";

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed += 1;
  console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err);
}

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function reqOk(path, opts = {}) {
  const { res, json } = await req(path, opts);
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  if (json && json.success === false) throw new Error(`${path}: ${JSON.stringify(json)}`);
  return json;
}

async function reqFail(path, opts = {}, expectedStatus) {
  const { res, json } = await req(path, opts);
  if (res.status !== expectedStatus) {
    throw new Error(`expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log(`API: ${API}\n`);

  try {
    const health = await reqOk("/health");
    ok(`health: ${health.data?.status ?? "ok"}`);
  } catch (e) {
    fail("health", e);
    process.exit(1);
  }

  let auth;
  try {
    await reqOk("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: "Limits Test Store",
        name: "Tester",
        email,
        password,
        timezone: "Asia/Colombo",
      }),
    });
    const login = await reqOk("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    auth = { Authorization: `Bearer ${login.data.accessToken}` };
    ok(`signup + login (${email})`);
  } catch (e) {
    fail("signup + login", e);
    process.exit(1);
  }

  try {
    const overview = await reqOk("/api/v1/billing/overview", { headers: auth });
    const d = overview.data;
    if (d.resources.vectors == null) throw new Error("missing resources.vectors");
    if (d.utilization.vectorsPct == null) throw new Error("missing utilization.vectorsPct");
    if (d.subscription.trialDaysRemaining == null && d.subscription.plan === "trial") {
      throw new Error("trial missing trialDaysRemaining");
    }
    ok(`billing overview (vectors=${d.resources.vectors}, trialDays=${d.subscription.trialDaysRemaining})`);
  } catch (e) {
    fail("billing overview", e);
  }

  try {
    await reqFail(
      "/api/v1/billing/cancel",
      { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" },
      400
    );
    ok("trial cancel blocked (400)");
  } catch (e) {
    fail("trial cancel blocked", e);
  }

  try {
    const cronSecret = process.env.BILLING_LIFECYCLE_CRON_SECRET;
    const headers = { "Content-Type": "application/json", ...(cronSecret ? { "x-cron-secret": cronSecret } : {}) };
    const lifecycle = await reqOk("/internal/cron/billing-lifecycle", {
      method: "POST",
      headers,
      body: "{}",
    });
    ok(`billing lifecycle HTTP cron (scanned=${lifecycle.data?.scanned ?? "?"})`);
  } catch (e) {
    if (String(e).includes("403")) {
      ok("billing lifecycle HTTP cron protected (403 without secret — EventBridge schedule handles daily runs)");
    } else {
      fail("billing lifecycle cron", e);
    }
  }

  let apiKey;
  try {
    const keyRes = await reqOk("/api/v1/tenants/me/widget/regenerate-key", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: "{}",
    });
    apiKey = keyRes.data.apiKey;
    ok("widget API key regenerated");
  } catch (e) {
    fail("widget API key", e);
  }

  if (apiKey) {
    try {
      const cfg = await reqOk("/api/v1/widget/config", { headers: { "X-API-Key": apiKey } });
      if (!cfg.data?.enabled) throw new Error("widget not enabled for trial tenant");
      ok("widget config enabled");
    } catch (e) {
      fail("widget config", e);
    }

    try {
      const streamRes = await fetch(`${API}/api/v1/widget/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          sessionId: `test_sess_${Date.now()}`,
          message: "Hello, what products do you sell?",
        }),
      });
      const body = await streamRes.text();
      if (!streamRes.ok) throw new Error(`${streamRes.status}: ${body.slice(0, 200)}`);
      if (!body.includes("event: start")) throw new Error("missing start event");
      if (!body.includes("event: typing")) throw new Error("missing typing event");
      if (!body.includes("event: token")) throw new Error("missing token event");
      if (!body.includes("event: done")) throw new Error("missing done event");
      ok("widget SSE stream (start/typing/token/done)");
    } catch (e) {
      fail("widget SSE stream", e);
    }
  }

  try {
    const pv = await reqOk("/api/v1/knowledge/page-voice", { headers: auth });
    if (pv.data.conversationIngestEnabled !== false) {
      throw new Error(`expected conversationIngestEnabled=false on trial, got ${pv.data.conversationIngestEnabled}`);
    }
    ok("page voice returns conversationIngestEnabled=false on trial");
  } catch (e) {
    fail("page voice status", e);
  }

  try {
    await reqFail("/api/v1/knowledge/page-voice/export", { headers: auth }, 403);
    ok("page voice export blocked on trial (403)");
  } catch (e) {
    fail("page voice export gate", e);
  }

  try {
    await reqFail(
      "/api/v1/knowledge/page-voice/upload",
      {
        method: "POST",
        headers: auth,
        body: new FormData(),
      },
      400
    );
    ok("page voice upload requires multipart (400)");
  } catch (e) {
    fail("page voice upload gate", e);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
