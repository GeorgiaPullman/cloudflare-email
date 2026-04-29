// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Mailbox } from "~/types";
import { queryKeys } from "./keys";

export function useMailboxes() {
	return useQuery<Mailbox[]>({
		queryKey: queryKeys.mailboxes.all,
		queryFn: () => api.listMailboxes() as Promise<Mailbox[]>,
	});
}

export function useMailboxFavorites() {
	return useQuery<string[]>({
		queryKey: queryKeys.mailboxes.favorites,
		queryFn: async () => {
			const result = await api.listMailboxFavorites();
			return result.favorites;
		},
	});
}

export function useMailbox(mailboxId: string | undefined) {
	return useQuery<Mailbox>({
		queryKey: mailboxId
			? queryKeys.mailboxes.detail(mailboxId)
			: ["mailboxes", "_disabled"],
		queryFn: () => api.getMailbox(mailboxId!) as Promise<Mailbox>,
		enabled: !!mailboxId,
	});
}

export function useCreateMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ email, name }: { email: string; name: string }) =>
			api.createMailbox(email, name),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}

export function useUpdateMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			settings,
		}: { mailboxId: string; settings: unknown }) =>
			api.updateMailbox(mailboxId, settings),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.detail(mailboxId) });
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}

export function useDeleteMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (mailboxId: string) => api.deleteMailbox(mailboxId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}

export function useUpdateMailboxFavorite() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ mailboxId, favorited }: { mailboxId: string; favorited: boolean }) =>
			api.updateMailboxFavorite(mailboxId, favorited),
		onMutate: async ({ mailboxId, favorited }) => {
			await qc.cancelQueries({ queryKey: queryKeys.mailboxes.favorites });
			const previous = qc.getQueryData<string[]>(queryKeys.mailboxes.favorites);
			qc.setQueryData<string[]>(queryKeys.mailboxes.favorites, (current = []) => {
				const normalized = mailboxId.toLowerCase();
				const next = new Set(current.map((email) => email.toLowerCase()));
				if (favorited) next.add(normalized);
				else next.delete(normalized);
				return [...next];
			});
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous) qc.setQueryData(queryKeys.mailboxes.favorites, context.previous);
		},
		onSettled: () => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.favorites });
		},
	});
}
