<p align="center">
  <img src="public/assets/images/logo.svg" width="96" alt="Mobin Panel logo"/>
</p>

<h1 align="center">Mobin Panel</h1>

<p align="center">
  <b>A next-generation, open-source Cloudflare Worker configuration panel for VLESS, Trojan and Warp.</b>
</p>

<p align="center">
  <img alt="Bundle" src="https://img.shields.io/badge/bundle-~270%20KB-00e5ff"/>
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38b26"/>
  <img alt="Storage" src="https://img.shields.io/badge/storage-KV-7c3aed"/>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-9d00ff"/>
</p>

<p align="center"><b>Created by Mobin.A</b></p>

---

Mobin Panel is a single-file, self-contained Cloudflare Worker that acts as both a
**configuration panel** and a **live proxy**. You deploy it once, open the neon-glass
UI, tweak your VLESS / Trojan / WARP setup, and pull per-client subscription configs
(v2rayN, MahsaNG, Clash Meta, sing-box, Hiddify, Shadowrocket, WireGuard, Amnezia and
more) — all served from the same worker, with zero external dependencies.

> This project is an original implementation. It was *inspired by* the feature set of
> BPB-Worker-Panel, but contains **no copied code or design** from it.

## ✦ Features

- **Protocols** — VLESS + Trojan over WebSocket, TLS or plain, multi-port
  (443/8443/2053/2083/2087/2096 + 80/8080/8880/2052/2082/2086/2095), uTLS fingerprints,
  TCP Fast Open, Xray fragment presets, chain proxy (VLESS/Trojan/SS/SOCKS/HTTP).
- **WARP** — full WireGuard/WARP configs with deterministic reserved bytes,
  multi-endpoint selection, best-ping IP picking, auto-renewal cron, and **Warp-PRO
  noise** for MahsaNG, Clash/Amnezia and v2ray.
- **Smart DNS** — private dns-json DoH endpoint on the worker, per-panel upstream DoH,
  Local-DNS / Anti-Sanction-DNS / Fake-DNS modes, Clean IPs & Proxy IPs with NAT64
  synthesis, best-ping IP selection.
- **Routing** — one-click presets (bypass Iran/China/Russia, sanctions list, block
  Ads/Porn/QUIC/Malware/Phishing/Cryptominers) + fully custom domain/IP rules.
- **18 client exports** — v2rayN, v2rayNG, MahsaNG, Streisand, sing-box, husi,
  Clash Meta, Clash Verge, FLClash, Stash, Shadowrocket, PassWall, NekoBox, Hiddify,
  Karing, WireGuard, Amnezia VPN and WG Tunnel — each with QR, copy and download.
- **Security** — password-protected panel with signed HttpOnly session cookies,
  rate-limited auth & API endpoints, input sanitization everywhere, subscription-key
  gated configs.
- **Ops** — live dashboard (24h/total counters, quota bar), Telegram bot notifications
  (WARP renewal, panel events), one-click panel deletion, JSON import/export, remote
  config import by URL.

## ✦ Quick start

### 1. Deploy

```bash
git clone https://github.com/Pillow1243/Mobin-Panel.git
cd Mobin-Panel
npm install

# create the KV namespace and paste its id into wrangler.toml
npx wrangler kv:namespace create MOBIN_KV
#   → edit wrangler.toml: id = "<the id you just got>"

npx wrangler deploy
```

### 2. Open the panel

Visit `https://mobin-panel.<your-subdomain>.workers.dev` and set an admin password
(≥ 8 chars). That's it — the panel is live.

### 3. Subscribe

The **Subscriptions** page shows a ready-made URL + QR for every client, e.g.:

```
https://mobin-panel.<subdomain>.workers.dev/sub/v2rayn?t=<subscription-key>
```

### Local development (no Cloudflare account needed)

```bash
npm run build && npm run dev     # → http://localhost:8787
```

The dev server emulates the Workers `WebSocketPair`/`request.upgrade()` API and uses an
in-memory KV (resets on every start), so the *entire* panel — UI, API, subscriptions
and the live WS proxy — can be exercised locally.

## ✦ Repository layout

```
src/
  worker.ts               entrypoint (HTTP + WS upgrade interception)
  static.ts               inlined UI assets (~public/*)
  routes/
    api.ts                /api/*, subscription routes, private DoH
  services/
    kv.ts auth.ts rateLimit.ts telegram.ts
    dns.ts                DoH, NAT64, best-ping resolution
    proxy.ts              VLESS/Trojan WS proxy engine
    configGenerator.ts    18 client renderers (JSON/YAML/links/WG conf)
    warp.ts               WARP helpers (renewal, reserved bytes)
  utils/                  crypto, validation, WireGuard keys, logger, constants
  types/
public/                   neon-glassmorphism SPA (vanilla JS, no framework)
tests/                    vitest unit tests (config generator, DNS, auth, validation)
tools/local-dev.mjs       local dev server with a Workers WS shim
```

## ✦ Scripts

| Command                | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run build`        | Bundle everything (UI included) into `dist/worker.js` |
| `npm run dev`          | Run the built worker locally (in-memory KV)    |
| `npm test`             | Unit tests (vitest)                            |
| `npm run typecheck`    | `tsc --noEmit`                                 |
| `npm run deploy`       | Build + `wrangler deploy`                      |

## ✦ Documentation

- [Deployment guide](docs/DEPLOYMENT.md) — wrangler, custom domains, environments, secrets
- [Features & settings reference](docs/FEATURES.md) — every panel setting explained
- [API reference](docs/API.md) — all HTTP endpoints, auth model, subscription URL formats
- [Client configuration notes](docs/CLIENTS.md) — per-client minimum versions & quirks

## ✦ Requirements & limits

- One KV namespace (all panel state fits in a few KB).
- VLESS/Trojan proxy traffic goes through the worker (`fetch` out): fine for personal
  use (~100K requests/day on a free plan); WARP/WireGuard traffic does **not** —
  clients connect straight to the WARP endpoint.
- WebSocket proxying is HTTP-over-WS (tunnelled requests), matching the reference
  panel's model.

## ✦ Security notes

- The admin password is stored as a SHA-256 hash; sessions are HMAC-signed and
  delivered via `HttpOnly; SameSite=Lax` cookies.
- Auth endpoints are rate-limited per IP; all client input is coerced/sanitized
  (`src/utils/validate.ts`) before it ever touches KV.
- Subscription endpoints accept the panel session **or** the subscription key
  (`?t=` / path-embedded); there is no other access path.

## ✦ License

MIT — see [LICENSE](LICENSE).

**Created by Mobin.A**

---

<p align="center">
  <b>پنل مبین</b> — یک پنل کامل و سبک برای مدیریت VLESS / Trojan / Warp روی
  Cloudflare Workers؛ ساخته‌شده با ❤️ توسط <b>Mobin.A</b>
</p>
