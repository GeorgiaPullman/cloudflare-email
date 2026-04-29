// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type {
	AdminDomain,
	AppConfig,
	AuthUser,
	CloudflareConfig,
	Email,
	Folder,
	Mailbox,
	McpApiKey,
	StorageCleanupResult,
	StorageUsage,
	UserMailboxAssignment,
	UserRole,
	UserStatus,
} from "~/types";

const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
	status: number;
	body: Record<string, unknown>;

	constructor(status: number, body: Record<string, unknown>) {
		super((body.error as string) || `Request failed: ${status}`);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

async function request<T>(
	url: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	// Combine caller signal (e.g. TanStack Query abort) with our timeout signal
	const signal = options.signal
		? AbortSignal.any([options.signal, controller.signal])
		: controller.signal;

	try {
		const res = await fetch(url, {
			...options,
			signal,
			headers: {
				"Content-Type": "application/json",
				...(options.headers as Record<string, string>),
			},
		});

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new ApiError(res.status, body as Record<string, unknown>);
		}

		if (res.status === 204) return undefined as T;

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			return res.json() as Promise<T>;
		}
		return res.blob() as unknown as T;
	} finally {
		clearTimeout(timeout);
	}
}

function get<T>(url: string, opts?: { params?: Record<string, string>; responseType?: string; signal?: AbortSignal }) {
	const query = opts?.params ? `?${new URLSearchParams(opts.params)}` : "";
	return request<T>(`${url}${query}`, {
		method: "GET",
		signal: opts?.signal,
		...(opts?.responseType === "blob" ? { headers: { Accept: "*/*" } } : {}),
	});
}

function post<T>(url: string, body?: unknown, opts?: { signal?: AbortSignal }) {
	return request<T>(url, {
		method: "POST",
		signal: opts?.signal,
		body: body != null ? JSON.stringify(body) : undefined,
	});
}

function put<T>(url: string, body?: unknown) {
	return request<T>(url, {
		method: "PUT",
		body: body != null ? JSON.stringify(body) : undefined,
	});
}

function del<T>(url: string) {
	return request<T>(url, { method: "DELETE" });
}

// ---------- Typed response shapes ----------

interface EmailListResponse {
	emails: Email[];
	totalCount: number;
}

// ---------- API client ----------

const api = {
	// Config
	getConfig: () => get<AppConfig>("/api/v1/config"),

	// Auth
	bootstrapAdmin: (username: string, password: string) =>
		post<{ user: AuthUser }>("/api/v1/setup/bootstrap-admin", { username, password }),
	login: (username: string, password: string) =>
		post<{ user: AuthUser }>("/api/v1/auth/login", { username, password }),
	logout: () => post<{ ok: boolean }>("/api/v1/auth/logout"),
	getSession: () => get<{ user: AuthUser }>("/api/v1/auth/session"),
	changePassword: (currentPassword: string, newPassword: string) =>
		post<{ ok: boolean }>("/api/v1/auth/change-password", { currentPassword, newPassword }),

	// Admin
	listUsers: () => get<AuthUser[]>("/api/v1/admin/users"),
	createUser: (username: string, role: UserRole, mailboxEmails?: string[]) =>
		post<{ user: AuthUser; password: string }>("/api/v1/admin/users", { username, role, mailboxEmails }),
	updateUserStatus: (id: string, status: UserStatus) =>
		post<{ user: AuthUser }>(`/api/v1/admin/users/${id}/status`, { status }),
	updateUserRole: (id: string, role: UserRole) =>
		post<{ user: AuthUser }>(`/api/v1/admin/users/${id}/role`, { role }),
	resetUserPassword: (id: string) =>
		post<{ user: AuthUser; password: string }>(`/api/v1/admin/users/${id}/reset-password`),
	listUserMailboxes: (id: string) =>
		get<{ user: AuthUser; mailboxes: UserMailboxAssignment[] }>(`/api/v1/admin/users/${id}/mailboxes`),
	updateUserMailboxes: (id: string, mailboxEmails: string[]) =>
		put<{ mailboxes: UserMailboxAssignment[] }>(`/api/v1/admin/users/${id}/mailboxes`, { mailboxEmails }),
	listDomains: () => get<AdminDomain[]>("/api/v1/admin/domains"),
	createDomain: (domain: string) => post<{ ok: boolean }>("/api/v1/admin/domains", { domain }),
	updateDomain: (id: string, status: "active" | "disabled") =>
		put<{ ok: boolean }>(`/api/v1/admin/domains/${id}`, { status }),
	deleteDomain: (id: string) => del<{ ok: boolean }>(`/api/v1/admin/domains/${id}`),
	getCloudflareConfig: () => get<CloudflareConfig>("/api/v1/admin/cloudflare-config"),
	updateCloudflareConfig: (apiToken: string) =>
		put<{ ok: boolean }>("/api/v1/admin/cloudflare-config", { apiToken }),
	syncDomains: () =>
		post<{ synced: number; domains: string[]; error: string | null }>("/api/v1/admin/domains/sync"),
	listMcpKeys: () => get<McpApiKey[]>("/api/v1/admin/mcp-keys"),
	createMcpKey: (label: string) =>
		post<{ apiKey: McpApiKey; key: string }>("/api/v1/admin/mcp-keys", { label }),
	updateMcpKeyStatus: (id: string, status: "active" | "disabled") =>
		post<{ ok: boolean }>(`/api/v1/admin/mcp-keys/${id}/status`, { status }),
	deleteMcpKey: (id: string) => del<{ ok: boolean }>(`/api/v1/admin/mcp-keys/${id}`),
	getStorageUsage: () => get<StorageUsage>("/api/v1/admin/storage/usage"),
	updateStorageQuota: (quotaBytes: number) =>
		put<StorageUsage>("/api/v1/admin/storage/quota", { quotaBytes }),
	cleanupStorage: (months: number) =>
		post<StorageCleanupResult>("/api/v1/admin/storage/cleanup", { months }),

	// User mailbox favorites
	listMailboxFavorites: () => get<{ favorites: string[] }>("/api/v1/mailbox-favorites"),
	updateMailboxFavorite: (mailboxId: string, favorited: boolean) =>
		put<{ favorites: string[] }>(`/api/v1/mailbox-favorites/${mailboxId}`, { favorited }),

	// Mailboxes
	listMailboxes: () => get<Mailbox[]>("/api/v1/mailboxes"),
	createMailbox: (email: string, name: string, settings?: unknown) =>
		post<Mailbox>("/api/v1/mailboxes", { email, name, settings }),
	getMailbox: (mailboxId: string) =>
		get<Mailbox>(`/api/v1/mailboxes/${mailboxId}`),
	updateMailbox: (mailboxId: string, settings: unknown) =>
		put<Mailbox>(`/api/v1/mailboxes/${mailboxId}`, { settings }),
	deleteMailbox: (mailboxId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}`),

	// Emails
	listEmails: (mailboxId: string, params: Record<string, string>, opts?: { signal?: AbortSignal }) =>
		get<EmailListResponse | Email[]>(`/api/v1/mailboxes/${mailboxId}/emails`, { params, signal: opts?.signal }),
	sendEmail: (mailboxId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails`, email),
	getEmail: (mailboxId: string, id: string, opts?: { signal?: AbortSignal }) =>
		get<Email>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`, { signal: opts?.signal }),
	updateEmail: (mailboxId: string, id: string, data: unknown) =>
		put<Email>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`, data),
	deleteEmail: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`),
	moveEmail: (mailboxId: string, id: string, folderId: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${id}/move`, { folderId }),
	getThread: (mailboxId: string, threadId: string, opts?: { signal?: AbortSignal }) =>
		get<Email[]>(`/api/v1/mailboxes/${mailboxId}/threads/${threadId}`, { signal: opts?.signal }),
	markThreadRead: (mailboxId: string, threadId: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/threads/${threadId}/read`),
	getAttachment: (mailboxId: string, emailId: string, attachmentId: string) =>
		get<Blob>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/attachments/${attachmentId}`, { responseType: "blob" }),
	saveDraft: (
		mailboxId: string,
		draft: {
			to?: string;
			cc?: string;
			bcc?: string;
			subject?: string;
			body: string;
			in_reply_to?: string;
			thread_id?: string;
			draft_id?: string;
		},
	) => post<{ draft_id: string }>(`/api/v1/mailboxes/${mailboxId}/drafts`, draft),
	replyToEmail: (mailboxId: string, emailId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/reply`, email),
	forwardEmail: (mailboxId: string, emailId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/forward`, email),

	// Folders
	listFolders: (mailboxId: string) =>
		get<Folder[]>(`/api/v1/mailboxes/${mailboxId}/folders`),
	createFolder: (mailboxId: string, name: string) =>
		post<Folder>(`/api/v1/mailboxes/${mailboxId}/folders`, { name }),
	updateFolder: (mailboxId: string, id: string, name: string) =>
		put<Folder>(`/api/v1/mailboxes/${mailboxId}/folders/${id}`, { name }),
	deleteFolder: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/folders/${id}`),

	// Search
	searchEmails: (mailboxId: string, params: Record<string, string>) =>
		get<EmailListResponse | Email[]>(`/api/v1/mailboxes/${mailboxId}/search`, { params }),
};

export default api;
