# OpenCode Go Dashboard

Self-hosted **OpenCode Go quota dashboard** on Cloudflare Workers + D1.

See your **5-hour / weekly / monthly usage**, a **daily cost chart by model**, and a **projected usage** forecast that tells you when the monthly pool will run out — for one account or many.

![OpenCode Go Dashboard — rolling, weekly, monthly meters, cost chart, and projected usage](docs/screenshot.jpg)

**Keywords:** OpenCode Go, OpenCode quota, usage dashboard, cost tracker, Cloudflare Workers, D1, self-hosted, multi-account.

---

## What it does

OpenCode Go is a $10/month plan with rolling, weekly, and monthly usage windows. This dashboard reads those windows from the official OpenCode console and adds two extra views the console does not give you:

1. **Cost** — stacked daily spend by model (from official usage history).
2. **Projected usage** — if your last 7 days of requests continue, priced at each model’s rate, where does the **overall** monthly pool land at reset? The most expensive model shows the earliest cap date.

Cookies stay in your D1 database. The browser never sees them.

## Features

| | |
|---|---|
| **Official meters** | Rolling (5h), weekly, and monthly % used + time until reset |
| **Multi-account** | Add / edit / delete workspaces; refresh one or all |
| **Cost chart** | Daily stacked bars by model, month picker, model filter. `big-pickle` (Zen) is always hidden |
| **Projected usage** | Per-model bars from current monthly %, dotted marker = projected usage at reset, remaining $ or cap date |
| **Reference model** | Dropdown of all OpenCode Go models (defaults to latest GLM Flash) |
| **Live prices** | Daily snapshot from [ocgo-pricing.all-the.rest](https://ocgo-pricing.all-the.rest) |
| **11 languages** | EN, 简体, 繁體, 日本語, ES, DE, RU, FR, PT, TR, IT |
| **Light / dark** | Plus system theme |
| **Password gate** | `ADMIN_PASSWORD` secret; cookies never leave the server |
| **Edge host** | React + Vite + Cloudflare Workers + D1. One `npm run deploy` |

## Quick start (local)

Needs [Node.js](https://nodejs.org/) 20+.

```bash
git clone https://github.com/hariana-dot/opencode-go-dashboard.git
cd opencode-go-dashboard
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD
npm run db:migrate:local
npm run preview                  # http://localhost:8787
```

Front-end only (Vite HMR, no Worker): `npm run dev`.

## Deploy to Cloudflare

Needs a [Cloudflare account](https://dash.cloudflare.com/sign-up) and Wrangler v4.

```bash
npx wrangler login
npx wrangler d1 create opencode-go-dashboard
# paste the printed database_id into wrangler.jsonc → d1_databases[0].database_id

npx wrangler secret put ADMIN_PASSWORD
npm run db:migrate:remote
npm run deploy
```

URL looks like `https://opencode-go-dashboard.<subdomain>.workers.dev`.

**Git deploy:** connect this repo to a Workers project, build command `npm run deploy`. Set `ADMIN_PASSWORD` under Workers → Settings → Variables & Secrets. Forks must use **their own** `database_id`.

Optional custom domain: uncomment `routes` in `wrangler.jsonc` and redeploy.

## Add an account

1. Open the dashboard and sign in with `ADMIN_PASSWORD`.
2. **Add account**:
   - **Display name** — any label
   - **Workspace ID** — `wrk_…` from the OpenCode workspace URL
   - **Auth cookie** — log in at [opencode.ai](https://opencode.ai) → DevTools → Application → Cookies → copy `auth` (starts with `Fe26.`)
3. **Refresh** (or **Refresh all**) to pull live meters.

When a cookie expires, edit the account and paste a new one. Cookies are stored only in D1.

### Reading projected usage

- **Fill** = current official monthly usage %.
- **max $60 / $30 / …** = that model’s monthly dollar allowance.
- **Dotted line** = projected usage at reset (total 7-day request pace, priced at that model, against the overall remaining pool).
- **Right label** = dollars left at reset, or a red **cap d/m** if the projection crosses 100%.

## Project layout

```
src/client/     React UI (Kumo, i18n, theme)
src/worker/     Cloudflare Worker API, cron, parsers
migrations/     D1 schema (0001–0004)
wrangler.jsonc  Workers + D1 + daily price cron
```

## Credits

- Dashboard base: [Ruinique/opencode-go-dashboard](https://github.com/Ruinique/opencode-go-dashboard)
- Live OpenCode Go prices: [all-the-rest/ocgo-price-tracker](https://github.com/all-the-rest/ocgo-price-tracker)

## Privacy

- `.dev.vars` is gitignored. Never commit it.
- Auth cookies live in **your** D1 only — not in this repo, not in the browser.
- `ADMIN_PASSWORD` is a Wrangler secret (or local `.dev.vars`).
- `wrangler.jsonc` `database_id` is a Cloudflare resource id, not a login. Forks must replace it with their own D1.

Deploy only where you trust the host. Use a strong admin password.

## License

[MIT](LICENSE)

---

## 中文

自托管 OpenCode Go 额度面板：官方 5 小时 / 周 / 月用量、按模型每日成本图、月底用量预测（虚线 = 近 7 天整体请求按该模型单价折算后的月底位置）。Cookie 只存在你的 D1，浏览器看不到。

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run preview
```

部署：`npx wrangler d1 create opencode-go-dashboard` → 填 `database_id` → `npx wrangler secret put ADMIN_PASSWORD` → `npm run deploy`。

添加账号需要 Workspace ID（`wrk_…`）和 opencode.ai 的 `auth` Cookie（`Fe26.` 开头）。价格数据来自 ocgo-pricing.all-the.rest，面板基于 Ruinique/opencode-go-dashboard。
