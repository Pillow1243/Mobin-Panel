# Mobin Panel — Deployment Guide

_Created by Mobin.A_

## 1. Prerequisites

- A Cloudflare account (free plan is enough).
- Node.js ≥ 20 for the build.
- A GitHub repository (optional, for the deploy action).

## 2. Create the KV namespace

The panel stores **all** of its state (settings, password hash, session secret,
stats, Telegram config, WireGuard keypair) in one KV namespace:

```bash
npx wrangler kv:namespace create MOBIN_KV
# ▸ Success! Your KV Namespace id is: 9f3c…b1
```

Paste the id into `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "MOBIN_KV", id = "9f3c…b1" }
]
```

> The binding name must stay `MOBIN_KV`.

## 3. Deploy

```bash
npm install
npm run build        # → dist/worker.js (single file, ~270 KB minified)
npx wrangler deploy
```

You now have a live panel at `https://mobin-panel.<your-subdomain>.workers.dev`
(`workers_dev = true` in `wrangler.toml`).

First visit shows the **setup screen** — choose an admin password (≥ 8 chars).
Everything else is configured from the UI.

## 4. Custom domain (recommended)

1. In the Cloudflare dashboard, add your domain (e.g. `mobin.example.com`) as a zone.
2. Uncomment the routes block in `wrangler.toml`:

```toml
[routes]
route = "mobin.example.com/*"
zone_name = "example.com"
```

3. `npx wrangler deploy` — Cloudflare provisions the route automatically.

Generated subscription links and configs use the request's `Host` header, so they
automatically point at your custom domain once traffic flows through it.

## 5. Environments (staging / production)

`wrangler.toml` already supports `--env`:

```bash
npm run deploy          # default environment
npm run deploy:prod     # production environment
```

Define environments in `wrangler.toml` if needed:

```toml
[env.production]
kv_namespaces = [{ binding = "MOBIN_KV", id = "<prod-kv-id>" }]
[env.production.triggers]
crons = ["0 6 * * *"]
```

## 6. Automatic WARP renewal (cron)

`wrangler.toml` ships a daily cron (`0 6 * * *`). The `scheduled` handler only
does work when **Warp → Auto renew** is enabled in the panel; otherwise it is a
no-op. It re-registers the stored WireGuard keypair with WARP and can notify
you via Telegram.

## 7. GitHub Actions deploy (optional)

`.github/workflows/deploy.yml` runs `typecheck → test → build` on every push/PR
and deploys when you push to `main`, using repository secrets:

| Secret       | What it is                                    |
| ------------ | --------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | A token with `Worker Routes: Edit` + `Workers KV: Edit` |
| `CLOUDFLARE_ACCOUNT_ID`| Your Cloudflare account id                    |
| `MOBIN_KV_ID`  | The KV namespace id (or create it in the workflow) |

## 8. Upgrading

1. `git pull` the new version.
2. `npm ci && npm run build && npx wrangler deploy`.

Settings are merged over factory defaults on every load (`loadSettings`), so new
fields gain sane defaults automatically and nothing user-configured is lost.
The dashboard's **check for updates** button compares the worker version with the
latest GitHub release.

## 9. Uninstalling

- **From the panel**: Dashboard → *Delete panel* (verifies your password, wipes
  all panel keys from KV).
- **From wrangler**: `npx wrangler deployments` → delete, then
  `npx wrangler kv:namespace delete <id>` and remove the route.

## 10. Local development

```bash
npm run build && npm run dev
```

Runs the real production bundle on `http://localhost:8787` with an in-memory KV
(resets on restart). The dev harness (`tools/local-dev.mjs`) emulates the Workers
`WebSocketPair` / `request.upgrade()` API with a minimal RFC-6455 implementation,
so the VLESS/Trojan proxy itself can be tested locally:

```bash
# in another shell
npm test        # unit tests
# WS smoke test (after panel init):
websocat "ws://localhost:8787/vless?uuid=<UUID>"
```
