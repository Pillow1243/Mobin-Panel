# Mobin Panel — Features & Settings Reference

_Created by Mobin.A_

This document explains every setting in the panel, grouped by UI page.

## Dashboard

| Item | Description |
| ---- | ----------- |
| Request counters | 24h + all-time proxied request count (10-minute buckets in KV, pruned after 48h). |
| Usage bar | 24h count vs. daily quota (default 100,000). |
| Update check | Compares the worker version with the latest GitHub release. |
| Reset password | Rotates the admin password (verified with the current one). |
| Delete panel | Wipes all panel state from KV (password-verified). |
| Endpoints card | Copy-ready URLs: UI, API, private DoH, subscription base. |

## Proxy (general)

| Setting | Description |
| ------- | ----------- |
| Panel name | Cosmetic; used in generated config names. |
| Local DNS | Default mode: domains resolved locally on the client, panel only proxies. |
| Anti-Sanction DNS | Route the panel's own resolution through a non-Iranian DoH. |
| Fake DNS (fake-IP) | Generate fake-IP configs (sing-box fakeip, v2ray fake-dns) so the client never leaks real DNS. |
| IPv6 | Allow AAAA results and `ipv4_and_ipv6` DNS strategy. |
| Allow LAN | Expose the proxy to your LAN (mihomo `allow-lan`). |
| Log level | `disabled / warning / error / info / debug` (worker logs). |
| Custom domain | The domain clients should use (SNI/Host) instead of the worker hostname. |
| Upstream DoH | The dns-json endpoint the panel queries to resolve target domains. |
| Fallback domain | Optional domain tried when the primary resolution fails. |
| Subscription path | Base path for subscription endpoints (default `/sub`). |

## VLESS / Trojan

| Setting | Description |
| ------- | ----------- |
| Protocol | `both / vless / trojan` — which listeners accept connections. |
| UUID / Trojan password | The secret embedded in share links; verified on every WS session. Regenerate buttons included. |
| Remote DNS | DoH used for target-domain resolution inside the proxy. |
| Upstream TCP proxy | A plain proxy URL (`http(s)://`, `socks5://`, `ss://`) the panel routes its outbound through. |
| Chain proxy | Chain through another VLESS/Trojan/SS/SOCKS/HTTP endpoint (full URL with credentials). |
| Clean IPs | `domain → ip list` entries used verbatim (skip DNS) for those domains. |
| TLS / non-TLS ports | Multiple listening ports per protocol (see the README port list). |
| Fingerprint | uTLS fingerprint for TLS sessions (`chrome`, `firefox`, `ios`, …). |
| Best-ping interval | Milliseconds for the parallel latency probe between candidate IPs. |
| TCP Fast Open | Add `tfo=1` to share links. |

## Proxy IP

| Setting | Description |
| ------- | ----------- |
| Mode | `none` (direct), `proxy` (use the proxy-IP list), `nat64` (synthesize IPv6 from IPv4 under your prefix). |
| Proxy IPs | `domain → ip list` applied to outbound connections. |
| NAT64 prefixes | IPv6 prefixes (`64:ff9b::`, `2001:db8::`, …) used by NAT64 mode. |

## ECH

Enables Encrypted Client Hello: links carry `ech=<server-name>` and SNI is set to
the ECH server name while Host stays the real one.

## Custom CDN

Route client connections through a Cloudflare (or other) CDN hostname:
`cdnHost` becomes the connect address, `customDomain` is preserved as Host/SNI.
Useful for hiding the worker hostname or for CDN-level filtering bypass.

## Fragment (Xray)

Presets (`low / medium / high / severe`) or custom values. Rendered into share
links as `fragment=pktM<maxSplit><packets>:<length>:<delay>` and into v2rayN JSON
`ws-opts.fragment`.

## External raw configs

Paste raw share links (vless/trojan/ss/wg/socks/http/amnezia URLs) or full
config text. They are appended to link bundles and converted into v2rayN/sing-box
outbounds where the format supports it (proxy aggregation).

## Warp

| Setting | Description |
| ------- | ----------- |
| Remote DNS | DoH for WARP configs (`DNS =` line). |
| Endpoints | WARP endpoints (IPv6 `2606:4700:4700::1111` etc.). Best-ping picks at render time. |
| Reserved bytes | 0–48 hex chars, deterministically derived from the WireGuard private key. |
| Auto renew | Enables the daily cron renewal (+ optional Telegram notice). |
| Renew now | Manual WARP re-registration (rate-limited to 5/5 min). |

### Warp-PRO noise

- **MahsaNG noise** — `mode/packets/count/size/delay` written for the MahsaNG client.
- **Clash/Amnezia noise** — `count`/`size` for Clash Meta / Amnezia / FLClash exports.
- **v2ray noise** — a list of noise blocks (each with its own mode/packets/count/size/delay) merged into v2rayN/v2rayNG configs.

## Routing

One-click toggles map to domain/IP rule lists:

- **Bypass** (DIRECT): Iran, China, Russia region presets + a sanctions-bypass list.
- **Block** (REJECT): Ads, Porn, QUIC, Malware, Phishing, Cryptominers presets.
- **Custom**: your own bypass/block domains and IP-CIDRs (bypass IPs use `no-resrule`
  semantics; a bare IP becomes `/32`).

Every mihomo export always ends with `GEOIP,LAN,DIRECT` + `MATCH,PROXY`.

## Import / Export

- **Share JSON** — full settings JSON (includes secrets; treat it as sensitive).
- **Download / upload JSON** — file round-trip of the same document.
- **Remote import by URL** — `https://` URL containing either a settings JSON or a
  raw link list (stored as external subscriptions).

## Telegram

Set bot token + your user id. Events (WARP renewal results, panel lifecycle) are
pushed to your chat. *Test* sends a ping message; *Remove* clears the config.

## Subscriptions

One card per client (18 total) with:

- subscription URL (`{origin}{subpath}/{client}?t={key}`),
- QR code,
- copy, download (file named `mobin-{client}.{ext}`),
- big-QR modal.

Accepted URL shapes:

```
{subpath}/{client}?t={key}      (panel-generated)
{subpath}/{key}/{client}        (key embedded in the path)
{subpath}?t={key}               (plain link bundle incl. the WARP link)
```

Both the admin session cookie **and** the subscription key grant access;
anything else gets `403`.
