// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { Navigate } from "react-router";
import { AdminTabs } from "~/components/AdminTabs";
import {
	useAdminDomains,
	useCloudflareConfig,
	useCreateDomain,
	useDeleteDomain,
	useSyncDomains,
	useUpdateCloudflareConfig,
	useUpdateDomain,
} from "~/queries/admin";
import { useSession } from "~/queries/auth";

function isAdminRole(role?: string) {
	return role === "primary_admin" || role === "admin";
}

export default function AdminDomainsRoute() {
	const toast = useKumoToastManager();
	const { data: session, isLoading: isSessionLoading } = useSession();
	const { data: domains = [], isLoading } = useAdminDomains();
	const { data: cloudflare } = useCloudflareConfig();
	const createDomain = useCreateDomain();
	const updateDomain = useUpdateDomain();
	const deleteDomain = useDeleteDomain();
	const updateCloudflare = useUpdateCloudflareConfig();
	const syncDomains = useSyncDomains();
	const [domain, setDomain] = useState("");
	const [apiToken, setApiToken] = useState("");

	if (isSessionLoading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (!session?.user || !isAdminRole(session.user.role)) return <Navigate to="/" replace />;

	return (
		<div className="mx-auto max-w-4xl px-4 py-6 md:px-8 space-y-6">
			<div className="space-y-4">
				<AdminTabs showHomeLink />
				<h1 className="text-xl font-semibold text-kumo-default">Domains</h1>
			</div>

			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 space-y-4">
				<div className="text-sm font-medium text-kumo-default">Manual domain management</div>
				<div className="flex gap-3">
					<Input
						className="flex-1"
						name="manual-domain-entry"
						autoComplete="off"
						autoCorrect="off"
						autoCapitalize="none"
						spellCheck={false}
						placeholder="example.com"
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
					/>
					<Button
						variant="primary"
						onClick={async () => {
							try {
								await createDomain.mutateAsync(domain.trim());
								setDomain("");
							} catch (error) {
								toast.add({ title: error instanceof Error ? error.message : "Failed to add domain", variant: "error" });
							}
						}}
					>
						Add Domain
					</Button>
				</div>
			</div>

			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 space-y-4">
				<div className="text-sm font-medium text-kumo-default">Cloudflare discovery</div>
				<Input
					label="API Token"
					type="text"
					name="cloudflare-api-token"
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="none"
					spellCheck={false}
					placeholder={cloudflare?.hasToken ? "Token already configured" : "Paste Cloudflare API token"}
					value={apiToken}
					onChange={(e) => setApiToken(e.target.value)}
				/>
				<div className="flex gap-2">
					<Button
						variant="primary"
						onClick={async () => {
							try {
								await updateCloudflare.mutateAsync({ apiToken });
								setApiToken("");
								toast.add({ title: "Cloudflare config saved" });
							} catch {
								toast.add({ title: "Failed to save config", variant: "error" });
							}
						}}
					>
						Save Config
					</Button>
				</div>
				{cloudflare?.lastSyncAt && (
					<div className="text-xs text-kumo-subtle">
						Last sync: {new Date(cloudflare.lastSyncAt).toLocaleString()}
						{cloudflare.lastSyncError ? ` · ${cloudflare.lastSyncError}` : ""}
					</div>
				)}
			</div>

			<div className="flex justify-end">
				<Button
					variant="primary"
					onClick={async () => {
						try {
							const result = await syncDomains.mutateAsync();
							toast.add({ title: result.error ? `Sync completed with warning: ${result.error}` : `Synced ${result.synced} domains` });
						} catch {
							toast.add({ title: "Failed to sync domains", variant: "error" });
						}
					}}
				>
					Sync Now
				</Button>
			</div>

			<div className="rounded-lg border border-kumo-line bg-kumo-base overflow-hidden">
				{isLoading ? (
					<div className="flex justify-center py-12"><Loader size="lg" /></div>
				) : domains.map((item) => (
					<div key={item.id} className="flex items-center justify-between gap-4 border-t border-kumo-line first:border-t-0 px-5 py-4">
						<div>
							<div className="text-sm font-medium text-kumo-default">{item.domain}</div>
							<div className="text-xs text-kumo-subtle">{item.source} · {item.status}</div>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => updateDomain.mutate({ id: item.id, status: item.status === "active" ? "disabled" : "active" })}
							>
								{item.status === "active" ? "Disable" : "Enable"}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => deleteDomain.mutate(item.id)}
							>
								Delete
							</Button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
