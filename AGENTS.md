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
- Monthly estimate: one bar per used model (no tier splits). Bar fill = official monthly usage %; max label = the model's monthly dollar allowance (e.g. MiMo $60, DeepSeek $100); dotted = projected usage at reset with one shared forward pace for all rows: total 7-day request volume across non-free models (the 7d average smooths out one-day peaks), priced at each row's snapshot pattern rate (price-source unit prices x standard token mix). Each row is a hypothetical "what if everything ran on this model" scenario, so markers stay directly comparable and the cheapest unit price stretches furthest (e.g. a DeepSeek row capping early means switch to Spark or use less to survive to reset). Pool divisor (window spend of non-free models / official usage %), right label = remaining credit at reset = (100 − projected %) × the model's max credit, red cap date (en-GB) when the projection crosses 100%. GLM Flash (latest) reference row ($0). big-pickle/zen and snapshot free models excluded.
- Update times (rolling-limit "Updated" + price-snapshot note) render in the viewer's local timezone; offset-less stored timestamps are treated as UTC.
