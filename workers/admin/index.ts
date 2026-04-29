// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DurableObject } from "cloudflare:workers";
import type { AuthUser, Env, UserRole, UserStatus } from "../types";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGORITHM = "SHA-256";
const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

type DomainSource = "manual" | "cloudflare_discovered";
type DomainStatus = "active" | "disabled";
type KeyStatus = "active" | "disabled";
type AssignmentSource = "manual" | "auto_username";

interface UserRow {
	id: string;
	username: string;
	password_hash: string;
	role: UserRole;
	status: UserStatus;
	created_at: string;
	updated_at: string;
	last_login_at: string | null;
}

interface DomainRow {
	id: string;
	domain: string;
	source: DomainSource;
	status: DomainStatus;
	last_synced_at: string | null;
	last_error: string | null;
	created_at: string;
	updated_at: string;
}

interface ApiKeyRow {
	id: string;
	label: string;
	key_prefix: string;
	key_hash: string;
	status: KeyStatus;
	created_by: string;
	created_at: string;
	last_used_at: string | null;
}

interface MailboxAssignmentRow {
	user_id: string;
	mailbox_email: string;
	source: AssignmentSource;
	created_at: string;
	created_by: string | null;
}

interface MailboxFavoriteRow {
	user_id: string;
	mailbox_email: string;
	created_at: string;
}

function json(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
}

function normalizeUsername(username: string) {
	return username.trim().toLowerCase();
}

function normalizeDomain(domain: string) {
	return domain.trim().toLowerCase().replace(/^@+/, "");
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function isAdminRole(role: UserRole) {
	return role === "primary_admin" || role === "admin";
}

function isValidRole(role: string): role is UserRole {
	return role === "primary_admin" || role === "admin" || role === "employee";
}

function isValidUsername(username: string) {
	return /^[a-z0-9][a-z0-9._-]{0,62}$/.test(username);
}

function localPart(email: string) {
	return email.split("@")[0] || "";
}

function randomToken(bytes = 32) {
	const values = new Uint8Array(bytes);
	crypto.getRandomValues(values);
	return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function randomPassword() {
	const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
	const values = new Uint8Array(18);
	crypto.getRandomValues(values);
	return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function encodeBase64(bytes: ArrayBuffer) {
	let binary = "";
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function decodeBase64(value: string) {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function sha256(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return encodeBase64(digest);
}

async function hashPassword(password: string, salt = randomToken(16)) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: HASH_ALGORITHM,
			salt: new TextEncoder().encode(salt),
			iterations: PBKDF2_ITERATIONS,
		},
		key,
		256,
	);
	return `pbkdf2:${HASH_ALGORITHM}:${PBKDF2_ITERATIONS}:${salt}:${encodeBase64(derived)}`;
}

async function verifyPassword(password: string, storedHash: string) {
	const [scheme, algorithm, iterationsRaw, salt, expected] = storedHash.split(":");
	if (scheme !== "pbkdf2" || !algorithm || !iterationsRaw || !salt || !expected) return false;
	const iterations = Number(iterationsRaw);
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: algorithm,
			salt: new TextEncoder().encode(salt),
			iterations,
		},
		key,
		256,
	);
	return encodeBase64(derived) === expected;
}

function userPublic(row: UserRow) {
	return {
		id: row.id,
		username: row.username,
		role: row.role,
		status: row.status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastLoginAt: row.last_login_at,
	};
}

function domainPublic(row: DomainRow) {
	return {
		id: row.id,
		domain: row.domain,
		source: row.source,
		status: row.status,
		lastSyncedAt: row.last_synced_at,
		lastError: row.last_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function keyPublic(row: ApiKeyRow) {
	return {
		id: row.id,
		label: row.label,
		keyPrefix: row.key_prefix,
		status: row.status,
		createdBy: row.created_by,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
	};
}

function assignmentPublic(row: MailboxAssignmentRow, exists: boolean) {
	return {
		email: row.mailbox_email,
		source: row.source,
		assigned: true,
		exists,
	};
}

function normalizeQuotaBytes(value: unknown) {
	const quota = Number(value);
	const allowed = [1024 * 1024 * 1024, 10 * 1024 * 1024 * 1024];
	return allowed.includes(quota) ? quota : DEFAULT_STORAGE_QUOTA_BYTES;
}

export class AppAdminDO extends DurableObject<Env> {
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.migrate();
	}

	private migrate() {
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS users (
					id TEXT PRIMARY KEY,
					username TEXT NOT NULL UNIQUE,
					password_hash TEXT NOT NULL,
					role TEXT NOT NULL CHECK(role IN ('primary_admin', 'admin', 'employee')),
					status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					last_login_at TEXT
				);

				CREATE TABLE IF NOT EXISTS sessions (
					id TEXT PRIMARY KEY,
					user_id TEXT NOT NULL,
					expires_at TEXT NOT NULL,
					created_at TEXT NOT NULL,
					last_seen_at TEXT NOT NULL,
					FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
				);

				CREATE TABLE IF NOT EXISTS mcp_api_keys (
					id TEXT PRIMARY KEY,
					label TEXT NOT NULL,
					key_prefix TEXT NOT NULL,
					key_hash TEXT NOT NULL UNIQUE,
					status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
					created_by TEXT NOT NULL,
					created_at TEXT NOT NULL,
					last_used_at TEXT
				);

				CREATE TABLE IF NOT EXISTS domain_sources (
					id TEXT PRIMARY KEY,
					domain TEXT NOT NULL UNIQUE,
					source TEXT NOT NULL CHECK(source IN ('manual', 'cloudflare_discovered')),
					status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
					last_synced_at TEXT,
					last_error TEXT,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS system_settings (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					updated_at TEXT NOT NULL
				);

				CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
				CREATE INDEX IF NOT EXISTS idx_domain_sources_status ON domain_sources(status);
			`);

			const userTable = [...this.ctx.storage.sql.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1")][0] as { sql?: string } | undefined;
			if (userTable?.sql && !userTable.sql.includes("primary_admin")) {
				this.ctx.storage.sql.exec("DROP TABLE IF EXISTS users_new_role");
				this.ctx.storage.sql.exec(`
					CREATE TABLE users_new_role (
						id TEXT PRIMARY KEY,
						username TEXT NOT NULL UNIQUE,
						password_hash TEXT NOT NULL,
						role TEXT NOT NULL CHECK(role IN ('primary_admin', 'admin', 'employee')),
						status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
						created_at TEXT NOT NULL,
						updated_at TEXT NOT NULL,
						last_login_at TEXT
					)
				`);
				this.ctx.storage.sql.exec(`
					INSERT INTO users_new_role (id, username, password_hash, role, status, created_at, updated_at, last_login_at)
					SELECT id, username, password_hash, role, status, created_at, updated_at, last_login_at
					FROM users
				`);
				this.ctx.storage.sql.exec("DROP TABLE users");
				this.ctx.storage.sql.exec("ALTER TABLE users_new_role RENAME TO users");
			}

			const primary = [...this.ctx.storage.sql.exec("SELECT id FROM users WHERE role = 'primary_admin' LIMIT 1")][0] as { id: string } | undefined;
			if (!primary) {
				const firstAdmin = [...this.ctx.storage.sql.exec(
					"SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1",
				)][0] as { id: string } | undefined;
				if (firstAdmin) {
					this.ctx.storage.sql.exec("UPDATE users SET role = 'primary_admin', updated_at = ? WHERE id = ?", new Date().toISOString(), firstAdmin.id);
				}
			}

			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS mailbox_assignments (
					user_id TEXT NOT NULL,
					mailbox_email TEXT NOT NULL,
					source TEXT NOT NULL CHECK(source IN ('manual', 'auto_username')),
					created_at TEXT NOT NULL,
					created_by TEXT,
					PRIMARY KEY(user_id, mailbox_email),
					FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_mailbox_assignments_email ON mailbox_assignments(mailbox_email);
			`);
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS mailbox_favorites (
					user_id TEXT NOT NULL,
					mailbox_email TEXT NOT NULL,
					created_at TEXT NOT NULL,
					PRIMARY KEY(user_id, mailbox_email),
					FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_mailbox_favorites_email ON mailbox_favorites(mailbox_email);
			`);
		});
	}

	private firstUser() {
		return [...this.ctx.storage.sql.exec("SELECT * FROM users LIMIT 1")][0] as unknown as UserRow | undefined;
	}

	private getUserByUsername(username: string) {
		return [...this.ctx.storage.sql.exec("SELECT * FROM users WHERE username = ? LIMIT 1", username)][0] as unknown as UserRow | undefined;
	}

	private getUserById(id: string) {
		return [...this.ctx.storage.sql.exec("SELECT * FROM users WHERE id = ? LIMIT 1", id)][0] as unknown as UserRow | undefined;
	}

	private listUsers() {
		return [...this.ctx.storage.sql.exec("SELECT * FROM users ORDER BY created_at ASC")] as unknown as UserRow[];
	}

	private getSetting(key: string) {
		const row = [...this.ctx.storage.sql.exec("SELECT value FROM system_settings WHERE key = ? LIMIT 1", key)][0] as { value: string } | undefined;
		return row?.value;
	}

	private setSetting(key: string, value: string) {
		const now = new Date().toISOString();
		this.ctx.storage.sql.exec(
			`INSERT INTO system_settings (key, value, updated_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			key,
			value,
			now,
		);
	}

	private async createSession(userId: string) {
		const now = new Date();
		const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
		const sessionId = randomToken(32);
		this.ctx.storage.sql.exec(
			"INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
			sessionId,
			userId,
			expiresAt.toISOString(),
			now.toISOString(),
			now.toISOString(),
		);
		return {
			id: sessionId,
			expiresAt: expiresAt.toISOString(),
		};
	}

	private async listAvailableDomains() {
		const rows = [...this.ctx.storage.sql.exec(
			"SELECT * FROM domain_sources WHERE status = 'active' ORDER BY domain ASC",
		)] as unknown as DomainRow[];
		return rows.map((row) => row.domain);
	}

	private getStorageQuotaBytes() {
		return normalizeQuotaBytes(this.getSetting("storage_quota_bytes"));
	}

	private listAssignments(userId: string) {
		return [...this.ctx.storage.sql.exec(
			"SELECT * FROM mailbox_assignments WHERE user_id = ? ORDER BY mailbox_email ASC",
			userId,
		)] as unknown as MailboxAssignmentRow[];
	}

	private assignMailbox(userId: string, mailboxEmail: string, source: AssignmentSource, createdBy: string | null) {
		const email = normalizeEmail(mailboxEmail);
		if (!email) return;
		this.ctx.storage.sql.exec(
			`INSERT INTO mailbox_assignments (user_id, mailbox_email, source, created_at, created_by)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, mailbox_email) DO UPDATE SET
				source = CASE WHEN mailbox_assignments.source = 'auto_username' THEN mailbox_assignments.source ELSE excluded.source END,
				created_by = COALESCE(mailbox_assignments.created_by, excluded.created_by)`,
			userId,
			email,
			source,
			new Date().toISOString(),
			createdBy,
		);
	}

	private canAccessMailbox(user: AuthUser, mailboxEmail: string) {
		if (isAdminRole(user.role)) return true;
		const email = normalizeEmail(mailboxEmail);
		if (localPart(email) === user.username) return true;
		const row = [...this.ctx.storage.sql.exec(
			"SELECT 1 FROM mailbox_assignments WHERE user_id = ? AND mailbox_email = ? LIMIT 1",
			user.id,
			email,
		)][0];
		return !!row;
	}

	private listFavorites(userId: string) {
		const rows = [...this.ctx.storage.sql.exec(
			"SELECT * FROM mailbox_favorites WHERE user_id = ? ORDER BY created_at ASC",
			userId,
		)] as unknown as MailboxFavoriteRow[];
		return rows.map((row) => row.mailbox_email);
	}

	private setFavorite(userId: string, mailboxEmail: string, favorited: boolean) {
		const email = normalizeEmail(mailboxEmail);
		if (!email) return;
		if (favorited) {
			this.ctx.storage.sql.exec(
				`INSERT INTO mailbox_favorites (user_id, mailbox_email, created_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(user_id, mailbox_email) DO NOTHING`,
				userId,
				email,
				new Date().toISOString(),
			);
			return;
		}
		this.ctx.storage.sql.exec(
			"DELETE FROM mailbox_favorites WHERE user_id = ? AND mailbox_email = ?",
			userId,
			email,
		);
	}

	private assertCanMutateUser(actor: UserRow, target: UserRow, action: "status" | "role" | "reset") {
		if (!isAdminRole(actor.role)) return "Forbidden";
		if (action === "status" && actor.id === target.id) return "You cannot change your own status";
		if (target.role === "primary_admin") {
			if (action === "reset" && actor.role === "primary_admin") return null;
			return "The primary administrator is protected";
		}
		if (actor.role === "admin" && target.role === "admin") {
			return "Only the primary administrator can modify another administrator";
		}
		return null;
	}

	private async syncCloudflareDomains() {
		const token = this.getSetting("cloudflare_api_token");
		if (!token) {
			return { synced: 0, domains: [], error: "Cloudflare API token is required." };
		}

		const zonesResponse = await fetch("https://api.cloudflare.com/client/v4/zones", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const zonesPayload = await zonesResponse.json() as {
			success?: boolean;
			result?: { id?: string }[];
			errors?: { message?: string }[];
		};
		if (!zonesResponse.ok || zonesPayload.success === false) {
			const error = zonesPayload.errors?.map((entry) => entry.message).filter(Boolean).join("; ")
				|| "Cloudflare API failed while listing zones";
			this.setSetting("cloudflare_last_sync_at", new Date().toISOString());
			this.setSetting("cloudflare_last_sync_error", error);
			return { synced: 0, domains: [], error };
		}

		const zoneIds = (zonesPayload.result ?? [])
			.map((zone) => String(zone.id || "").trim())
			.filter(Boolean);
		if (zoneIds.length === 0) {
			const error = "No accessible Cloudflare zones were found for this API token.";
			this.setSetting("cloudflare_last_sync_at", new Date().toISOString());
			this.setSetting("cloudflare_last_sync_error", error);
			return { synced: 0, domains: [], error };
		}

		const discovered = new Set<string>();
		const errors: string[] = [];
		for (const zoneId of zoneIds) {
			try {
				const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/email/sending/subdomains`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const data = await res.json() as { success?: boolean; result?: unknown[]; errors?: { message?: string }[] };
				if (!res.ok || data.success === false) {
					errors.push(data.errors?.map((e) => e.message).filter(Boolean).join("; ") || `Cloudflare API failed for zone ${zoneId}`);
					continue;
				}
				for (const item of data.result ?? []) {
					const record = item as Record<string, unknown>;
					const name = String(record.name || record.subdomain || record.domain || "").trim();
					const status = String(record.status || record.verification_status || "active").toLowerCase();
					if (name && !["pending", "failed", "disabled"].includes(status)) discovered.add(normalizeDomain(name));
				}
			} catch (e) {
				errors.push((e as Error).message);
			}
		}

		const now = new Date().toISOString();
		for (const domain of discovered) {
			this.ctx.storage.sql.exec(
				`INSERT INTO domain_sources (id, domain, source, status, last_synced_at, last_error, created_at, updated_at)
				 VALUES (?, ?, 'cloudflare_discovered', 'active', ?, NULL, ?, ?)
				 ON CONFLICT(domain) DO UPDATE SET
					source = CASE WHEN domain_sources.source = 'manual' THEN domain_sources.source ELSE 'cloudflare_discovered' END,
					last_synced_at = excluded.last_synced_at,
					last_error = NULL,
					updated_at = excluded.updated_at`,
				crypto.randomUUID(),
				domain,
				now,
				now,
				now,
			);
		}
		this.setSetting("cloudflare_last_sync_at", now);
		this.setSetting("cloudflare_last_sync_error", errors.join("; "));
		return { synced: discovered.size, domains: [...discovered].sort(), error: errors.join("; ") || null };
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const method = request.method;
		const body = method === "GET" || method === "HEAD" ? null : await request.json().catch(() => ({}));

		if (url.pathname === "/status") {
			return json({ isInitialized: !!this.firstUser(), availableDomains: await this.listAvailableDomains() });
		}

		if (url.pathname === "/bootstrap-admin" && method === "POST") {
			if (this.firstUser()) return json({ error: "Application is already initialized" }, { status: 409 });
			const { username: rawUsername, password } = body as { username?: string; password?: string };
			const username = normalizeUsername(rawUsername || "");
			if (!username || !password || password.length < 8) return json({ error: "Username and an 8+ character password are required" }, { status: 400 });
			const now = new Date().toISOString();
			const id = crypto.randomUUID();
			this.ctx.storage.sql.exec(
				"INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, 'primary_admin', 'active', ?, ?)",
				id,
				username,
				await hashPassword(password),
				now,
				now,
			);
			const session = await this.createSession(id);
			return json({ user: userPublic(this.getUserById(id)!), session });
		}

		if (url.pathname === "/login" && method === "POST") {
			const { username: rawUsername, password } = body as { username?: string; password?: string };
			const user = this.getUserByUsername(normalizeUsername(rawUsername || ""));
			if (!user || user.status !== "active" || !password || !(await verifyPassword(password, user.password_hash))) {
				return json({ error: "Invalid username or password" }, { status: 401 });
			}
			const now = new Date().toISOString();
			this.ctx.storage.sql.exec("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", now, now, user.id);
			const session = await this.createSession(user.id);
			return json({ user: userPublic({ ...user, last_login_at: now }), session });
		}

		if (url.pathname === "/session" && method === "POST") {
			const { sessionId } = body as { sessionId?: string };
			if (!sessionId) return json({ user: null }, { status: 401 });
			const row = [...this.ctx.storage.sql.exec(
				`SELECT users.* FROM sessions
				 JOIN users ON users.id = sessions.user_id
				 WHERE sessions.id = ? AND sessions.expires_at > ? AND users.status = 'active'
				 LIMIT 1`,
				sessionId,
				new Date().toISOString(),
				)][0] as unknown as UserRow | undefined;
			if (!row) return json({ user: null }, { status: 401 });
			this.ctx.storage.sql.exec("UPDATE sessions SET last_seen_at = ? WHERE id = ?", new Date().toISOString(), sessionId);
			return json({ user: userPublic(row) });
		}

		if (url.pathname === "/logout" && method === "POST") {
			const { sessionId } = body as { sessionId?: string };
			if (sessionId) this.ctx.storage.sql.exec("DELETE FROM sessions WHERE id = ?", sessionId);
			return json({ ok: true });
		}

		if (url.pathname === "/change-password" && method === "POST") {
			const { userId, currentPassword, newPassword } = body as { userId?: string; currentPassword?: string; newPassword?: string };
			const user = userId ? this.getUserById(userId) : undefined;
			if (!user || !currentPassword || !newPassword || newPassword.length < 8) return json({ error: "Invalid password change request" }, { status: 400 });
			if (!(await verifyPassword(currentPassword, user.password_hash))) return json({ error: "Current password is incorrect" }, { status: 403 });
			this.ctx.storage.sql.exec("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", await hashPassword(newPassword), new Date().toISOString(), user.id);
			return json({ ok: true });
		}

		if (url.pathname === "/verify-mcp-key" && method === "POST") {
			const { key } = body as { key?: string };
			if (!key) return json({ ok: false }, { status: 401 });
			const keyHash = await sha256(key);
			const row = [...this.ctx.storage.sql.exec("SELECT * FROM mcp_api_keys WHERE key_hash = ? AND status = 'active' LIMIT 1", keyHash)][0] as unknown as ApiKeyRow | undefined;
			if (!row) return json({ ok: false }, { status: 401 });
			this.ctx.storage.sql.exec("UPDATE mcp_api_keys SET last_used_at = ? WHERE id = ?", new Date().toISOString(), row.id);
			return json({ ok: true });
		}

		const actorId = request.headers.get("x-auth-user-id") || "";
		const actor = actorId ? this.getUserById(actorId) : undefined;
		if (!actor || actor.status !== "active") return json({ error: "Unauthorized" }, { status: 401 });

		if (url.pathname === "/config" && method === "GET") {
			return json({
				availableDomains: await this.listAvailableDomains(),
				isInitialized: !!this.firstUser(),
				authMode: "local",
				canManageDomains: isAdminRole(actor.role),
			});
		}

		if (url.pathname === "/storage/quota" && method === "GET") {
			return json({ quotaBytes: this.getStorageQuotaBytes() });
		}

		if (url.pathname === "/storage/quota" && method === "PUT") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { quotaBytes } = body as { quotaBytes?: unknown };
			const normalizedQuotaBytes = normalizeQuotaBytes(quotaBytes);
			this.setSetting("storage_quota_bytes", String(normalizedQuotaBytes));
			return json({ quotaBytes: normalizedQuotaBytes });
		}

		if (url.pathname === "/mailbox-access" && method === "POST") {
			const { userId, mailboxEmail } = body as { userId?: string; mailboxEmail?: string };
			const user = userId ? this.getUserById(userId) : undefined;
			if (!user || !mailboxEmail) return json({ allowed: false }, { status: 400 });
			return json({ allowed: this.canAccessMailbox(userPublic(user), mailboxEmail) });
		}

		if (url.pathname === "/visible-mailboxes" && method === "POST") {
			const { userId, mailboxEmails = [] } = body as { userId?: string; mailboxEmails?: string[] };
			const user = userId ? this.getUserById(userId) : undefined;
			if (!user) return json({ mailboxEmails: [] }, { status: 400 });
			if (isAdminRole(user.role)) return json({ mailboxEmails: mailboxEmails.map(normalizeEmail) });
			const visible = mailboxEmails
				.map(normalizeEmail)
				.filter((email) => this.canAccessMailbox(userPublic(user), email));
			return json({ mailboxEmails: visible });
		}

		if (url.pathname === "/mailbox-favorites" && method === "POST") {
			const { userId, mailboxEmails = [] } = body as { userId?: string; mailboxEmails?: string[] };
			const user = userId ? this.getUserById(userId) : undefined;
			if (!user) return json({ favorites: [] }, { status: 400 });
			const visible = new Set(
				isAdminRole(user.role)
					? mailboxEmails.map(normalizeEmail)
					: mailboxEmails.map(normalizeEmail).filter((email) => this.canAccessMailbox(userPublic(user), email)),
			);
			const favorites = this.listFavorites(user.id).filter((email) => visible.has(email));
			return json({ favorites });
		}

		if (url.pathname === "/mailbox-favorites" && method === "PUT") {
			const { userId, mailboxEmail, favorited } = body as { userId?: string; mailboxEmail?: string; favorited?: boolean };
			const user = userId ? this.getUserById(userId) : undefined;
			const email = normalizeEmail(mailboxEmail || "");
			if (!user || !email || typeof favorited !== "boolean") return json({ error: "Invalid favorite request" }, { status: 400 });
			if (!isAdminRole(user.role) && !this.canAccessMailbox(userPublic(user), email)) return json({ error: "Forbidden" }, { status: 403 });
			this.setFavorite(user.id, email, favorited);
			return json({ favorites: this.listFavorites(user.id) });
		}

		if (url.pathname === "/mailbox-created" && method === "POST") {
			const { mailboxEmail } = body as { mailboxEmail?: string };
			const email = normalizeEmail(mailboxEmail || "");
			if (!email) return json({ ok: false }, { status: 400 });
			const username = localPart(email);
			const user = username ? this.getUserByUsername(username) : undefined;
			if (user?.role === "employee") this.assignMailbox(user.id, email, "auto_username", null);
			return json({ ok: true });
		}

		if (url.pathname === "/mailbox-deleted" && method === "POST") {
			const { mailboxEmail } = body as { mailboxEmail?: string };
			const email = normalizeEmail(mailboxEmail || "");
			if (!email) return json({ ok: false }, { status: 400 });
			this.ctx.storage.sql.exec("DELETE FROM mailbox_assignments WHERE mailbox_email = ?", email);
			this.ctx.storage.sql.exec("DELETE FROM mailbox_favorites WHERE mailbox_email = ?", email);
			return json({ ok: true });
		}

		if (url.pathname === "/users" && method === "GET") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const rows = this.listUsers();
			return json(rows.map(userPublic));
		}

		if (url.pathname === "/users" && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { username: rawUsername, role = "employee" } = body as { username?: string; role?: UserRole; mailboxEmails?: string[] };
			const username = normalizeUsername(rawUsername || "");
			if (!username || !isValidUsername(username) || role === "primary_admin" || !["admin", "employee"].includes(role)) {
				return json({ error: "Valid username and role are required" }, { status: 400 });
			}
			if (this.getUserByUsername(username)) return json({ error: "Username already exists" }, { status: 409 });
			const password = randomPassword();
			const now = new Date().toISOString();
			const id = crypto.randomUUID();
			this.ctx.storage.sql.exec(
				"INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
				id,
				username,
				await hashPassword(password),
				role,
				now,
				now,
			);
			return json({ user: userPublic(this.getUserById(id)!), password }, { status: 201 });
		}

		const userStatusMatch = url.pathname.match(/^\/users\/([^/]+)\/status$/);
		if (userStatusMatch && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { status } = body as { status?: UserStatus };
			if (!["active", "disabled"].includes(status || "")) return json({ error: "Invalid status" }, { status: 400 });
			const target = this.getUserById(userStatusMatch[1]);
			if (!target) return json({ error: "User not found" }, { status: 404 });
			const denied = this.assertCanMutateUser(actor, target, "status");
			if (denied) return json({ error: denied }, { status: 403 });
			this.ctx.storage.sql.exec("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", status, new Date().toISOString(), target.id);
			return json({ user: userPublic(this.getUserById(target.id)!) });
		}

		const roleMatch = url.pathname.match(/^\/users\/([^/]+)\/role$/);
		if (roleMatch && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { role } = body as { role?: UserRole };
			if (!role || role === "primary_admin" || !isValidRole(role)) return json({ error: "Invalid role" }, { status: 400 });
			const target = this.getUserById(roleMatch[1]);
			if (!target) return json({ error: "User not found" }, { status: 404 });
			const denied = this.assertCanMutateUser(actor, target, "role");
			if (denied) return json({ error: denied }, { status: 403 });
			this.ctx.storage.sql.exec("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", role, new Date().toISOString(), target.id);
			return json({ user: userPublic(this.getUserById(target.id)!) });
		}

		const resetMatch = url.pathname.match(/^\/users\/([^/]+)\/reset-password$/);
		if (resetMatch && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const user = this.getUserById(resetMatch[1]);
			if (!user) return json({ error: "User not found" }, { status: 404 });
			const denied = this.assertCanMutateUser(actor, user, "reset");
			if (denied) return json({ error: denied }, { status: 403 });
			const password = randomPassword();
			this.ctx.storage.sql.exec("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", await hashPassword(password), new Date().toISOString(), user.id);
			return json({ user: userPublic(this.getUserById(user.id)!), password });
		}

		const userMailboxesMatch = url.pathname.match(/^\/users\/([^/]+)\/mailboxes$/);
		if (userMailboxesMatch && method === "GET") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const user = this.getUserById(userMailboxesMatch[1]);
			if (!user) return json({ error: "User not found" }, { status: 404 });
			const assignedRows = this.listAssignments(user.id);
			const mailboxes = await Promise.all(assignedRows.map(async (row) =>
				assignmentPublic(row, !!(await this.env.BUCKET.head(`mailboxes/${row.mailbox_email}.json`))),
			));
			return json({ user: userPublic(user), mailboxes });
		}

		if (userMailboxesMatch && method === "PUT") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const user = this.getUserById(userMailboxesMatch[1]);
			if (!user) return json({ error: "User not found" }, { status: 404 });
			if (user.role !== "employee") return json({ error: "Mailbox assignments are only available for employees" }, { status: 400 });
			const { mailboxEmails = [] } = body as { mailboxEmails?: string[] };
			const normalized = [...new Set(mailboxEmails.map(normalizeEmail).filter((email) => email.includes("@")))];
			this.ctx.storage.sql.exec("DELETE FROM mailbox_assignments WHERE user_id = ? AND source = 'manual'", user.id);
			for (const email of normalized) {
				if (await this.env.BUCKET.head(`mailboxes/${email}.json`)) {
					this.assignMailbox(user.id, email, "manual", actor.id);
				}
			}
			return json({ mailboxes: this.listAssignments(user.id).map((row) => assignmentPublic(row, true)) });
		}

		if (url.pathname === "/domains" && method === "GET") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const rows = [...this.ctx.storage.sql.exec("SELECT * FROM domain_sources ORDER BY domain ASC")] as unknown as DomainRow[];
			return json(rows.map(domainPublic));
		}

		if (url.pathname === "/domains" && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const domain = normalizeDomain((body as { domain?: string }).domain || "");
			if (!domain || !domain.includes(".")) return json({ error: "A valid domain is required" }, { status: 400 });
			const now = new Date().toISOString();
			this.ctx.storage.sql.exec(
				`INSERT INTO domain_sources (id, domain, source, status, created_at, updated_at)
				 VALUES (?, ?, 'manual', 'active', ?, ?)
				 ON CONFLICT(domain) DO UPDATE SET source = 'manual', status = 'active', updated_at = excluded.updated_at`,
				crypto.randomUUID(),
				domain,
				now,
				now,
			);
			return json({ ok: true }, { status: 201 });
		}

		const domainMatch = url.pathname.match(/^\/domains\/([^/]+)$/);
		if (domainMatch && method === "PUT") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { status } = body as { status?: DomainStatus };
			if (!["active", "disabled"].includes(status || "")) return json({ error: "Invalid status" }, { status: 400 });
			this.ctx.storage.sql.exec("UPDATE domain_sources SET status = ?, updated_at = ? WHERE id = ?", status, new Date().toISOString(), domainMatch[1]);
			return json({ ok: true });
		}
		if (domainMatch && method === "DELETE") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			this.ctx.storage.sql.exec("DELETE FROM domain_sources WHERE id = ?", domainMatch[1]);
			return json({ ok: true });
		}

		if (url.pathname === "/cloudflare-config" && method === "GET") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			return json({
				hasToken: !!this.getSetting("cloudflare_api_token"),
				lastSyncAt: this.getSetting("cloudflare_last_sync_at") || null,
				lastSyncError: this.getSetting("cloudflare_last_sync_error") || null,
			});
		}
		if (url.pathname === "/cloudflare-config" && method === "PUT") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { apiToken } = body as { apiToken?: string };
			if (apiToken?.trim()) this.setSetting("cloudflare_api_token", apiToken.trim());
			return json({ ok: true });
		}
		if (url.pathname === "/domains/sync" && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			return json(await this.syncCloudflareDomains());
		}

		if (url.pathname === "/mcp-keys" && method === "GET") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const rows = [...this.ctx.storage.sql.exec("SELECT * FROM mcp_api_keys ORDER BY created_at DESC")] as unknown as ApiKeyRow[];
			return json(rows.map(keyPublic));
		}
		if (url.pathname === "/mcp-keys" && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const label = String((body as { label?: string }).label || "MCP key").trim();
			const key = `mfi_${randomToken(32)}`;
			const now = new Date().toISOString();
			const id = crypto.randomUUID();
			this.ctx.storage.sql.exec(
				"INSERT INTO mcp_api_keys (id, label, key_prefix, key_hash, status, created_by, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
				id,
				label,
				key.slice(0, 12),
				await sha256(key),
				actor.id,
				now,
			);
			return json({ apiKey: keyPublic([...this.ctx.storage.sql.exec("SELECT * FROM mcp_api_keys WHERE id = ?", id)][0] as unknown as ApiKeyRow), key }, { status: 201 });
		}
		const keyStatusMatch = url.pathname.match(/^\/mcp-keys\/([^/]+)\/status$/);
		if (keyStatusMatch && method === "POST") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			const { status } = body as { status?: KeyStatus };
			if (!["active", "disabled"].includes(status || "")) return json({ error: "Invalid status" }, { status: 400 });
			this.ctx.storage.sql.exec("UPDATE mcp_api_keys SET status = ? WHERE id = ?", status, keyStatusMatch[1]);
			return json({ ok: true });
		}
		const keyMatch = url.pathname.match(/^\/mcp-keys\/([^/]+)$/);
		if (keyMatch && method === "DELETE") {
			if (!isAdminRole(actor.role)) return json({ error: "Forbidden" }, { status: 403 });
			this.ctx.storage.sql.exec("DELETE FROM mcp_api_keys WHERE id = ?", keyMatch[1]);
			return json({ ok: true });
		}

		return json({ error: "Not found" }, { status: 404 });
	}
}
