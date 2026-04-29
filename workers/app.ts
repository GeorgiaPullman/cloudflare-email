// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { AppAdminDO } from "./admin";
import { extractBearerToken, getAdminStub, parseCookies, resolveSession } from "./lib/auth";
import { EmailMCP } from "./mcp";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";
export { AppAdminDO } from "./admin";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// Main app that wraps the API and adds React Router fallback
const app = new Hono<{ Bindings: Env }>();

async function canAccessAgentMailbox(c: { env: Env; req: { raw: Request }; json: (data: unknown, status?: number) => Response }) {
	const user = await resolveSession(c.env, parseCookies(c.req.raw.headers.get("Cookie") || undefined).mailflare_session || null);
	if (!user) return { response: c.json({ error: "Unauthorized" }, 401) };
	const url = new URL(c.req.raw.url);
	const parts = url.pathname.split("/").filter(Boolean);
	const namespace = parts[1];
	const mailboxId = decodeURIComponent(parts[2] || "");
	if (namespace !== "email-agent" || !mailboxId) return { response: c.json({ error: "Forbidden" }, 403) };
	if (user.role === "primary_admin" || user.role === "admin") return { user };
	const access = await getAdminStub(c.env).fetch("https://app/mailbox-access", {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Auth-User-Id": user.id },
		body: JSON.stringify({ userId: user.id, mailboxEmail: mailboxId }),
	});
	if (!access.ok) return { response: c.json({ error: "Forbidden" }, 403) };
	const payload = await access.json() as { allowed?: boolean };
	return payload.allowed ? { user } : { response: c.json({ error: "Forbidden" }, 403) };
}

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Must be before API routes and React Router catch-all
const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });
app.all("/mcp", async (c) => {
	const key = extractBearerToken(c.req.raw);
	const verified = await getAdminStub(c.env).fetch("https://app/verify-mcp-key", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ key }),
	});
	if (!verified.ok) return c.json({ error: "Invalid MCP API key" }, 401);
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});
app.all("/mcp/*", async (c) => {
	const key = extractBearerToken(c.req.raw);
	const verified = await getAdminStub(c.env).fetch("https://app/verify-mcp-key", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ key }),
	});
	if (!verified.ok) return c.json({ error: "Invalid MCP API key" }, 401);
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	const auth = await canAccessAgentMailbox(c);
	if (auth.response) return auth.response;
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx as ExecutionContext },
	});
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
