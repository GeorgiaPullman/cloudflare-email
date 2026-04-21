// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { Navigate } from "react-router";
import { AdminTabs } from "~/components/AdminTabs";
import { useCreateAdminUser, useAdminUsers, useResetUserPassword, useUpdateUserStatus } from "~/queries/admin";
import { useSession } from "~/queries/auth";

export default function AdminUsersRoute() {
	const toast = useKumoToastManager();
	const { data: session, isLoading: isSessionLoading } = useSession();
	const { data: users = [], isLoading } = useAdminUsers();
	const createUser = useCreateAdminUser();
	const updateStatus = useUpdateUserStatus();
	const resetPassword = useResetUserPassword();
	const [username, setUsername] = useState("");
	const [role, setRole] = useState<"admin" | "employee">("employee");
	const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

	if (isSessionLoading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (!session?.user || session.user.role !== "admin") return <Navigate to="/" replace />;

	const handleCreate = async () => {
		if (!username.trim()) return;
		try {
			const result = await createUser.mutateAsync({ username: username.trim(), role });
			setGeneratedPassword(result.password);
			setUsername("");
			toast.add({ title: "User created" });
		} catch (error) {
			toast.add({ title: error instanceof Error ? error.message : "Failed to create user", variant: "error" });
		}
	};

	return (
		<div className="max-w-4xl px-4 py-6 md:px-8">
			<div className="mb-6 space-y-4">
				<AdminTabs />
				<h1 className="text-xl font-semibold text-kumo-default">Users</h1>
			</div>
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 mb-6 space-y-4">
				<div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
					<Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
					<div>
						<span className="text-sm font-medium text-kumo-default mb-1.5 block">Role</span>
						<Select value={role} onValueChange={(value) => value && setRole(value as "admin" | "employee")}>
							<Select.Option value="employee">Employee</Select.Option>
							<Select.Option value="admin">Admin</Select.Option>
						</Select>
					</div>
					<div className="flex items-end">
						<Button variant="primary" onClick={handleCreate} loading={createUser.isPending}>Create User</Button>
					</div>
				</div>
				{generatedPassword && (
					<div className="rounded-md border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default">
						Initial password: <span className="font-mono">{generatedPassword}</span>
					</div>
				)}
			</div>
			<div className="rounded-lg border border-kumo-line bg-kumo-base overflow-hidden">
				{isLoading ? (
					<div className="flex justify-center py-12"><Loader size="lg" /></div>
				) : users.map((user) => (
					<div key={user.id} className="flex items-center justify-between gap-4 border-t border-kumo-line first:border-t-0 px-5 py-4">
						<div>
							<div className="text-sm font-medium text-kumo-default">{user.username}</div>
							<div className="text-xs text-kumo-subtle">{user.role} · {user.status}</div>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="secondary"
								size="sm"
								onClick={async () => {
									try {
										const result = await resetPassword.mutateAsync(user.id);
										setGeneratedPassword(result.password);
										toast.add({ title: `Password reset for ${user.username}` });
									} catch {
										toast.add({ title: "Failed to reset password", variant: "error" });
									}
								}}
							>
								Reset Password
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={async () => {
									try {
										await updateStatus.mutateAsync({
											id: user.id,
											status: user.status === "active" ? "disabled" : "active",
										});
									} catch {
										toast.add({ title: "Failed to update status", variant: "error" });
									}
								}}
							>
								{user.status === "active" ? "Disable" : "Enable"}
							</Button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
