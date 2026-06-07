/** Legacy mock-only server — use `npm run dev` for Lambda handlers + mock fallback */
import { serve } from "@hono/node-server";
import { createMockServerApp } from "@commercechat/mock-api/server";

const port = Number(process.env.PORT ?? 3001);
const app = createMockServerApp();
console.log(`CommerceChat mock API only → http://localhost:${port}`);
serve({ fetch: app.fetch, port });
