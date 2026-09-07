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
- Monthly estimate: one bar per used model (no tier splits). Bar fill = official monthly usage %; max label = the model's monthly dollar allowance (e.g. MiMo \, DeepSeek \); dotted = projected usage at reset from the last 7 days of recorded spend on that model; red cap date when the projection crosses 100%. GLM Flash (latest) reference row (\). big-pickle/zen and snapshot free models excluded.
