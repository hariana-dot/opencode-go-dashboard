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
- After schema changes: `npm run db:migrate:remote` then `npm run deploy` (deploy script runs remote migrations first).
- Price snapshots: Worker cron `0 0 * * *` fetches `ocgo-pricing.all-the.rest/data/latest.json` into D1 (`price_snapshots` + `model_usage_days`); dashboard on-load refreshes when stale >12 h. First run backfills from the site's `data/history.json`.
- Monthly estimate burn = Σ(official per-request cost ÷ model usage allowance on that request's date); `big-pickle` and snapshot free models burn 0; unmatched models excluded and flagged. UI: one marker bar per used model (fill = that model's pool share, solid tick = current pool %, dotted tick = pool projection at reset if only that model continues at 7-day pace) plus a version-agnostic "GLM Flash (latest)" reference row (latest `glm-*-flash` from the price snapshot; scenario = last-7-day total spend on that model).
