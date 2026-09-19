# Mobin Panel — API Reference

_Created by Mobin.A_

All endpoints live on the worker origin. JSON in, JSON out. The admin session is a
**signed, HttpOnly, SameSite=Lax cookie** (`mobin_session`).

Rate limits (per IP, sliding 60 s unless noted): `init` 10/min, `login` 10/min,
`reset` 5/min, `delete` 2/min, `import` 10/min, `warp renew` 5/5 min, DoH 30/10 s.
Exceeding them returns `429`.

## Auth

| Method & path | Body | Returns |
| ------------- | ---- | ------- |
| `GET /api/auth/status` | – | `{ initialized, authenticated, version }` (public) |
| `POST /api/auth/init` | `{ password }` | `{ ok }` — sets the admin password (only before initialization; `409` after). Sets the session cookie. |
| `POST /api/auth/login` | `{ password }` | `{ ok }` + cookie, or `{ error: "wrong password" }` 401 |
| `POST /api/auth/logout` | – | `{ ok }` — clears the cookie |
| `POST /api/auth/reset` | `{ currentPassword, newPassword }` | `{ ok }` |

Session cookie format: `mobin_session=<expiryMs>.<HMAC-SHA256(secret, expiryMs)>`.
The secret rotates on init/reset; all other endpoints require
`initialized && authenticated` (else `401 {"error":"unauthorized"}`).

## Settings

| Method & path | Body | Returns |
| ------------- | ---- | ------- |
| `GET /api/settings` | – | full sanitized settings object (incl. `uuid`, `trojanPassword`, `subscriptionKey`, `wg` keypair) |
| `POST /api/settings` | any **partial** settings object | the stored settings after merge+sanitize. Every field is validated (URLs, domains with TLD check, port ranges, enums, list caps). |

Body limit: 512 KB (`413` over). Invalid JSON → `400`.

## Panel management

| Method & path | Body | Returns |
| ------------- | ---- | ------- |
| `GET /api/dashboard` | – | `{ totalRequests, requestsLast24h, dailyQuota, usagePct, version, panelUrl, telegramConfigured, initialized, panelName }` |
| `POST /api/import` | `{ url }` **or** `{ json }` | `{ ok, imported }` — remote fetch (15 s timeout) or direct JSON; link-list payloads are stored as external subscriptions (`{ ok, importedAs: "externalSubscriptions" }`). |
| `POST /api/update` | – | `{ current, latest, upToDate, message }` (GitHub releases API, 10 s timeout) |
| `POST /api/warp/renew` | – | `{ ok, message }` — re-registers the stored WireGuard keypair with WARP. |
| `POST /api/panel/delete` | `{ password }` | `{ ok, message }` — deletes all `mp:*` KV keys. |

## Configs

| Method & path | Returns |
| ------------- | ------- |
| `GET /api/configs/{client}` | rendered config for that client (`application/json`, `text/yaml` or `text/plain` links, depending on the client). `404` for unknown client ids. |

Client ids: `v2rayn, v2rayng, mahsa, streisand, singbox, husi, clashmeta, clashverge,
flclash, stash, shadowrocket, passwall, nekobox, hiddify, karing, wireguard,
amnezia, wgtunnel`.

## Subscriptions (client-facing)

Base path configurable (`subscriptionPath`, default `/sub`):

| URL | Notes |
| --- | ----- |
| `{base}/{client}?t={key}` | panel-generated form |
| `{base}/{key}/{client}` | key in the path (many tools build this) |
| `{base}?t={key}` | plain link bundle (all share links + WARP `wg://` link) |

Auth: session cookie **or** subscription key (constant-time compare).
Errors: `403` (bad key), `404` (unknown client). Pulls are counted in the dashboard.

## Private DoH

| Method & path | Notes |
| ------------- | ----- |
| `GET /doh?name=example.com&type=A` | dns-json (RFC 8484). Answered via the panel's upstream DoH (`remoteDns`). `POST` with JSON `{ name }` also works. |

Rate limit 30/10 s per IP → dns-json `Status: 2` on violation.
Rendered configs point clients at this endpoint (per-client URL in the DoH page).

## Proxy (WebSocket)

| URL | Auth |
| --- | ---- |
| `ws(s)://host/vless?uuid={UUID}` | VLESS share-link style; the secret is the panel UUID. Also accepts `/vless/{secret}` path form and `Proxy-Authorization: Bearer {UUID}` fallback. |
| `ws(s)://host/trojan?pass={password}` | same, with the Trojan password. |

Handshake:

1. Worker verifies the secret exists → opens the WS (`101`), else `407`.
2. Client tunnels raw HTTP/1.1 requests as WS frames (Xray `ws`+`http` transport
   convention): first message = request head (+ body frames if `Content-Length`).
3. Worker resolves the target (Clean IPs → upstream DoH → best-ping), optionally
   applies proxy-IP/NAT64 + upstream/chain proxy, fetches it, and streams the
   response back as frames (head frame + body frames).
4. Explicit wrong secret in the URL → immediate in-stream `407` + close;
   header-only auth gets one try per request (some clients rotate per request).

Blocked domains (panel routing blocks) answer `403`; unsupported methods `405`.

## Errors

| Code | Meaning |
| ---- | ------- |
| 400  | bad body / bad request |
| 401  | not authenticated |
| 403  | forbidden (bad subscription key, blocked domain) |
| 404  | unknown client / not found |
| 407  | proxy authentication required |
| 409  | panel already initialized |
| 413  | payload too large (> 512 KB API, > 1 MB request head, > 16 MB WS body) |
| 426  | websocket upgrade required |
| 429  | rate limited |
| 500/502 | worker error / upstream failure (details never leaked) |
