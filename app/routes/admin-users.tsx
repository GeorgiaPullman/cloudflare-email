// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { AdminTabs } from "~/components/AdminTabs";
import {
	useCreateAdminUser,
	useAdminUsers,
	useResetUserPassword,
	useUpdateUserMailboxes,
	useUpdateUserRole,
	useUpdateUserStatus,
	useUserMailboxes,
} from "~/queries/admin";
import { useSession } from "~/queries/auth";
import { useMailboxes } from "~/queries/mailboxes";
import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import { queryKeys } from "~/queries/keys";
import type { AuthUser, UserRole } from "~/types";

function isAdminRole(role?: UserRole) {
	return role === "primary_admin" || role === "admin";
}

function roleLabel(role: UserRole) {
	if (role === "primary_admin") return "Primary Admin";
	if (role === "admin") return "Secondary Admin";
	return "Employee";
}

function roleSortRank(role: UserRole) {
	if (role === "primary_admin") return 0;
	if (role === "admin") return 1;
	return 2;
}

function normalizeUsername(username: string) {
	return username.trim().toLowerCase();
}

function canChangeRole(actor: AuthUser, user: AuthUser) {
	if (user.role === "primary_admin") return false;
	if (actor.id === user.id) return false;
	if (actor.role === "primary_admin") return true;
	return user.role === "employee";
}

function canChangeStatus(actor: AuthUser, user: AuthUser) {
	if (actor.id === user.id) return false;
	if (user.role === "primary_admin") return false;
	if (actor.role === "primary_admin") return true;
	return user.role === "employee";
}

function UserMailboxManager({ user }: { user: AuthUser }) {
	const toast = useKumoToastManager();
	const { data: allMailboxes = [] } = useMailboxes();
	const { data, isLoading } = useUserMailboxes(user.id);
	const updateMailboxes = useUpdateUserMailboxes();
	const [selected, setSelected] = useState<Set<string> | null>(null);
	const [isExpanded, setIsExpanded] = useState(false);

	const autoMailboxes = useMemo(
		() => allMailboxes
			.map((mailbox) => mailbox.email.toLowerCase())
			.filter((email) => email.split("@")[0] === user.username),
		[allMailboxes, user.username],
	);
	const assignedManual = useMemo(
		() => (data?.mailboxes ?? [])
			.filter((mailbox) => mailbox.source === "manual")
			.map((mailbox) => mailbox.email.toLowerCase()),
		[data?.mailboxes],
	);
	const selectedSet = selected ?? new Set(assignedManual);

	const toggle = (email: string) => {
		const normalized = email.toLowerCase();
		const next = new Set(selectedSet);
		if (next.has(normalized)) next.delete(normalized);
		else next.add(normalized);
		setSelected(next);
	};

	const save = async () => {
		try {
			await updateMailboxes.mutateAsync({
				id: user.id,
				mailboxEmails: [...selectedSet],
			});
			setSelected(null);
			toast.add({ title: `Mailbox assignments saved for ${user.username}` });
		} catch (error) {
			toast.add({ title: error instanceof Error ? error.message : "Failed to save mailbox assignments", variant: "error" });
		}
	};

	if (user.role !== "employee" || user.status === "disabled") return null;

	return (
		<div className="mt-4 rounded-lg border border-kumo-line bg-kumo-recessed p-4">
			<div className={`${isExpanded ? "mb-3" : ""} flex items-center justify-between gap-3`}>
				<button
					type="button"
					onClick={() => setIsExpanded((value) => !value)}
					className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-kumo-default hover:text-kumo-link"
					aria-expanded={isExpanded}
				>
					<CaretDownIcon
						size={16}
						className={`shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
					/>
					<span className="min-w-0">
						<span className="block text-sm font-medium">Mailbox access</span>
						<span className="block text-xs text-kumo-subtle">同名邮箱会自动分配，其他邮箱可手动勾选。</span>
					</span>
				</button>
				{isExpanded && (
					<Button
						size="sm"
						variant="primary"
						onClick={save}
						loading={updateMailboxes.isPending}
						disabled={isLoading || selected === null}
					>
						Save Access
					</Button>
				)}
			</div>
			{isExpanded && (isLoading ? (
				<div className="py-4"><Loader size="sm" /></div>
			) : allMailboxes.length === 0 ? (
				<div className="text-sm text-kumo-subtle">No mailboxes available yet.</div>
			) : (
				<div className="grid gap-2 md:grid-cols-2">
					{allMailboxes.map((mailbox) => {
						const email = mailbox.email.toLowerCase();
						const isAuto = autoMailboxes.includes(email);
						const checked = isAuto || selectedSet.has(email);
						return (
							<label
								key={email}
								className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
									checked ? "border-kumo-brand bg-kumo-base" : "border-kumo-line bg-kumo-base"
								} ${isAuto ? "opacity-80" : "cursor-pointer"}`}
							>
								<input
									type="checkbox"
									checked={checked}
									disabled={isAuto}
									onChange={() => toggle(email)}
								/>
								<span className="min-w-0 flex-1 truncate text-kumo-default">{email}</span>
								{isAuto && <span className="text-xs text-kumo-subtle">Auto</span>}
							</label>
						);
					})}
				</div>
			))}
		</div>
	);
}

export default function AdminUsersRoute() {
	const toast = useKumoToastManager();
	const { data: session, isLoading: isSessionLoading } = useSession();
	const { data: users = [], isLoading } = useAdminUsers();
	const { data: configData } = useQuery({ queryKey: queryKeys.config, queryFn: () => api.getConfig() });
	const createUser = useCreateAdminUser();
	const updateStatus = useUpdateUserStatus();
	const updateRole = useUpdateUserRole();
	const resetPassword = useResetUserPassword();
	const [username, setUsername] = useState("");
	const [role, setRole] = useState<"admin" | "employee">("employee");
	const [mailboxesToCreate, setMailboxesToCreate] = useState<Set<string>>(new Set());
	const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
	const sortedUsers = useMemo(
		() => [...users].sort((a, b) => roleSortRank(a.role) - roleSortRank(b.role)),
		[users],
	);

	if (isSessionLoading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (!session?.user || !isAdminRole(session.user.role)) return <Navigate to="/" replace />;

	const activeDomains = configData?.availableDomains ?? [];
	const normalizedUsername = normalizeUsername(username);
	const mailboxCandidates = role === "employee" && normalizedUsername
		? activeDomains.map((domain) => `${normalizedUsername}@${domain}`)
		: [];

	const handleCreate = async () => {
		if (!username.trim()) return;
		try {
			const result = await createUser.mutateAsync({
				username: username.trim(),
				role,
				mailboxEmails: role === "employee" ? [...mailboxesToCreate] : [],
			});
			setGeneratedPassword(result.password);
			setUsername("");
			setMailboxesToCreate(new Set());
			toast.add({ title: "User created" });
		} catch (error) {
			toast.add({ title: error instanceof Error ? error.message : "Failed to create user", variant: "error" });
		}
	};

	return (
		<div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
			<div className="mb-6 space-y-4">
				<AdminTabs showHomeLink />
				<h1 className="text-xl font-semibold text-kumo-default">Users</h1>
			</div>
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 mb-6 space-y-4">
				<div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
					<Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
					<div>
						<span className="text-sm font-medium text-kumo-default mb-1.5 block">Role</span>
						<Select value={role} onValueChange={(value) => {
							if (!value) return;
							setRole(value as "admin" | "employee");
							setMailboxesToCreate(new Set());
						}}>
							<Select.Option value="employee">Employee</Select.Option>
							<Select.Option value="admin">Secondary Admin</Select.Option>
						</Select>
					</div>
					<div className="flex items-end">
						<Button variant="primary" onClick={handleCreate} loading={createUser.isPending}>Create User</Button>
					</div>
				</div>
				{mailboxCandidates.length > 0 && (
					<div className="rounded-lg border border-kumo-line bg-kumo-recessed p-4">
						<div className="mb-3">
							<div className="text-sm font-medium text-kumo-default">Create mailbox for this employee</div>
							<div className="text-xs text-kumo-subtle">选择后会同时创建并分配给该员工；已存在的邮箱会直接分配。</div>
						</div>
						<div className="grid gap-2 md:grid-cols-2">
							{mailboxCandidates.map((email) => (
								<label key={email} className="flex cursor-pointer items-center gap-2 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm">
									<input
										type="checkbox"
										checked={mailboxesToCreate.has(email)}
										onChange={() => {
											setMailboxesToCreate((current) => {
												const next = new Set(current);
												if (next.has(email)) next.delete(email);
												else next.add(email);
												return next;
											});
										}}
									/>
									<span className="truncate text-kumo-default">{email}</span>
								</label>
							))}
						</div>
					</div>
				)}
				{generatedPassword && (
					<div className="rounded-md border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default">
						Initial password: <span className="font-mono">{generatedPassword}</span>
					</div>
				)}
			</div>
			<div className="rounded-lg border border-kumo-line bg-kumo-base overflow-hidden">
				{isLoading ? (
					<div className="flex justify-center py-12"><Loader size="lg" /></div>
				) : sortedUsers.map((user) => {
					const roleEditable = canChangeRole(session.user, user);
					const statusEditable = canChangeStatus(session.user, user);
					return (
						<div key={user.id} className="border-t border-kumo-line first:border-t-0 px-5 py-4">
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<div className="text-sm font-medium text-kumo-default">{user.username}</div>
										<span className="rounded-full bg-kumo-fill px-2 py-0.5 text-xs text-kumo-subtle">{roleLabel(user.role)}</span>
										<span className={`rounded-full px-2 py-0.5 text-xs ${user.status === "active" ? "bg-kumo-success/10 text-kumo-success" : "bg-kumo-fill text-kumo-subtle"}`}>{user.status}</span>
									</div>
									{user.role === "primary_admin" && (
										<div className="mt-1 text-xs text-kumo-subtle">Protected account: cannot be disabled or changed.</div>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{roleEditable && (
										<Select value={user.role} onValueChange={(value) => value && updateRole.mutate({ id: user.id, role: value as UserRole })}>
											<Select.Option value="employee">Employee</Select.Option>
											<Select.Option value="admin">Secondary Admin</Select.Option>
										</Select>
									)}
									<Button
										variant="secondary"
										size="sm"
										onClick={async () => {
											try {
												const result = await resetPassword.mutateAsync(user.id);
												setGeneratedPassword(result.password);
												toast.add({ title: `Password reset for ${user.username}` });
											} catch (error) {
												toast.add({ title: error instanceof Error ? error.message : "Failed to reset password", variant: "error" });
											}
										}}
									>
										Reset Password
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={!statusEditable}
										onClick={async () => {
											try {
												await updateStatus.mutateAsync({
													id: user.id,
													status: user.status === "active" ? "disabled" : "active",
												});
											} catch (error) {
												toast.add({ title: error instanceof Error ? error.message : "Failed to update status", variant: "error" });
											}
										}}
									>
										{user.status === "active" ? "Disable" : "Enable"}
									</Button>
								</div>
							</div>
							<UserMailboxManager user={user} />
						</div>
					);
				})}
			</div>
		</div>
	);
}
