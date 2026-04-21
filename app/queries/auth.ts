// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { AuthUser } from "~/types";
import { queryKeys } from "./keys";

export function useSession() {
	return useQuery<{ user: AuthUser }>({
		queryKey: queryKeys.auth.session,
		queryFn: () => api.getSession(),
		retry: false,
	});
}

export function useBootstrapAdmin() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ username, password }: { username: string; password: string }) =>
			api.bootstrapAdmin(username, password),
		onSuccess: ({ user }) => {
			qc.setQueryData(queryKeys.auth.session, { user });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useLogin() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ username, password }: { username: string; password: string }) =>
			api.login(username, password),
		onSuccess: ({ user }) => {
			qc.setQueryData(queryKeys.auth.session, { user });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useLogout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => api.logout(),
		onSuccess: () => {
			qc.removeQueries({ queryKey: queryKeys.auth.session });
			qc.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

export function useChangePassword() {
	return useMutation({
		mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
			api.changePassword(currentPassword, newPassword),
	});
}

