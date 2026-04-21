// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { Navigate } from "react-router";
import { AdminTabs } from "~/components/AdminTabs";
import { useCreateMcpKey, useDeleteMcpKey, useMcpKeys, useUpdateMcpKeyStatus } from "~/queries/admin";
import { useSession } from "~/queries/auth";

export default function AdminMcpKeysRoute() {
	const toast = useKumoToastManager();
	const { data: session, isLoading: isSessionLoading } = useSession();
	const { data: keys = [], isLoading } = useMcpKeys();
	const createKey = useCreateMcpKey();
	const updateStatus = useUpdateMcpKeyStatus();
	const deleteKey = useDeleteMcpKey();
	const [label, setLabel] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);

	if (isSessionLoading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (!session?.user || session.user.role !== "admin") return <Navigate to="/" replace />;

	return (
		<div className="mx-auto max-w-4xl px-4 py-6 md:px-8 space-y-6">
			<div className="space-y-4">
				<AdminTabs showHomeLink />
				<h1 className="text-xl font-semibold text-kumo-default">MCP Keys</h1>
			</div>
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 space-y-4">
				<div className="flex gap-3">
					<Input className="flex-1" placeholder="Key label" value={label} onChange={(e) => setLabel(e.target.value)} />
					<Button
						variant="primary"
						onClick={async () => {
							try {
								const result = await createKey.mutateAsync(label || "MCP key");
								setCreatedKey(result.key);
								setLabel("");
							} catch {
								toast.add({ title: "Failed to create key", variant: "error" });
							}
						}}
					>
						Create Key
					</Button>
				</div>
				{createdKey && (
					<div className="rounded-md border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default">
						New key: <span className="font-mono break-all">{createdKey}</span>
					</div>
				)}
			</div>
			<div className="rounded-lg border border-kumo-line bg-kumo-base overflow-hidden">
				{isLoading ? (
					<div className="flex justify-center py-12"><Loader size="lg" /></div>
				) : keys.map((item) => (
					<div key={item.id} className="flex items-center justify-between gap-4 border-t border-kumo-line first:border-t-0 px-5 py-4">
						<div>
							<div className="text-sm font-medium text-kumo-default">{item.label}</div>
							<div className="text-xs text-kumo-subtle">{item.keyPrefix} · {item.status}</div>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => updateStatus.mutate({ id: item.id, status: item.status === "active" ? "disabled" : "active" })}
							>
								{item.status === "active" ? "Disable" : "Enable"}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => deleteKey.mutate(item.id)}
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
