// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface SignatureSettings {
	enabled: boolean;
	text: string;
	html?: string;
}

export interface AgentAutoDraftSettings {
	enabled: boolean;
}

export interface MailboxSettings {
	fromName?: string;
	forwarding?: { enabled: boolean; email: string };
	signature?: SignatureSettings;
	autoReply?: { enabled: boolean; subject: string; message: string };
	agentAutoDraft?: AgentAutoDraftSettings;
	agentSystemPrompt?: string;
}

export interface Mailbox {
	id: string;
	email: string;
	name: string;
	settings?: MailboxSettings;
}

export type UserRole = "primary_admin" | "admin" | "employee";
export type UserStatus = "active" | "disabled";

export interface AuthUser {
	id: string;
	username: string;
	role: UserRole;
	status: UserStatus;
	createdAt?: string;
	updatedAt?: string;
	lastLoginAt?: string | null;
}

export interface UserMailboxAssignment {
	email: string;
	source: "manual" | "auto_username";
	assigned: boolean;
	exists: boolean;
}

export interface AppConfig {
	availableDomains: string[];
	isInitialized: boolean;
	authMode: "local";
	canManageDomains: boolean;
}

export interface AdminDomain {
	id: string;
	domain: string;
	source: "manual" | "cloudflare_discovered";
	status: "active" | "disabled";
	lastSyncedAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CloudflareConfig {
	hasToken: boolean;
	lastSyncAt: string | null;
	lastSyncError: string | null;
}

export interface McpApiKey {
	id: string;
	label: string;
	keyPrefix: string;
	status: "active" | "disabled";
	createdBy: string;
	createdAt: string;
	lastUsedAt: string | null;
}

export interface Email {
	id: string;
	thread_id?: string | null;
	folder_id?: string | null;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string;
	bcc?: string;
	date: string;
	read: boolean;
	starred: boolean;
	body?: string | null;
	in_reply_to?: string | null;
	email_references?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	attachments?: Attachment[];
	snippet?: string | null;
	// Thread aggregate fields (only present in threaded list view)
	thread_count?: number;
	thread_unread_count?: number;
	participants?: string;
	needs_reply?: boolean;
	has_draft?: boolean;
}

export interface Attachment {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string;
	disposition?: string;
}

export interface Folder {
	id: string;
	name: string;
	unreadCount: number;
}
