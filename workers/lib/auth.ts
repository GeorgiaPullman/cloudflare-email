// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import type { AuthUser, Env } from "../types";

const SESSION_COOKIE = "mailflare_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180;

export type AuthContext = {
	Bindings: Env;
	Variables: {
		user: AuthUser;
	};
};

export function getAdminStub(env: Env) {
	return env.APP_ADMIN.get(env.APP_ADMIN.idFromName("global"));
}

export function parseCookies(header: string | undefined) {
	const cookies: Record<string, string> = {};
	for (const part of (header || "").split(";")) {
		const [rawKey, ...rest] = part.trim().split("=");
		if (!rawKey || rest.length === 0) continue;
		cookies[rawKey] = decodeURIComponent(rest.join("="));
	}
	return cookies;
}

export function getSessionId(c: Context) {
	return parseCookies(c.req.header("Cookie"))[SESSION_COOKIE] || null;
}

export function sessionCookie(sessionId: string, expiresAt: string, secure: boolean) {
	const parts = [
		`${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${SESSION_MAX_AGE}`,
		`Expires=${new Date(expiresAt).toUTCString()}`,
	];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

export function clearSessionCookie(secure: boolean) {
	const parts = [
		`${SESSION_COOKIE}=`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		"Max-Age=0",
		"Expires=Thu, 01 Jan 1970 00:00:00 GMT",
	];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

export async function resolveSession(env: Env, sessionId: string | null) {
	if (!sessionId) return null;
	const response = await getAdminStub(env).fetch("https://app/session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId }),
	});
	if (!response.ok) return null;
	const data = await response.json() as { user?: AuthUser | null };
	return data.user ?? null;
}

export const requireAuth = createMiddleware<AuthContext>(async (c, next) => {
	const user = await resolveSession(c.env, getSessionId(c));
	if (!user) return c.json({ error: "Unauthorized" }, 401);
	c.set("user", user);
	await next();
});

export async function requireAdmin(c: Context<AuthContext>, next: Next) {
	if (!isAdminRole(c.var.user.role)) return c.json({ error: "Forbidden" }, 403);
	await next();
}

export function adminHeaders(user: AuthUser) {
	return {
		"Content-Type": "application/json",
		"X-Auth-User-Id": user.id,
	};
}

export function isAdminRole(role: AuthUser["role"]) {
	return role === "primary_admin" || role === "admin";
}

export function extractBearerToken(request: Request) {
	const auth = request.headers.get("Authorization") || "";
	if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
	return request.headers.get("X-API-Key") || "";
}
