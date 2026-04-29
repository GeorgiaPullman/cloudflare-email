// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Button,
	Dialog,
	DropdownMenu,
	Empty,
	Input,
	Loader,
	Select,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { DatabaseIcon, EnvelopeIcon, PlusIcon, SignOutIcon, StarIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { AdminTabs } from "~/components/AdminTabs";
import { useCleanupStorage, useStorageUsage, useUpdateStorageQuota } from "~/queries/admin";
import { useBootstrapAdmin, useLogin, useLogout, useSession } from "~/queries/auth";
import api from "~/services/api";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxFavorites,
	useMailboxes,
	useUpdateMailboxFavorite,
} from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import type { StorageUsage, UserRole } from "~/types";

export function meta() {
	return [{ title: "Mailflare" }];
}

const EMAIL_ROUTING_GUIDE_IMAGE = "/email-route.png";
const EMAIL_SENDING_GUIDE_IMAGE = "/email-send.png";
const API_TOKEN_GUIDE_IMAGE = "/api-token.png";
const MAILBOX_DOMAIN_FILTER_KEY = "mailflare:mailbox-domain-filter";
const DEFAULT_CLEANUP_MONTHS = 6;
const ONE_GB = 1024 * 1024 * 1024;
const TEN_GB = 10 * ONE_GB;

function MoreActionsIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			className="h-[18px] w-[18px] fill-current"
		>
			<circle cx="8" cy="3" r="1.5" />
			<circle cx="8" cy="8" r="1.5" />
			<circle cx="8" cy="13" r="1.5" />
		</svg>
	);
}

function AuthForm({ isInitialized }: { isInitialized: boolean }) {
	const toast = useKumoToastManager();
	const login = useLogin();
	const bootstrap = useBootstrapAdmin();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		try {
			if (isInitialized) {
				await login.mutateAsync({ username, password });
			} else {
				await bootstrap.mutateAsync({ username, password });
			}
		} catch (error) {
			toast.add({ title: error instanceof Error ? error.message : "Authentication failed", variant: "error" });
		}
	};

	return (
		<div className="min-h-screen bg-kumo-recessed flex items-center justify-center px-4">
			<form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-kumo-line bg-kumo-base p-6 space-y-4">
				<div>
					<h1 className="text-xl font-semibold text-kumo-default">
						{isInitialized ? "Sign in" : "Create administrator"}
					</h1>
					<p className="text-sm text-kumo-subtle mt-1">
						{isInitialized ? "Use your Mailflare username and password." : "The first account becomes the administrator."}
					</p>
				</div>
				<Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
				<Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
				<Button type="submit" variant="primary" className="w-full" loading={login.isPending || bootstrap.isPending}>
					{isInitialized ? "Sign in" : "Initialize"}
				</Button>
			</form>
		</div>
	);
}

function isAdminRole(role?: UserRole) {
	return role === "primary_admin" || role === "admin";
}

function getMailboxDomain(email: string) {
	return email.split("@")[1]?.toLowerCase() || "";
}

function readStoredDomainFilter() {
	if (typeof window === "undefined") return "all";
	return window.localStorage.getItem(MAILBOX_DOMAIN_FILTER_KEY) || "all";
}

function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function quotaLabel(bytes: number) {
	return bytes >= TEN_GB ? "10 GB Paid" : "1 GB Free";
}

function quotaSelectValue(bytes: number) {
	return bytes >= TEN_GB ? "10gb" : "1gb";
}

function quotaBytesFromSelect(value: string) {
	return value === "10gb" ? TEN_GB : ONE_GB;
}

function StorageUsagePanel({
	enabled,
}: {
	enabled: boolean;
}) {
	const toast = useKumoToastManager();
	const queryClient = useQueryClient();
	const { data: usage, isLoading } = useStorageUsage(enabled);
	const updateQuota = useUpdateStorageQuota();
	const cleanupStorage = useCleanupStorage();
	const [months, setMonths] = useState(String(DEFAULT_CLEANUP_MONTHS));
	const isDanger = (usage?.highestUsagePercent ?? 0) >= 80;

	if (!enabled) return null;

	const handleQuotaChange = async (value: string | null) => {
		if (!value) return;
		try {
			await updateQuota.mutateAsync(quotaBytesFromSelect(value));
			toast.add({ title: "Storage quota baseline updated" });
		} catch (error) {
			toast.add({ title: error instanceof Error ? error.message : "Failed to update storage quota", variant: "error" });
		}
	};

	const handleCleanup = async () => {
		const monthCount = Number(months);
		const confirmed = window.confirm(`This will permanently delete all emails and attachments older than ${monthCount} month(s) from every mailbox. This cannot be undone. Continue?`);
		if (!confirmed) return;
		try {
			const result = await cleanupStorage.mutateAsync(monthCount);
			queryClient.setQueryData(queryKeys.admin.storageUsage, result.after);
			const warning = result.r2DeleteFailureCount > 0
				? ` ${result.r2DeleteFailureCount} attachment file(s) could not be deleted from R2.`
				: "";
			toast.add({ title: `Deleted ${result.deletedEmailCount} email(s) and ${result.deletedAttachmentCount} attachment(s).${warning}` });
		} catch (error) {
			toast.add({ title: error instanceof Error ? error.message : "Failed to clean storage", variant: "error" });
		}
	};

	return (
		<div className={`mb-6 rounded-xl border p-5 ${
			isDanger ? "border-red-300 bg-red-50" : "border-kumo-line bg-kumo-base"
		}`}>
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<div className={`flex items-center gap-2 text-sm font-semibold ${isDanger ? "text-red-700" : "text-kumo-default"}`}>
						{isDanger ? <WarningCircleIcon size={18} weight="fill" /> : <DatabaseIcon size={18} />}
						Database usage
					</div>
					<p className={`mt-1 text-sm ${isDanger ? "text-red-700" : "text-kumo-subtle"}`}>
						SQLite-backed Durable Object usage per mailbox. R2 attachments are shown separately.
					</p>
				</div>
				<div className="w-full md:w-48">
					<span className="mb-1.5 block text-xs font-medium text-kumo-subtle">Quota baseline</span>
					<Select
						value={quotaSelectValue(usage?.quotaBytes ?? ONE_GB)}
						onValueChange={handleQuotaChange}
					>
						<Select.Option value="1gb">1 GB Free</Select.Option>
						<Select.Option value="10gb">10 GB Paid</Select.Option>
					</Select>
				</div>
			</div>

			{isLoading || !usage ? (
				<div className="py-6"><Loader size="sm" /></div>
			) : (
				<>
					{isDanger && (
						<div className="mt-5 rounded-lg bg-red-100 p-4 text-red-800">
							<div className="text-3xl font-bold">{usage.highestUsagePercent}%</div>
							<div className="mt-1 text-sm font-medium">
								{usage.highestUsageMailbox?.mailboxId || "A mailbox"} is close to the {quotaLabel(usage.quotaBytes)} database limit.
							</div>
						</div>
					)}
					<div className="mt-5 grid gap-3 md:grid-cols-4">
						<StorageMetric label="Total database" value={formatBytes(usage.totalDatabaseSize)} />
						<StorageMetric label="Highest mailbox" value={`${usage.highestUsagePercent}%`} danger={isDanger} />
						<StorageMetric label="Mailboxes" value={String(usage.mailboxCount)} />
						<StorageMetric label="R2 attachments" value={formatBytes(usage.totalAttachmentBytes)} />
					</div>
					<div className="mt-5 flex flex-col gap-3 rounded-lg border border-kumo-line bg-kumo-recessed p-4 md:flex-row md:items-end md:justify-between">
						<div className="max-w-md">
							<div className="text-sm font-medium text-kumo-default">Clean old data</div>
							<p className="mt-1 text-xs text-kumo-subtle">
								Permanently delete emails and R2 attachments older than the selected age from all mailboxes.
							</p>
						</div>
						<div className="flex items-end gap-2">
							<div className="w-32">
								<span className="mb-1.5 block text-xs font-medium text-kumo-subtle">Older than</span>
								<Select value={months} onValueChange={(value) => value && setMonths(value)}>
									{Array.from({ length: 24 }, (_, index) => String(index + 1)).map((value) => (
										<Select.Option key={value} value={value}>{value} months</Select.Option>
									))}
								</Select>
							</div>
							<Button
								variant="destructive"
								onClick={handleCleanup}
								loading={cleanupStorage.isPending}
								disabled={usage.mailboxCount === 0}
							>
								Clean
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function StorageMetric({
	label,
	value,
	danger = false,
}: {
	label: string;
	value: string;
	danger?: boolean;
}) {
	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-3">
			<div className="text-xs text-kumo-subtle">{label}</div>
			<div className={`mt-1 text-lg font-semibold ${danger ? "text-red-700" : "text-kumo-default"}`}>{value}</div>
		</div>
	);
}

export default function HomeRoute() {
	const toastManager = useKumoToastManager();
	const { data: configData, isLoading: isConfigLoading } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
	});
	const { data: session, isLoading: isSessionLoading } = useSession();
	const { data: mailboxes = [] } = useMailboxes();
	const { data: favoriteMailboxes = [] } = useMailboxFavorites();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();
	const updateFavorite = useUpdateMailboxFavorite();
	const logout = useLogout();

	const domains = configData?.availableDomains ?? [];
	const canManageMailboxes = isAdminRole(session?.user.role);

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{ id: string; email: string } | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [domainFilter, setDomainFilter] = useState(readStoredDomainFilter);

	const mailboxDomains = useMemo(() => {
		return [...new Set(mailboxes.map((mailbox) => getMailboxDomain(mailbox.email)).filter(Boolean))].sort();
	}, [mailboxes]);
	const favoriteSet = useMemo(() => new Set(favoriteMailboxes.map((email) => email.toLowerCase())), [favoriteMailboxes]);
	const domainTabs = useMemo(() => ["all", "favorites", ...mailboxDomains], [mailboxDomains]);
	const filteredMailboxes = domainFilter === "favorites"
		? mailboxes.filter((mailbox) => favoriteSet.has(mailbox.email.toLowerCase()))
		: domainFilter === "all"
		? mailboxes
		: mailboxes.filter((mailbox) => getMailboxDomain(mailbox.email) === domainFilter);

	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) setSelectedDomain(domains[0]);
	}, [domains, selectedDomain]);

	useEffect(() => {
		if (domainFilter === "all" || domainFilter === "favorites") return;
		if (!mailboxDomains.includes(domainFilter)) setDomainFilter("all");
	}, [domainFilter, mailboxDomains]);

	useEffect(() => {
		if (typeof window !== "undefined") {
			window.localStorage.setItem(MAILBOX_DOMAIN_FILTER_KEY, domainFilter);
		}
	}, [domainFilter]);

	if (isConfigLoading || isSessionLoading) {
		return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	}

	if (!configData?.isInitialized || !session?.user) {
		return <AuthForm isInitialized={!!configData?.isInitialized} />;
	}

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) {
			setCreateError("Please choose a domain and enter a mailbox prefix");
			return;
		}
		const email = `${newPrefix}@${selectedDomain}`;
		const name = newName || newPrefix;
		setIsCreating(true);
		try {
			await createMailbox.mutateAsync({ email, name });
			toastManager.add({ title: "Mailbox created successfully!" });
			setIsCreateOpen(false);
			setNewPrefix("");
			setNewName("");
		} catch (err: unknown) {
			const message = (err instanceof Error ? err.message : null) || "Failed to create mailbox";
			setCreateError(message);
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await deleteMailbox.mutateAsync(mailboxToDelete.id);
			toastManager.add({ title: "Mailbox deleted" });
			setIsDeleteOpen(false);
			setMailboxToDelete(null);
		} catch {
			toastManager.add({ title: "Failed to delete mailbox", variant: "error" });
		} finally {
			setIsDeleting(false);
		}
	};

	const toggleFavorite = async (mailboxId: string) => {
		const normalized = mailboxId.toLowerCase();
		try {
			await updateFavorite.mutateAsync({
				mailboxId: normalized,
				favorited: !favoriteSet.has(normalized),
			});
		} catch (error) {
			toastManager.add({ title: error instanceof Error ? error.message : "Failed to update favorite", variant: "error" });
		}
	};

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-16">
				<div className="mb-8">
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div>
							<h1 className="text-2xl font-bold text-kumo-default">Mailboxes</h1>
							<p className="text-sm text-kumo-subtle mt-1">
								Signed in as {session.user.username}
							</p>
						</div>
						<div className="flex items-center gap-2 self-start">
							{canManageMailboxes && (
								<Button
									variant="primary"
									icon={<PlusIcon size={16} />}
									onClick={() => setIsCreateOpen(true)}
									disabled={domains.length === 0}
								>
									New Mailbox
								</Button>
							)}
							<DropdownMenu>
								<DropdownMenu.Trigger render={(props) => (
									<Button
										{...props}
										variant="secondary"
										size="sm"
										shape="square"
										icon={<MoreActionsIcon />}
										aria-label="Open mailbox actions"
									/>
								)} />
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item
										icon={<SignOutIcon size={16} />}
										onClick={() => logout.mutate()}
									>
										Sign out
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu>
						</div>
					</div>
					{domains.length > 0 ? (
						<p className="text-sm text-kumo-subtle mt-1">{domains.join(", ")}</p>
					) : (
						<p className="text-sm text-kumo-subtle mt-1">
							{canManageMailboxes
								? "No active domains yet. Add one in Domains before creating mailboxes."
								: "No active domains yet. An administrator needs to add one before mailboxes can be created."}
						</p>
					)}
					{canManageMailboxes && (
						<div className="mt-4">
							<AdminTabs />
						</div>
					)}
				</div>

				{mailboxes.length > 0 && (
					<div className="mb-8 flex flex-wrap gap-x-8 gap-y-3">
						{domainTabs.map((domain) => {
							const active = domainFilter === domain;
							return (
								<button
									key={domain}
									type="button"
									onClick={() => setDomainFilter(domain)}
									className={`cursor-pointer border-b-2 bg-transparent pb-1 text-sm font-semibold transition-colors ${
										active
											? "border-kumo-brand text-kumo-default"
											: "border-transparent text-kumo-subtle hover:border-kumo-line hover:text-kumo-default"
									}`}
								>
									{domain === "all" ? "All" : domain === "favorites" ? "Favorites" : domain}
								</button>
							);
						})}
					</div>
				)}

				{mailboxes.length > 0 && filteredMailboxes.length > 0 ? (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						{filteredMailboxes.map((account, idx) => (
							<RouterLink
								key={account.id}
								to={`/mailbox/${account.id}`}
								className={`group flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-kumo-tint ${
									idx > 0 ? "border-t border-kumo-line" : ""
								}`}
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kumo-fill text-sm font-bold text-kumo-default">
									{account.name.charAt(0).toUpperCase()}
								</div>
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium text-kumo-default truncate">
										{account.name}
									</div>
									<div className="text-sm text-kumo-subtle">
										{account.email}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									shape="square"
									icon={<StarIcon size={17} weight={favoriteSet.has(account.email.toLowerCase()) ? "fill" : "regular"} />}
									aria-label={`${favoriteSet.has(account.email.toLowerCase()) ? "Remove from" : "Add to"} favorites ${account.email}`}
									className={favoriteSet.has(account.email.toLowerCase()) ? "text-amber-500 hover:text-amber-600" : "text-kumo-subtle hover:text-amber-500"}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										void toggleFavorite(account.email);
									}}
								/>
								{canManageMailboxes && (
									<Button
										variant="ghost"
										size="sm"
										shape="square"
										icon={<TrashIcon size={16} />}
										aria-label={`Delete mailbox ${account.email}`}
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setMailboxToDelete({ id: account.id, email: account.email });
											setIsDeleteOpen(true);
										}}
									/>
								)}
							</RouterLink>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 px-6">
						<div className="flex flex-col items-center text-center">
							<EnvelopeIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">
								{mailboxes.length > 0
									? domainFilter === "favorites"
										? "No favorite mailboxes yet"
										: "No mailboxes for this domain"
									: "No mailboxes yet"}
							</h3>
							<p className="text-sm text-kumo-subtle max-w-sm mb-5">
								{mailboxes.length > 0
									? domainFilter === "favorites"
										? "Star mailboxes from the list to keep them here."
										: "Choose another domain tab or switch back to All."
									: domains.length > 0
									? "Create a mailbox to start sending and receiving emails."
									: "Add an active domain before creating mailboxes."}
							</p>
							{canManageMailboxes && mailboxes.length === 0 && (
								<Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setIsCreateOpen(true)} disabled={domains.length === 0}>
									Create Mailbox
								</Button>
							)}
						</div>
					</div>
				)}

				<div className="mt-8">
					<StorageUsagePanel enabled={canManageMailboxes} />
				</div>

				<div className="mt-6 rounded-xl border border-kumo-line bg-kumo-base p-5">
					<h2 className="text-sm font-semibold text-kumo-default">首次使用配置说明</h2>
					<ol className="mt-3 space-y-3 text-sm text-kumo-subtle list-decimal pl-5">
						<li>
							先在{" "}
							{canManageMailboxes ? (
								<RouterLink to="/admin/domains" className="font-medium text-kumo-link no-underline hover:text-kumo-link-hover hover:underline">
									域名管理
								</RouterLink>
							) : (
								<span className="font-medium text-kumo-default">域名管理</span>
							)}
							中配置 Cloudflare API Token 以自动同步可用域名。{" "}
							<a
								href={API_TOKEN_GUIDE_IMAGE}
								target="_blank"
								rel="noreferrer"
								className="ml-2 inline-flex items-center rounded-md border border-kumo-line bg-kumo-recessed px-2.5 py-1 text-xs font-medium text-kumo-link no-underline transition-colors hover:bg-kumo-tint hover:text-kumo-link-hover"
							>
								查看教程
							</a>
						</li>
						<li>
							在 Cloudflare 中为域名配置邮件路由，并把捕获规则的目标指向当前 Worker。{" "}
							<a
								href={EMAIL_ROUTING_GUIDE_IMAGE}
								target="_blank"
								rel="noreferrer"
								className="ml-2 inline-flex items-center rounded-md border border-kumo-line bg-kumo-recessed px-2.5 py-1 text-xs font-medium text-kumo-link no-underline transition-colors hover:bg-kumo-tint hover:text-kumo-link-hover"
							>
								查看教程
							</a>
						</li>
						<li>
							在 Cloudflare 中接入发信域名并完成邮件发送配置，确保域名可以正常外发邮件。{" "}
							<a
								href={EMAIL_SENDING_GUIDE_IMAGE}
								target="_blank"
								rel="noreferrer"
								className="ml-2 inline-flex items-center rounded-md border border-kumo-line bg-kumo-recessed px-2.5 py-1 text-xs font-medium text-kumo-link no-underline transition-colors hover:bg-kumo-tint hover:text-kumo-link-hover"
							>
								查看教程
							</a>
						</li>
					</ol>
				</div>
			</div>

			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">Create New Mailbox</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && <Text variant="error" size="sm">{createError}</Text>}
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">Email Address</span>
							<div className="flex items-center gap-2">
								<Input aria-label="Address prefix" placeholder="info" size="sm" value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} required />
								<span className="text-sm text-kumo-subtle">@</span>
								<div className="flex-1">
									<Select aria-label="Domain" value={selectedDomain} onValueChange={(value) => value && setSelectedDomain(value)}>
										{domains.map((d) => <Select.Option key={d} value={d}>{d}</Select.Option>)}
									</Select>
								</div>
							</div>
						</div>
						<Input label="Display Name (optional)" placeholder="Info" size="sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>} />
							<Button type="submit" variant="primary" size="sm" loading={isCreating} disabled={!selectedDomain}>Create</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			<Dialog.Root open={isDeleteOpen} onOpenChange={(open) => {
				setIsDeleteOpen(open);
				if (!open) setMailboxToDelete(null);
			}}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">Delete Mailbox</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						Are you sure you want to delete <strong className="text-kumo-default">{mailboxToDelete?.email}</strong>?
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>} />
						<Button variant="destructive" size="sm" loading={isDeleting} onClick={handleDelete}>Delete</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
