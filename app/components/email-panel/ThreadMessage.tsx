// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Tooltip } from "@cloudflare/kumo";
import {
	CaretDownIcon,
	CaretUpIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import {
	formatDetailDate,
	formatShortDate,
	rewriteInlineImages,
	stripHtml,
} from "~/lib/utils";
import type { Email } from "~/types";

interface ThreadMessageProps {
	email: Email;
	mailboxId?: string;
	mailboxEmail?: string;
	isLast: boolean;
	isDraft?: boolean;
	isSending?: boolean;
	isExpanded: boolean;
	onToggleExpand: () => void;
	onSendDraft?: () => void;
	onEditDraft?: () => void;
	onDeleteDraft?: () => void;
	onViewSource?: () => void;
	onPreviewImage?: (url: string, filename: string) => void;
}

function shouldIgnoreToggle() {
	if (typeof window === "undefined") return false;
	const selection = window.getSelection();
	return !!selection && selection.type === "Range" && selection.toString().trim().length > 0;
}

function Avatar({ isDraft, isSelf, sender }: { isDraft?: boolean; isSelf: boolean; sender: string }) {
	return (
		<div
			className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
				isDraft
					? "bg-kumo-fill text-kumo-subtle"
					: isSelf
						? "bg-kumo-brand text-kumo-inverse"
						: "bg-kumo-fill text-kumo-default"
			}`}
		>
			{isDraft ? "D" : sender.charAt(0).toUpperCase()}
		</div>
	);
}

export default function ThreadMessage({
	email,
	mailboxId,
	mailboxEmail,
	isLast,
	isDraft,
	isSending,
	isExpanded,
	onToggleExpand,
	onSendDraft,
	onEditDraft,
	onDeleteDraft,
	onViewSource,
	onPreviewImage,
}: ThreadMessageProps) {
	const isSelf = email.sender === mailboxEmail;
	const containerClassName = `${!isLast ? "border-b border-kumo-line" : ""} ${isDraft ? "border-l-2 border-l-kumo-warning bg-kumo-warning/[0.02]" : ""}`;
	const senderLabel = isDraft ? "Draft reply" : isSelf ? "You" : email.sender;

	if (!isExpanded) {
		return (
			<div className={containerClassName}>
				<button
					type="button"
					onClick={() => {
						if (shouldIgnoreToggle()) return;
						onToggleExpand();
					}}
					className="w-full flex items-center gap-3 px-4 py-3 hover:bg-kumo-tint rounded-lg text-left cursor-pointer"
				>
					<Avatar isDraft={isDraft} isSelf={isSelf} sender={email.sender} />
					<div className="flex-1 min-w-0">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium text-kumo-default truncate">
								{senderLabel}
							</span>
							<span className="text-xs text-kumo-subtle shrink-0">
								{formatDetailDate(email.date)}
							</span>
						</div>
						<p className="text-xs text-kumo-subtle truncate">
							{stripHtml(email.body || "").slice(0, 80)}
						</p>
					</div>
					<CaretDownIcon size={14} className="text-kumo-subtle shrink-0" />
				</button>
			</div>
		);
	}

	return (
		<div className={`group/thread-msg ${containerClassName}`}>
			<div
				className="px-4 py-4 md:px-6 cursor-pointer"
				role="button"
				tabIndex={0}
				onClick={() => {
					if (shouldIgnoreToggle()) return;
					onToggleExpand();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						if (shouldIgnoreToggle()) return;
						onToggleExpand();
					}
				}}
			>
				<div className="flex items-center justify-between gap-3 mb-3">
					<div className="flex items-center gap-2.5 min-w-0">
						<div className="shrink-0 hover:ring-2 hover:ring-kumo-brand/30 transition-shadow rounded-full">
							<Avatar isDraft={isDraft} isSelf={isSelf} sender={email.sender} />
						</div>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-sm font-medium text-kumo-default truncate">
									{senderLabel}
								</span>
								{isDraft && <Badge variant="outline">Draft</Badge>}
							</div>
							<div className="text-xs text-kumo-subtle">To: {email.recipient}</div>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<span className="text-xs text-kumo-subtle">
							{formatShortDate(email.date)}
						</span>
						<CaretUpIcon
							size={14}
							className="text-kumo-subtle hover:text-kumo-default transition-colors ml-1 shrink-0"
						/>
					</div>
				</div>

				<div className="md:ml-[42px] cursor-auto" onClick={(event) => event.stopPropagation()}>
					<EmailIframe
						body={rewriteInlineImages(
							email.body || "",
							mailboxId || "",
							email.id,
							email.attachments,
						)}
						autoSize
					/>
				</div>

				{isDraft && (onSendDraft || onEditDraft || onDeleteDraft) && (
					<div className="flex gap-2 mt-3 md:ml-[42px] cursor-auto" onClick={(event) => event.stopPropagation()}>
						{onSendDraft && (
							<Button
								variant="primary"
								size="sm"
								icon={<PaperPlaneTiltIcon size={14} />}
								onClick={onSendDraft}
								loading={isSending}
								disabled={isSending}
							>
								{isSending ? "Sending..." : "Send"}
							</Button>
						)}
						{onEditDraft && (
							<Button
								variant="secondary"
								size="sm"
								icon={<PencilSimpleIcon size={14} />}
								onClick={onEditDraft}
								disabled={isSending}
							>
								Edit
							</Button>
						)}
						{onDeleteDraft && (
							<Button
								variant="ghost"
								size="sm"
								icon={<TrashIcon size={14} />}
								onClick={onDeleteDraft}
								disabled={isSending}
							>
								Discard
							</Button>
						)}
					</div>
				)}

				<EmailAttachmentList
					mailboxId={mailboxId}
					emailId={email.id}
					attachments={email.attachments}
					onPreviewImage={onPreviewImage}
					className="mt-3 md:ml-[42px] cursor-auto"
				/>
			</div>
		</div>
	);
}
