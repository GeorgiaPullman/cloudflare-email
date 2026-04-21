// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";
import type { Email } from "~/types";

export type ComposeMode = "new" | "reply" | "reply-all" | "forward";
export type AgentSidebarTab = "agent" | "mcp";

const AGENT_PANEL_OPEN_STORAGE_KEY = "mailflare.agentPanelOpen";
const AGENT_SIDEBAR_TAB_STORAGE_KEY = "mailflare.agentSidebarTab";

function readStorageValue(key: string) {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorageValue(key: string, value: string) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Ignore storage failures so UI controls still work.
	}
}

function readAgentPanelOpenPreference() {
	return readStorageValue(AGENT_PANEL_OPEN_STORAGE_KEY) === "true";
}

function readAgentSidebarTabPreference(): AgentSidebarTab {
	return readStorageValue(AGENT_SIDEBAR_TAB_STORAGE_KEY) === "mcp" ? "mcp" : "agent";
}

export interface ComposeOptions {
	mode: ComposeMode;
	originalEmail?: Email | null;
	/** When editing a draft, this holds the draft email to pre-fill the composer */
	draftEmail?: Email | null;
}

interface UIState {
	// Side panel state
	selectedEmailId: string | null;
	isComposing: boolean;
	_previousEmailId: string | null;
	selectEmail: (id: string | null) => void;
	startCompose: (options?: ComposeOptions) => void;
	closePanel: () => void;
	closeCompose: () => void;

	// Compose options
	composeOptions: ComposeOptions;

	// Mobile sidebar
	isSidebarOpen: boolean;
	openSidebar: () => void;
	closeSidebar: () => void;
	toggleSidebar: () => void;

	// Agent panel
	isAgentPanelOpen: boolean;
	agentSidebarTab: AgentSidebarTab;
	toggleAgentPanel: () => void;
	setAgentSidebarTab: (tab: AgentSidebarTab) => void;
	hydrateUIPreferences: () => void;

	// Legacy dialog support (kept for non-split views)
	isComposeModalOpen: boolean;
	openComposeModal: (options?: ComposeOptions) => void;
	closeComposeModal: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
	selectedEmailId: null,
	isComposing: false,
	_previousEmailId: null,
	composeOptions: { mode: "new", originalEmail: null },
	isComposeModalOpen: false,
	isSidebarOpen: false,
	isAgentPanelOpen: false,
	agentSidebarTab: "agent",

	selectEmail: (id) => set({ selectedEmailId: id, isComposing: false }),

	startCompose: (options) =>
		set((state) => {
			const mode = options?.mode || "new";
			const isReplyOrForward = mode === "reply" || mode === "reply-all" || mode === "forward";
			return {
				isComposing: true,
				_previousEmailId: state.selectedEmailId,
				// Keep selectedEmailId when replying/forwarding so the thread stays visible
				selectedEmailId: isReplyOrForward ? state.selectedEmailId : null,
				composeOptions: options || { mode: "new", originalEmail: null },
				isSidebarOpen: false,
			};
		}),

	closePanel: () => set({ selectedEmailId: null, isComposing: false, _previousEmailId: null, composeOptions: { mode: "new" as const, originalEmail: null } }),

	closeCompose: () =>
		set((state) => ({
			isComposing: false,
			selectedEmailId: state._previousEmailId,
			_previousEmailId: null,
			composeOptions: { mode: "new" as const, originalEmail: null },
		})),

	openSidebar: () => set({ isSidebarOpen: true }),
	closeSidebar: () => set({ isSidebarOpen: false }),
	toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),

	toggleAgentPanel: () =>
		set((state) => {
			const isAgentPanelOpen = !state.isAgentPanelOpen;
			writeStorageValue(AGENT_PANEL_OPEN_STORAGE_KEY, String(isAgentPanelOpen));
			return { isAgentPanelOpen };
		}),
	setAgentSidebarTab: (tab) => {
		writeStorageValue(AGENT_SIDEBAR_TAB_STORAGE_KEY, tab);
		set({ agentSidebarTab: tab });
	},
	hydrateUIPreferences: () =>
		set({
			isAgentPanelOpen: readAgentPanelOpenPreference(),
			agentSidebarTab: readAgentSidebarTabPreference(),
		}),

	openComposeModal: (options) =>
		set({
			composeOptions: options || { mode: "new", originalEmail: null },
			isComposeModalOpen: true,
		}),

	closeComposeModal: () =>
		set({
			isComposeModalOpen: false,
			composeOptions: { mode: "new", originalEmail: null },
		}),
}));
