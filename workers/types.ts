// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export type UserRole = "admin" | "employee";
export type UserStatus = "active" | "disabled";

export interface AuthUser {
	id: string;
	username: string;
	role: UserRole;
	status: UserStatus;
}

export interface AppConfigResponse {
	availableDomains: string[];
	isInitialized: boolean;
	authMode: "local";
	canManageDomains: boolean;
}

export interface Env extends Cloudflare.Env {}
