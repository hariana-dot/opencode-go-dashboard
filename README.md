# OpenCode Go Dashboard

## Acknowledgements

Quota is parsed from the [opencode.ai](https://opencode.ai) dashboard.

Based on [Ruinique/opencode-go-dashboard](https://github.com/Ruinique/opencode-go-dashboard).

Live model pricing by [all-the-rest/ocgo-price-tracker](https://github.com/all-the-rest/ocgo-price-tracker) ([ocgo-pricing.all-the.rest](https://ocgo-pricing.all-the.rest)).

---

Self-hosted **OpenCode Go quota dashboard** on Cloudflare Workers + D1.

See **5-hour / weekly / monthly usage**, a **daily cost chart by model**, and **projected usage** at reset — for one account or many.

![OpenCode Go Dashboard](docs/screenshot1.jpg)
![OpenCode Go Dashboard](docs/screenshot2.jpg)

---

## Install on Cloudflare (step by step)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up), [Node.js](https://nodejs.org/) 20+, and about 10 minutes.

### 1. Clone and install

```bash
git clone https://github.com/hariana-dot/opencode-go-dashboard.git
cd opencode-go-dashboard
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

A browser window opens. Sign in and approve Wrangler.

### 3. Create the database

```bash
npx wrangler d1 create opencode-go-dashboard
```

Copy the `database_id` from the output. Open `wrangler.jsonc` and paste it here:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "opencode-go-dashboard",
    "database_id": "paste-your-id-here"
  }
]
```

(If you forked this repo, replace the existing id with **yours**. Do not reuse someone else’s.)

### 4. Set the dashboard password

This is the password you type on the login screen. It is stored as a Cloudflare secret, not in git.

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Type a strong password when prompted.

### 5. Create tables and deploy

```bash
npm run db:migrate:remote
npm run deploy
```

Wrangler prints a URL like `https://opencode-go-dashboard.<your-subdomain>.workers.dev`. Open it.

### 6. Sign in

Use the password from step 4.

### 7. Add your OpenCode Go account

You need two values from OpenCode. Neither is uploaded to GitHub.

**Workspace ID**

1. Open [opencode.ai](https://opencode.ai) and go to your workspace.
2. The URL contains `wrk_…` — that is the Workspace ID.

**Auth cookie**

1. Stay logged in at [opencode.ai](https://opencode.ai).
2. Open DevTools (F12) → **Application** (Chrome) or **Storage** (Firefox) → **Cookies** → `opencode.ai`.
3. Find the cookie named `auth`. Copy its value (it starts with `Fe26.`).

In the dashboard: **Add account** → display name, Workspace ID, Auth Cookie → Save → **Refresh**.

When the cookie expires, meters stop updating. Edit the account and paste a new cookie. You do not need to redeploy.

### Optional: deploy on every git push

In the Cloudflare dashboard, create a Workers project, connect this GitHub repo, set build command to `npm run deploy`, and add secret `ADMIN_PASSWORD`. Still use your own `database_id` in `wrangler.jsonc`.

### Optional: try it locally first

```bash
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD
npm run db:migrate:local
npm run preview                  # http://localhost:8787
```

---

## Privacy

This is **your** dashboard on **your** Cloudflare account.

- The login password lives as a Wrangler secret (`ADMIN_PASSWORD`). It is not in this repository.
- OpenCode auth cookies and workspace IDs live only in **your** D1 database. They are never written to git, never returned to the browser after save, and never sent to the project author.
- The public source code has no accounts, no cookies, and no passwords. What you type after you deploy stays on your Worker and your D1.
- Other people who fork the repo get empty storage. They cannot see your usage.

Use a password you do not reuse elsewhere. Treat the auth cookie like a session key: anyone who has it can read your OpenCode Go quota until it expires.

---

## Features

| | |
|---|---|
| **Official meters** | Rolling (5h), weekly, monthly % + time until reset |
| **Multi-account** | Add / edit / delete; refresh one or all |
| **Cost chart** | Daily spend by model, month picker, model filter (`big-pickle` always hidden) |
| **Projected usage** | Dotted marker = usage at reset from the last 7 days; remaining $ or cap date |
| **Reference model** | Any OpenCode Go model (defaults to latest GLM Flash) |
| **Live prices** | Daily snapshot from ocgo-pricing.all-the.rest |
| **11 languages** | EN, 简体, 繁體, 日本語, ES, DE, RU, FR, PT, TR, IT |
| **Theme** | Light, dark, or system |

**Projected usage:** fill = current monthly %. Max = that model’s dollar allowance. Dotted line = overall pool at reset if the 7-day request pace continues, priced at that model. Right label = dollars left, or cap date (`d/m`) if it would run out early.

---

## License

[MIT](LICENSE)

---

## 中文

致谢：额度来自 opencode.ai 控制台解析。面板基于 [Ruinique/opencode-go-dashboard](https://github.com/Ruinique/opencode-go-dashboard)。实时价格来自 [all-the-rest/ocgo-price-tracker](https://github.com/all-the-rest/ocgo-price-tracker)。

**部署：** `npx wrangler login` → `npx wrangler d1 create opencode-go-dashboard`（把 `database_id` 填进 `wrangler.jsonc`）→ `npx wrangler secret put ADMIN_PASSWORD` → `npm run db:migrate:remote` → `npm run deploy`。

**添加账号：** Workspace ID（URL 里的 `wrk_…`）+ Auth Cookie（opencode.ai → 开发者工具 → Cookies → `auth`，以 `Fe26.` 开头）。Cookie 只存在你自己的 D1，不会进 GitHub，也不会再回传给浏览器。
