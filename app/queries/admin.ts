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
		mutationFn: ({ username, role }: { username: string; role: UserRole }) =>
			api.createUser(username, role),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users }),
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

export function useResetUserPassword() {
	return useMutation({
		mutationFn: (id: string) => api.resetUserPassword(id),
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
