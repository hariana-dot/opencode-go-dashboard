# OpenCode Go Dashboard

A self-hosted, password-protected dashboard for your [OpenCode Go](https://opencode.ai/docs/go/) subscription, running entirely on [Cloudflare Workers](https://workers.cloudflare.com/) + D1. Track one or many OpenCode Go accounts: official rolling / weekly / monthly meters, a daily cost breakdown by model, and a projected-usage estimate that tells you when your monthly pool will run out.

![OpenCode Go Dashboard](docs/screenshot.jpg)

## Features

- **Official quota meters** — 5-hour rolling, weekly, and monthly windows with live percentages parsed from the OpenCode console.
- **Multi-account** — add, edit, and delete accounts; refresh one or all at once; near-limit highlighting.
- **Cost breakdown** — stacked daily cost-by-model chart from your official usage history (`big-pickle` / Zen models are always hidden).
- **Projected usage** — for every model you use, a bar starting at your current monthly usage with a dotted marker showing where usage lands at reset if the total 7-day request pace continues, priced at that model's rates against the overall remaining pool. The priciest model shows the earliest cap date; you can switch the reference model from any OpenCode Go model in the dropdown.
- **Live model pricing** — the worker snapshots [ocgo-pricing.all-the.rest](https://ocgo-pricing.all-the.rest) daily (cron) and backfills on load when stale, so allowances and rates stay current.
- **Incremental sync** — usage history syncs by watermark; the estimate view only walks back the 8 days it needs.
- **i18n + theming** — English, 简体中文, 繁體中文, 日本語; light / dark / system theme.
- **Edge everything** — React + Kumo front end, Worker API, D1 storage; one `wrangler deploy`.

## Quick start (local)

```bash
git clone https://github.com/hariana-dot/opencode-go-dashboard.git
cd opencode-go-dashboard
npm install
cp .dev.vars.example .dev.vars
# edit .dev.vars and set ADMIN_PASSWORD
npm run db:migrate:local
npm run preview
```

The app runs at `http://localhost:8787` (Worker API + built front end). For front-end-only development with HMR: `npm run dev`.

## Deploy to Cloudflare

Prerequisites: [Node.js](https://nodejs.org/) 20+, a [Cloudflare account](https://dash.cloudflare.com/sign-up), Wrangler v4+.

### 1. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create opencode-go-dashboard
```

Copy the printed `database_id` into `wrangler.jsonc` → `d1_databases[0].database_id`.

### 2. Set the admin password

```bash
npx wrangler secret put ADMIN_PASSWORD
```

### 3. Migrate and deploy

```bash
npm run db:migrate:remote
npm run deploy
```

Wrangler prints your URL, e.g. `https://opencode-go-dashboard.<your-subdomain>.workers.dev`.

**Git-integration alternative:** connect the repo to a Workers project in the Cloudflare dashboard with build command `npm run deploy` — it builds, applies remote D1 migrations, and deploys on every push to `main`. In that case set `ADMIN_PASSWORD` under Workers → Settings → Variables & Secrets and fill in your own `database_id` locally (never commit real secrets).

### Custom domain (optional)

Uncomment the `routes` block in `wrangler.jsonc`, point it at a domain in your Cloudflare account, and redeploy.

## Usage

1. Open the deployed URL and sign in with `ADMIN_PASSWORD`.
2. **Add account** — you need:
   - **Display name** — any label.
   - **Workspace ID** — looks like `wrk_xxx`, from your OpenCode workspace URL.
   - **Auth cookie** — log in at [opencode.ai](https://opencode.ai), open DevTools → Application → Cookies, copy the value of the `auth` cookie (starts with `Fe26.`).
3. Hit **Refresh** (one) or **Refresh all** to pull live meters.
4. Cookies expire; when a meter stops updating, edit the account and paste a fresh cookie.

Cookies are stored server-side in your D1 database only — they are never returned to the browser.

### Reading the projected usage block

- **Bar fill** = your current official monthly usage %.
- **max $60 / max $30 / …** = that model's monthly dollar allowance from the price snapshot.
- **Dotted marker** = projected usage at reset: your total 7-day request pace priced at that model's per-request cost, added to the meter and measured against the overall remaining pool (window spend ÷ official usage %).
- **Right label** = projected spend by reset, or a red cap date (`d/m`) when the projection crosses 100%.
- **Reference model** = the dropdown under the title; `Auto` picks the latest `glm-*-flash` as a cheap baseline, and any other OpenCode Go model can be selected.

## Project structure

```
├── src/
│   ├── client/          # React front end (Kumo UI, i18n, prefs)
│   └── worker/          # Cloudflare Worker API + cron + parsers
├── migrations/          # D1 schema migrations (0001–0004)
├── wrangler.jsonc       # Workers config (assets, D1 binding, cron)
└── .dev.vars.example    # local env example (ADMIN_PASSWORD)
```

## Credits

- Dashboard base: [Ruinique/opencode-go-dashboard](https://github.com/Ruinique/opencode-go-dashboard)
- Live OpenCode Go model pricing: [all-the-rest/ocgo-price-tracker](https://github.com/all-the-rest/ocgo-price-tracker) ([ocgo-pricing.all-the.rest](https://ocgo-pricing.all-the.rest))

## Privacy & security

You must store your OpenCode auth cookie server-side for the meters to work. Deploy only in an environment you trust and protect the dashboard with a strong `ADMIN_PASSWORD`. Never commit `.dev.vars`, and never share cookies or the admin password. Quota data is parsed from the opencode.ai console, so parser updates may be needed if their page changes.

## License

[MIT](LICENSE)

---

## 中文说明（简体）

自托管的 OpenCode Go 额度面板：官方 5 小时 / 周度 / 月度用量、按模型划分的每日成本图、以及"预计用量"模块（虚线 = 若整体近 7 天请求节奏按该模型单价折算，月底用量会落在何处；最贵的模型最早触顶）。支持多账号、参考模型切换、四语言界面与明暗主题，`big-pickle` 始终隐藏。

**本地运行**

```bash
npm install
cp .dev.vars.example .dev.vars   # 设置 ADMIN_PASSWORD
npm run db:migrate:local
npm run preview                  # http://localhost:8787
```

**部署到 Cloudflare**

```bash
npx wrangler d1 create opencode-go-dashboard   # 把 database_id 填入 wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD
npm run db:migrate:remote
npm run deploy
```

也可在 Cloudflare 控制台把仓库连接到 Workers 项目（构建命令 `npm run deploy`），每次 push 自动构建部署；此时在 Workers → Settings → Variables 中设置 `ADMIN_PASSWORD`。

**添加账号**：Workspace ID（`wrk_xxx`，来自 OpenCode 工作区 URL）+ Auth Cookie（登录 opencode.ai → DevTools → Application → Cookies → 复制 `auth` 的值，以 `Fe26.` 开头）。Cookie 只存于服务端 D1，过期后在账号编辑里更新。

**数据说明**：模型价格快照每日定时取自 ocgo-pricing.all-the.rest，并在过期超过 12 小时时按需回填；用量历史按水位线增量同步。面板基于 Ruinique/opencode-go-dashboard，价格数据由 all-the-rest/ocgo-price-tracker 提供，感谢原作者与数据维护者。
