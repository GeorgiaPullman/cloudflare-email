// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useChangePassword, useSession } from "~/queries/auth";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";

function isAdminRole(role?: string) {
	return role === "primary_admin" || role === "admin";
}

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();
	const changePassword = useChangePassword();
	const { data: session } = useSession();

	const [displayName, setDisplayName] = useState("");
	const [agentAutoDraftEnabled, setAgentAutoDraftEnabled] = useState(true);
	const [agentPrompt, setAgentPrompt] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentAutoDraftEnabled(mailbox.settings?.agentAutoDraft?.enabled ?? true);
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentAutoDraft: {
				enabled: agentAutoDraftEnabled,
			},
			agentSystemPrompt: agentPrompt.trim() || undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	const handleChangePassword = async () => {
		try {
			await changePassword.mutateAsync({ currentPassword, newPassword });
			setCurrentPassword("");
			setNewPassword("");
			toastManager.add({ title: "Password updated" });
		} catch {
			toastManager.add({ title: "Failed to update password", variant: "error" });
		}
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	if (!isAdminRole(session?.user.role)) {
		return (
			<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6">
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5 text-sm text-kumo-subtle">
					Only administrators can change mailbox settings.
				</div>
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<div className="mb-4 rounded-lg border border-kumo-line bg-kumo-recessed p-4">
						<div className="flex items-start justify-between gap-4">
							<div>
								<div className="text-sm font-medium text-kumo-default">
									Auto-generate reply drafts
								</div>
								<p className="text-xs text-kumo-subtle mt-1">
									When enabled, new incoming emails automatically trigger the AI agent to create a reply draft.
								</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-label="Enable AI auto-draft replies"
								aria-checked={agentAutoDraftEnabled}
								onClick={() => setAgentAutoDraftEnabled((enabled) => !enabled)}
								className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-ring ${
									agentAutoDraftEnabled
										? "border-kumo-brand bg-kumo-brand hover:bg-kumo-brand-hover"
										: "border-kumo-line bg-kumo-fill hover:bg-kumo-fill-hover"
								}`}
							>
								<span
									className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
										agentAutoDraftEnabled ? "translate-x-5" : "translate-x-0"
									}`}
								/>
							</button>
						</div>
					</div>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>

				{/* Save */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Password
					</div>
					<div className="space-y-3">
						<Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
						<Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
						<div className="flex justify-end">
							<Button variant="secondary" onClick={handleChangePassword} loading={changePassword.isPending}>
								Update Password
							</Button>
						</div>
					</div>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
