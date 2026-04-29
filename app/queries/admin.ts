// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { UserRole } from "~/types";
import { queryKeys } from "./keys";

export function useAdminUsers() {
	return useQuery({
		queryKey: queryKeys.admin.users,
		queryFn: () => api.listUsers(),
	});
}

export function useCreateAdminUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ username, role, mailboxEmails }: { username: string; role: UserRole; mailboxEmails?: string[] }) =>
			api.createUser(username, role, mailboxEmails),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.users });
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}

export function useUpdateUserStatus() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) =>
			api.updateUserStatus(id, status),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users }),
	});
}

export function useUpdateUserRole() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
			api.updateUserRole(id, role),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users }),
	});
}

export function useResetUserPassword() {
	return useMutation({
		mutationFn: (id: string) => api.resetUserPassword(id),
	});
}

export function useUserMailboxes(userId: string | undefined) {
	return useQuery({
		queryKey: userId ? queryKeys.admin.userMailboxes(userId) : ["admin", "user-mailboxes", "_disabled"],
		queryFn: () => api.listUserMailboxes(userId!),
		enabled: !!userId,
	});
}

export function useUpdateUserMailboxes() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, mailboxEmails }: { id: string; mailboxEmails: string[] }) =>
			api.updateUserMailboxes(id, mailboxEmails),
		onSuccess: (_data, { id }) => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.userMailboxes(id) });
			qc.invalidateQueries({ queryKey: queryKeys.admin.users });
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}

export function useAdminDomains() {
	return useQuery({
		queryKey: queryKeys.admin.domains,
		queryFn: () => api.listDomains(),
	});
}

export function useCreateDomain() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (domain: string) => api.createDomain(domain),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.domains });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useUpdateDomain() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) =>
			api.updateDomain(id, status),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.domains });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useDeleteDomain() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteDomain(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.domains });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useCloudflareConfig() {
	return useQuery({
		queryKey: queryKeys.admin.cloudflare,
		queryFn: () => api.getCloudflareConfig(),
	});
}

export function useUpdateCloudflareConfig() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ apiToken }: { apiToken: string }) =>
			api.updateCloudflareConfig(apiToken),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.cloudflare }),
	});
}

export function useSyncDomains() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => api.syncDomains(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.domains });
			qc.invalidateQueries({ queryKey: queryKeys.admin.cloudflare });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useMcpKeys() {
	return useQuery({
		queryKey: queryKeys.admin.mcpKeys,
		queryFn: () => api.listMcpKeys(),
	});
}

export function useCreateMcpKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (label: string) => api.createMcpKey(label),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.mcpKeys }),
	});
}

export function useUpdateMcpKeyStatus() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) =>
			api.updateMcpKeyStatus(id, status),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.mcpKeys }),
	});
}

export function useDeleteMcpKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteMcpKey(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.mcpKeys }),
	});
}

export function useStorageUsage(enabled = true) {
	return useQuery({
		queryKey: queryKeys.admin.storageUsage,
		queryFn: () => api.getStorageUsage(),
		enabled,
	});
}

export function useUpdateStorageQuota() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (quotaBytes: number) => api.updateStorageQuota(quotaBytes),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.storageUsage }),
	});
}

export function useCleanupStorage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (months: number) => api.cleanupStorage(months),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.admin.storageUsage });
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
			qc.invalidateQueries({
				predicate: (query) => {
					const root = query.queryKey[0];
					return root === "emails" || root === "folders" || root === "search";
				},
			});
		},
	});
}
