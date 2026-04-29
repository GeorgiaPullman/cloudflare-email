<div align="center">
  <h1>Cloudflare Email</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Cloudflare Email lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Cloudflare Email screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI.

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/GeorgiaPullman/cloudflare-email)

2. **Initialize the app** -- Visit your deployed app and create the first account. The first account becomes the protected primary administrator. Public registration is disabled after this step.
3. **Add sending domains** -- In the administrator dashboard, add domains manually or configure a Cloudflare API token to discover Email Service sending domains automatically.
4. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker.
5. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/).
6. **Create mailboxes and users** -- Primary and secondary administrators can create mailboxes, create employee accounts, and assign mailboxes to employees.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Role-based access** — The first user is the primary administrator. Secondary administrators can manage the app, while employees only see assigned mailboxes or mailboxes whose prefix matches their username
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Built-in local users with primary administrator, secondary administrator, and employee roles, plus long-lived HTTP-only cookie sessions

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Create an R2 bucket named `cloudflare-email`: `wrangler r2 bucket create cloudflare-email`
2. If you want automatic sending-domain discovery, configure a Cloudflare API token later in the admin dashboard after deployment.

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- An administrator account initialized after deployment

The first initialized account is the primary administrator and cannot be disabled or demoted. Primary and secondary administrators can manage domains, users, mailboxes, and MCP API keys. Employee accounts only see explicitly assigned mailboxes plus any mailbox whose local part matches their username, for example `ligang@example.com` for user `ligang`. Employees can send, reply, draft, move, star, and mark messages in their accessible mailboxes, but cannot delete non-draft emails, delete mailboxes, or change mailbox/system settings.

The MCP server at `/mcp` requires an administrator-created API key passed as a Bearer token. MCP keys currently retain administrator-level mailbox access.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
