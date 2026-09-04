# AGENTS.md — opencode-go-dashboard

## Project

- **Name:** opencode-go-dashboard
- **Description:** Self-hosted OpenCode Go quota dashboard (Cloudflare Workers + D1). Shows 5h/weekly/monthly meters, stacked daily cost-by-model chart from official usage history, and a password-protected phone-friendly UI.
- **Stack:** React 19, Vite, Tailwind v4, Cloudflare Workers, D1, Wrangler.
- **Folder Structure:**

```
opencode-go-dashboard/
├── AGENTS.md
├── src/client/          # React UI
├── src/worker/          # Worker API
├── migrations/          # D1 SQL
├── wrangler.jsonc
└── package.json
```

## Sync Table

| Item | Source | Status |
|------|--------|--------|
| GitHub repo | `hariana-dot/opencode-go-dashboard` | ✅ synced |
| Obsidian note | `Projects/opencode-go-dashboard` | ✅ synced |

## Notes

- Do not commit `.dev.vars` or auth cookies.
- After schema changes: `npm run db:migrate:remote` then `npm run deploy`.
