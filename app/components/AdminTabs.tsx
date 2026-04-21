// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Link as RouterLink, useLocation } from "react-router";

const tabs = [
	{ label: "Users", to: "/admin/users" },
	{ label: "Domains", to: "/admin/domains" },
	{ label: "MCP Keys", to: "/admin/mcp-keys" },
];

export function AdminTabs() {
	const location = useLocation();

	return (
		<nav className="inline-flex max-w-full overflow-hidden rounded-full border border-kumo-line bg-kumo-base p-1 shadow-sm" aria-label="Admin sections">
			{tabs.map((tab) => {
				const isActive = location.pathname === tab.to;
				return (
					<RouterLink
						key={tab.to}
						to={tab.to}
						className={`rounded-full px-4 py-2 text-sm font-medium no-underline transition-colors ${
							isActive
								? "bg-kumo-fill text-kumo-default shadow-sm"
								: "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
						}`}
					>
						{tab.label}
					</RouterLink>
				);
			})}
		</nav>
	);
}
