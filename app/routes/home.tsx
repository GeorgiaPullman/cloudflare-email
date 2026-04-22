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
import { EnvelopeIcon, PlusIcon, SignOutIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import { AdminTabs } from "~/components/AdminTabs";
import { useBootstrapAdmin, useLogin, useLogout, useSession } from "~/queries/auth";
import api from "~/services/api";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxes,
} from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";

export function meta() {
	return [{ title: "Mailflare" }];
}

const EMAIL_ROUTING_GUIDE_IMAGE = "/email-route.png";
const EMAIL_SENDING_GUIDE_IMAGE = "/email-send.png";
const API_TOKEN_GUIDE_IMAGE = "/api-token.png";

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

export default function HomeRoute() {
	const toastManager = useKumoToastManager();
	const { data: configData, isLoading: isConfigLoading } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
	});
	const { data: session, isLoading: isSessionLoading } = useSession();
	const { data: mailboxes = [] } = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();
	const logout = useLogout();

	const domains = configData?.availableDomains ?? [];

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{ id: string; email: string } | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) setSelectedDomain(domains[0]);
	}, [domains, selectedDomain]);

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
							<Button
								variant="primary"
								icon={<PlusIcon size={16} />}
								onClick={() => setIsCreateOpen(true)}
								disabled={domains.length === 0}
							>
								New Mailbox
							</Button>
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
							{session.user.role === "admin"
								? "No active domains yet. Add one in Domains before creating mailboxes."
								: "No active domains yet. An administrator needs to add one before mailboxes can be created."}
						</p>
					)}
					{session.user.role === "admin" && (
						<div className="mt-4">
							<AdminTabs />
						</div>
					)}
				</div>

				{mailboxes.length > 0 ? (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						{mailboxes.map((account, idx) => (
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
									icon={<TrashIcon size={16} />}
									aria-label={`Delete mailbox ${account.email}`}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setMailboxToDelete({ id: account.id, email: account.email });
										setIsDeleteOpen(true);
									}}
								/>
							</RouterLink>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 px-6">
						<div className="flex flex-col items-center text-center">
							<EnvelopeIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">No mailboxes yet</h3>
							<p className="text-sm text-kumo-subtle max-w-sm mb-5">
								{domains.length > 0
									? "Create a mailbox to start sending and receiving emails."
									: "Add an active domain before creating mailboxes."}
							</p>
							<Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setIsCreateOpen(true)} disabled={domains.length === 0}>
								Create Mailbox
							</Button>
						</div>
					</div>
				)}

				<div className="mt-6 rounded-xl border border-kumo-line bg-kumo-base p-5">
					<h2 className="text-sm font-semibold text-kumo-default">首次使用配置说明</h2>
					<ol className="mt-3 space-y-3 text-sm text-kumo-subtle list-decimal pl-5">
						<li>
							先在{" "}
							{session.user.role === "admin" ? (
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
