/**
 * Mobin Panel — configuration generator
 * Created by Mobin.A
 *
 * Turns the panel settings into client-ready configurations for every
 * supported client (share links, v2rayN JSON, Mihomo/Clash YAML, sing-box
 * JSON, Hiddify JSON, WireGuard/Amnezia confs) and merges any external
 * raw configs the user added (proxy aggregation).
 */
import type { Settings } from '../types';
import {
  BLOCK_PRESETS,
  FRAGMENT_PRESETS,
  PANEL_VERSION,
  REGION_PRESETS,
  WARP_PORT,
  type ClientDef,
  CLIENTS,
} from '../utils/constants';
import { sha256Hex } from '../utils/crypto';
import type { StoredWg } from './kv';

/* -------------------------------------------------------------------------- */
/*  Shared context                                                             */
/* -------------------------------------------------------------------------- */

export interface Ctx {
  s: Settings;
  /** Public host of the worker (e.g. panel.example.com). */
  host: string;
  /** Private DoH URL served by the worker. */
  dohUrl: string;
  /** WireGuard keypair used for WARP configs. */
  wg: StoredWg;
}

/** One generated VLESS/Trojan server entry. */
export interface ProxyEntry {
  name: string;
  protocol: 'vless' | 'trojan';
  port: number;
  tls: boolean;
}

/** A proxy address the panel connects to (used for ECH/CDN overrides). */
interface ServerAddr {
  host: string;
  hostHeader: string;
  sni: string;
}

/** Build the list of proxy entries from settings. */
export function buildProxyList(s: Settings): ProxyEntry[] {
  const out: ProxyEntry[] = [];
  const push = (protocol: 'vless' | 'trojan') => {
    if (s.protocol !== 'both' && s.protocol !== protocol) return;
    for (const port of s.tlsPorts) {
      out.push({
        name: `${s.panelName} ${protocol.toUpperCase()} TLS ${port}`,
        protocol,
        port,
        tls: true,
      });
    }
    for (const port of s.nonTlsPorts) {
      out.push({
        name: `${s.panelName} ${protocol.toUpperCase()} ${port}`,
        protocol,
        port,
        tls: false,
      });
    }
  };
  push('vless');
  push('trojan');
  return out;
}

/** Effective connection address (Custom CDN takes priority over worker host). */
function serverAddr(s: Settings, ctxHost: string): ServerAddr {
  if (s.cdnEnabled && s.cdnHost) {
    return {
      host: s.cdnHost,
      hostHeader: s.customDomain || ctxHost,
      sni: s.cdnSni || s.customDomain || ctxHost,
    };
  }
  if (s.echEnabled && s.echServerName) {
    return { host: ctxHost, hostHeader: ctxHost, sni: s.echServerName };
  }
  return { host: s.customDomain || ctxHost, hostHeader: ctxHost, sni: ctxHost };
}

/** Xray fragment parameter for share links (empty string when disabled). */
export function fragmentParam(s: Settings): string {
  if (!s.fragmentEnabled || s.fragmentMode === 'off') return '';
  let maxSplit = s.fragmentMaxSplit;
  let length = s.fragmentLength;
  let delay = s.fragmentDelay;
  if (s.fragmentMode !== 'custom') {
    const p = FRAGMENT_PRESETS[s.fragmentMode] ?? FRAGMENT_PRESETS.low;
    maxSplit = maxSplit || p.maxSplit;
    length = length || p.length;
    delay = delay || p.delay;
  }
  maxSplit = maxSplit || '3';
  return `pktM${maxSplit}${s.fragmentPackets}:${length || '100-200'}:${delay || '0-10'}`;
}

const enc = encodeURIComponent;

/* -------------------------------------------------------------------------- */
/*  Share links (Shadowrocket, NekoBox, Karing, husi, Streisand, PassWall…)    */
/* -------------------------------------------------------------------------- */

export function vlessLink(e: ProxyEntry, s: Settings, ctxHost: string): string {
  const a = serverAddr(s, ctxHost);
  const q: string[] = [
    'encryption=none',
    `security=${e.tls ? 'tls' : 'none'}`,
  ];
  if (e.tls) {
    if (s.echEnabled && s.echServerName) q.push(`ech=${enc(s.echServerName)}`);
  }
  q.push(`type=ws`, 'headerType=none');
  if (e.tls) q.push(`fingerprint=${s.fingerprint}`);
  // The WS upgrade carries the secret in the query — clients keep the
  // uuid only inside the vless:// URI, so it must be echoed explicitly.
  q.push(`path=${enc('/vless')}`, `host=${enc(a.hostHeader)}`, `uuid=${enc(s.uuid)}`);
  if (e.tls) q.push(`sni=${enc(a.sni)}`, 'allowInsecure=0');
  if (s.tcpFastOpen) q.push('tfo=1');
  const frag = fragmentParam(s);
  if (frag) q.push(`fragment=${enc(frag)}`);
  return `vless://${s.uuid}@${a.host}:${e.port}?${q.join('&')}#${enc(e.name)}`;
}

export function trojanLink(e: ProxyEntry, s: Settings, ctxHost: string): string {
  const a = serverAddr(s, ctxHost);
  const q: string[] = ['type=ws', 'headerType=none'];
  if (e.tls) q.push('security=tls');
  // Same as VLESS: echo the password into the upgrade URL for auth.
  q.push(`path=${enc('/trojan')}`, `host=${enc(a.hostHeader)}`, `pass=${enc(s.trojanPassword)}`);
  if (e.tls) q.push(`sni=${enc(a.sni)}`);
  if (s.tcpFastOpen) q.push('tfo=1');
  const frag = fragmentParam(s);
  if (frag) q.push(`fragment=${enc(frag)}`);
  return `trojan://${enc(s.trojanPassword)}@${a.host}:${e.port}?${q.join('&')}#${enc(e.name)}`;
}

/* ----------------------------- WireGuard (WARP) --------------------------- */

/**
 * Deterministic WARP "reserved bytes" (max 48 hex chars = 24 bytes),
 * derived from the WireGuard private key so configs stay stable.
 */
export async function warpReserved(s: Settings, wg: StoredWg): Promise<string> {
  const n = Math.max(0, Math.min(48, parseInt(s.warpReservedBytes, 10) || 0));
  if (n === 0) return '';
  const even = n % 2 === 0 ? n : n + 1;
  return (await sha256Hex(wg.privateKey)).slice(0, Math.min(even, 48));
}

/** Standard WARP WireGuard configuration text. */
export async function buildWgConf(
  s: Settings,
  wg: StoredWg,
  opts: { name?: string; amnezia?: boolean; noise?: Record<string, string> } = {},
): Promise<string> {
  const endpoint = s.warpEndpoints[0] || '2606:4700:4700::1111';
  const endpointUrl = endpoint.includes(':') && !endpoint.includes(':51820')
    ? `[${endpoint}]:${WARP_PORT}`
    : endpoint.includes(':')
      ? endpoint
      : `${endpoint}:${WARP_PORT}`;
  // DNS: WARP's own resolver + the configured remote DoH (best effort IP).
  const dns: string[] = ['104.16.132.138'];
  try {
    const h = new URL(s.warpRemoteDns).hostname;
    if (h.includes('.')) dns.push(h);
  } catch {
    /* keep defaults */
  }
  const reserved = await warpReserved(s, wg);
  const lines: string[] = [
    `# ${opts.name || 'Mobin WARP'} — generated by Mobin Panel v${PANEL_VERSION}`,
    '# Created by Mobin.A',
    '[Interface]',
    `PrivateKey = ${wg.privateKey}`,
    'Address = 172.16.0.2/32',
    `DNS = ${dns.join(', ')}`,
    'MTU = 1280',
  ];
  if (reserved) lines.push(`Reserved = ${reserved}`);
  if (opts.amnezia) lines.push('AmneziaWG = true');
  if (opts.noise) {
    lines.push('# [MobinWarp noise]');
    for (const [k, v] of Object.entries(opts.noise)) lines.push(`# noise-${k}: ${v}`);
  }
  lines.push(
    '',
    '[Peer]',
    `PublicKey = ${wg.publicKey}`,
    `Endpoint = ${endpointUrl}`,
    'AllowedIPs = 0.0.0.0/0, ::/0',
    'PersistentKeepalive = 25',
    'Keepalive = 25',
  );
  return lines.join('\n');
}

/** MahsaNG noise section for WARP (values read by MahsaNG tooling). */
function mahsaNoise(s: Settings): Record<string, string> {
  const n = s.warpPro.mahsaNoise;
  return {
    mode: n.enabled ? n.mode : 'off',
    packets: n.packets,
    count: String(n.count),
    size: String(n.size),
    delay: String(n.delay),
  };
}

function clashNoise(s: Settings): Record<string, string> {
  const n = s.warpPro.clashNoise;
  return { count: String(n.count), size: String(n.size) };
}

function v2rayNoiseBlock(s: Settings): string {
  return s.warpPro.v2rayNoise
    .filter((n) => n.enabled)
    .map(
      (n) =>
        `# v2ray noise: mode=${n.mode} packets=${n.packets} count=${n.count} size=${n.size} delay=${n.delay}`,
    )
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/*  v2rayN-compatible JSON (v2rayN, v2rayNG, Stash)                            */
/* -------------------------------------------------------------------------- */

interface V2RayNProxy {
  [k: string]: unknown;
}

function v2rayNEntry(e: ProxyEntry, s: Settings, a: ServerAddr, chainTag?: string): V2RayNProxy {
  const base: V2RayNProxy = {
    name: e.name,
    server: a.host,
    port: e.port,
    network: 'ws',
    security: 'auto',
    udp: true,
    'ws-opts': {
      path: e.protocol === 'vless' ? '/vless' : '/trojan',
      headers: { Host: a.hostHeader },
    },
  };
  if (e.tls) {
    base.tls = 'tls';
    base.skipCertVerify = false;
    base['ws-opts'] = {
      ...(base['ws-opts'] as object),
      fragment: fragmentParam(s)
        ? { packets: s.fragmentPackets, length: s.fragmentLength || '100-200', probability: 0, delay: 0 }
        : undefined,
    };
  }
  if (e.protocol === 'vless') {
    base.type = 'vless';
    base.uuid = s.uuid;
    base.alterId = 0;
    base.flow = '';
    if (e.tls) base.fingerprint = s.fingerprint;
  } else {
    base.type = 'trojan';
    base.password = s.trojanPassword;
  }
  if (s.tcpFastOpen) base.tfo = true;
  if (chainTag) base.out = chainTag;
  return base;
}

/** Parse a chain proxy URL into a v2rayN-style entry. */
export function chainEntryFromUrl(url: string): V2RayNProxy | null {
  const p = parseProxyUrl(url);
  if (!p) return null;
  const name = `${p.host}:${p.port} (chain)`;
  const base: V2RayNProxy = { name, server: p.host, port: p.port, network: 'tcp', udp: true, tag: 'out-chain' };
  if (p.scheme === 'http' || p.scheme === 'https') {
    base.type = 'http';
    if (p.user) {
      base.username = p.user;
      base.password = p.pass;
    }
  } else if (p.scheme === 'socks5' || p.scheme === 'socks') {
    base.type = 'ss' /* v2rayN has no socks type; use trojan? */;
    base.type = 'ss';
    delete (base as Record<string, unknown>).network;
    (base as Record<string, unknown>).method = 'none';
    (base as Record<string, unknown>).password = p.pass || '';
    (base as Record<string, unknown>).isSocks = true;
  } else if (p.scheme === 'vless') {
    base.type = 'vless';
    base.uuid = p.user || '';
    base.network = p.params.type || 'ws';
    base.tls = p.params.security === 'tls' ? 'tls' : '';
    base.flow = p.params.flow || '';
    if (p.params.path) {
      base['ws-opts'] = { path: p.params.path };
      if (p.params.host) (base['ws-opts'] as Record<string, unknown>).headers = { Host: p.params.host };
    }
    if (p.params.fingerprint) base.fingerprint = p.params.fingerprint;
  } else if (p.scheme === 'trojan') {
    base.type = 'trojan';
    base.password = p.user || '';
    base.network = p.params.type || 'ws';
    base.tls = p.params.security === 'tls' ? 'tls' : '';
    if (p.params.path) {
      base['ws-opts'] = { path: p.params.path };
      if (p.params.host) (base['ws-opts'] as Record<string, unknown>).headers = { Host: p.params.host };
    }
  } else if (p.scheme === 'ss') {
    base.type = 'ss';
    base.password = p.pass || '';
    base.method = p.params.method || 'chacha20-ietf-poly1305';
    base.network = 'tcp';
  } else {
    return null;
  }
  return base;
}

/** Parse vless:// trojan:// share links (for proxy aggregation). */
export interface ParsedProxyUrl {
  scheme: string;
  user: string;
  pass: string;
  host: string;
  port: number;
  params: Record<string, string>;
}

export function parseProxyUrl(url: string): ParsedProxyUrl | null {
  const m = /^(vless|trojan|ss|socks5|socks|http|https):\/\/(?:([^:@/]*)(?::([^@/]*))?@)?([a-z0-9.-]+):?(\d+)?([/?#].*)?$/i.exec(
    url.trim(),
  );
  if (!m) return null;
  const [, scheme, user, pass, host, port, tail] = m;
  const params: Record<string, string> = {};
  if (tail) {
    const qIdx = tail.indexOf('?');
    if (qIdx >= 0) {
      for (const kv of tail.slice(qIdx + 1).split('&')) {
        const [k, v] = kv.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }
  }
  return {
    scheme: scheme.toLowerCase(),
    user: user ? decodeURIComponent(user) : '',
    pass: pass ? decodeURIComponent(pass) : '',
    host: host.toLowerCase(),
    port: port ? parseInt(port, 10) : 443,
    params,
  };
}

/** Convert one external share link into a v2rayN entry (or null). */
function externalLinkToV2RayN(line: string): V2RayNProxy | null {
  const p = parseProxyUrl(line);
  if (!p) return null;
  if (p.scheme === 'vless') {
    return {
      name: `${p.host}:${p.port} (ext vless)`,
      type: 'vless',
      server: p.host,
      port: p.port,
      uuid: p.user,
      alterId: 0,
      network: p.params.type || 'ws',
      tls: p.params.security === 'tls' ? 'tls' : '',
      flow: p.params.flow || '',
      udp: true,
      'ws-opts': p.params.path
        ? {
            path: p.params.path,
            headers: p.params.host ? { Host: p.params.host } : undefined,
          }
        : undefined,
      fingerprint: p.params.fingerprint || 'chrome',
    };
  }
  if (p.scheme === 'trojan') {
    return {
      name: `${p.host}:${p.port} (ext trojan)`,
      type: 'trojan',
      server: p.host,
      port: p.port,
      password: p.user,
      network: p.params.type || 'ws',
      tls: p.params.security === 'tls' ? 'tls' : '',
      udp: true,
      'ws-opts': p.params.path
        ? {
            path: p.params.path,
            headers: p.params.host ? { Host: p.params.host } : undefined,
          }
        : undefined,
    };
  }
  if (p.scheme === 'ss') {
    return {
      name: `${p.host}:${p.port} (ext ss)`,
      type: 'ss',
      server: p.host,
      port: p.port,
      method: p.params.method || 'chacha20-ietf-poly1305',
      password: p.pass,
      network: 'tcp',
      udp: true,
    };
  }
  return null;
}

export async function renderV2RayNJson(ctx: Ctx): Promise<string> {
  const { s, host } = ctx;
  const a = serverAddr(s, host);
  const chain = s.chainProxy ? chainEntryFromUrl(s.chainProxy) : null;
  const chainTag = chain ? 'out-chain' : undefined;
  const list: V2RayNProxy[] = buildProxyList(s).map((e) => v2rayNEntry(e, s, a, chainTag));
  if (chain) list.push(chain);
  // Proxy aggregation: merge external single configs.
  for (const line of externalLines(s.externalSingle)) {
    const entry = externalLinkToV2RayN(line);
    if (entry) list.push(entry);
  }
  return JSON.stringify(list, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Share links bundle                                                          */
/* -------------------------------------------------------------------------- */

function externalLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export async function renderLinks(ctx: Ctx): Promise<string> {
  const { s, host } = ctx;
  const out: string[] = [];
  for (const e of buildProxyList(s)) {
    out.push(e.protocol === 'vless' ? vlessLink(e, s, host) : trojanLink(e, s, host));
  }
  // External single configs (raw links) — proxy aggregation.
  for (const line of externalLines(s.externalSingle)) out.push(line);
  // WARP config as a wg:// base64 link for clients that accept it.
  const wg = await buildWgConf(s, ctx.wg, {
    name: `${s.panelName} WARP`,
    noise: mahsaNoise(s),
  });
  const b64 = btoa(unescape(encodeURIComponent(wg)));
  out.push(`wg://${b64}#${enc(`${s.panelName} WARP`)}`);
  return out.join('\n');
}

/* -------------------------------------------------------------------------- */
/*  Mihomo / Clash Meta YAML                                                   */
/* -------------------------------------------------------------------------- */

function yamlStr(v: string): string {
  // Always double-quote strings → safe YAML.
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlIndent(obj: unknown, level: number): string {
  const pad = '  '.repeat(level);
  if (obj === null || obj === undefined) return `${pad}null\n`;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return typeof obj === 'string' ? `${pad}${yamlStr(obj)}\n` : `${pad}${obj}\n`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]\n`;
    return obj.map((x) => (typeof x === 'object' && x !== null ? yamlItem(x, level) : `${pad}- ${typeof x === 'string' ? yamlStr(x) : x}\n`)).join('');
  }
  const entries = Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return `${pad}{}\n`;
  return entries
    .map(([k, v]) => {
      if (v === null) return `${pad}${k}: null\n`;
      if (typeof v === 'object') {
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${k}: []\n`;
          return `${pad}${k}:\n` + (v as unknown[]).map((x) => (typeof x === 'object' && x !== null ? yamlItem(x as Record<string, unknown>, level + 1) : `${'  '.repeat(level + 1)}- ${typeof x === 'string' ? yamlStr(x) : x}\n`)).join('');
        }
        const inner = yamlIndent(v, level + 1);
        return `${pad}${k}:\n${inner}`;
      }
      return `${pad}${k}: ${typeof v === 'string' ? yamlStr(v) : v}\n`;
    })
    .join('');
}

function yamlItem(obj: Record<string, unknown>, level: number): string {
  const pad = '  '.repeat(level);
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  const first = entries.shift();
  let out = '';
  if (first) {
    const [k, v] = first;
    if (v === null) out += `${pad}- ${k}: null\n`;
    else if (typeof v === 'object') out += `${pad}- ${k}:\n` + (Array.isArray(v) ? (v as unknown[]).map((x) => (typeof x === 'object' && x !== null ? yamlItem(x as Record<string, unknown>, level + 2) : `${'  '.repeat(level + 2)}- ${typeof x === 'string' ? yamlStr(x) : x}\n`)).join('') : yamlIndent(v, level + 1));
    else out += `${pad}- ${k}: ${typeof v === 'string' ? yamlStr(v) : v}\n`;
  }
  for (const [k, v] of entries) {
    if (v === null) out += `${pad}  ${k}: null\n`;
    else if (typeof v === 'object') out += `${pad}  ${k}:\n` + (Array.isArray(v) ? (v as unknown[]).map((x) => (typeof x === 'object' && x !== null ? yamlItem(x as Record<string, unknown>, level + 2) : `${'  '.repeat(level + 2)}- ${typeof x === 'string' ? yamlStr(x) : x}\n`)).join('') : yamlIndent(v, level + 1));
    else out += `${pad}  ${k}: ${typeof v === 'string' ? yamlStr(v) : v}\n`;
  }
  return out;
}

/** Mihomo proxy object for one entry. */
function mihomoProxy(e: ProxyEntry, s: Settings, a: ServerAddr, out?: string): Record<string, unknown> {
  const p: Record<string, unknown> = {
    name: e.name,
    server: a.host,
    port: e.port,
    udp: !s.routing.blockQuic,
    network: 'ws',
  };
  if (e.protocol === 'vless') {
    p.type = 'vless';
    p.uuid = s.uuid;
  } else {
    p.type = 'trojan';
    p.password = s.trojanPassword;
  }
  p['ws-opts'] = {
    path: e.protocol === 'vless' ? '/vless' : '/trojan',
    headers: { Host: a.hostHeader },
  };
  if (e.tls) {
    p.tls = true;
    p['servername'] = a.sni;
    if (s.fingerprint) p.fingerprint = s.fingerprint;
    if (s.echEnabled && s.echServerName) p['ech-server-name'] = s.echServerName;
  }
  if (out) p.out = out;
  return p;
}

function chainMihomo(url: string): Record<string, unknown> | null {
  const p = parseProxyUrl(url);
  if (!p) return null;
  const name = `${p.host}:${p.port} (chain)`;
  const wsOpts = p.params.path
    ? {
        path: p.params.path,
        headers: p.params.host ? { Host: p.params.host } : undefined,
      }
    : undefined;
  if (p.scheme === 'http' || p.scheme === 'https') {
    return {
      name,
      type: 'http',
      server: p.host,
      port: p.port,
      username: p.user || undefined,
      password: p.pass || undefined,
      udp: true,
    };
  }
  if (p.scheme === 'socks5' || p.scheme === 'socks') {
    return {
      name,
      type: 'socks5',
      server: p.host,
      port: p.port,
      username: p.user || undefined,
      password: p.pass || undefined,
      udp: true,
    };
  }
  const base: Record<string, unknown> = {
    name,
    server: p.host,
    port: p.port,
    network: p.params.type || 'ws',
    udp: true,
  };
  if (p.scheme === 'vless') {
    base.type = 'vless';
    base.uuid = p.user;
    base.flow = p.params.flow || undefined;
    if (p.params.fingerprint) base.fingerprint = p.params.fingerprint;
  } else if (p.scheme === 'trojan') {
    base.type = 'trojan';
    base.password = p.user;
  } else if (p.scheme === 'ss') {
    base.type = 'ss';
    base.method = p.params.method || 'chacha20-ietf-poly1305';
    base.password = p.pass;
    base.network = 'tcp';
    delete base['ws-opts'];
    return base;
  } else {
    return null;
  }
  if (p.params.security === 'tls') {
    base.tls = true;
    base.servername = p.params.sni || p.host;
  }
  if (wsOpts) base['ws-opts'] = wsOpts;
  return base;
}

function externalToMihomo(line: string): Record<string, unknown> | null {
  const p = parseProxyUrl(line);
  if (!p) return null;
  if (p.scheme === 'http' || p.scheme === 'socks5' || p.scheme === 'socks') {
    const t = p.scheme === 'http' ? 'http' : 'socks5';
    return {
      name: `${p.host}:${p.port} (ext ${t})`,
      type: t,
      server: p.host,
      port: p.port,
      username: p.user || undefined,
      password: p.pass || undefined,
      udp: true,
    };
  }
  if (p.scheme === 'ss') {
    return {
      name: `${p.host}:${p.port} (ext ss)`,
      type: 'ss',
      server: p.host,
      port: p.port,
      method: p.params.method || 'chacha20-ietf-poly1305',
      password: p.pass,
      network: 'tcp',
      udp: true,
    };
  }
  const e: Record<string, unknown> = {
    name: `${p.host}:${p.port} (ext)`,
    server: p.host,
    port: p.port,
    network: p.params.type || 'ws',
    udp: true,
  };
  if (p.scheme === 'vless') {
    e.type = 'vless';
    e.uuid = p.user;
    if (p.params.fingerprint) e.fingerprint = p.params.fingerprint;
  } else if (p.scheme === 'trojan') {
    e.type = 'trojan';
    e.password = p.user;
  } else {
    return null;
  }
  if (p.params.security === 'tls') {
    e.tls = true;
    e.servername = p.params.sni || p.host;
  }
  if (p.params.path) {
    e['ws-opts'] = {
      path: p.params.path,
      headers: p.params.host ? { Host: p.params.host } : undefined,
    };
  }
  return e;
}

/** Collect all mihomo rule strings from routing settings. */
export function mihomoRules(s: Settings): string[] {
  const r = s.routing;
  const rules: string[] = [];
  const direct = (rule: string) => rules.push(`${rule},DIRECT`);
  const reject = (rule: string) => rules.push(`${rule},REJECT`);

  if (r.blockAds) BLOCK_PRESETS.ads.forEach((d) => reject(`DOMAIN-SUFFIX,${d}`));
  if (r.blockPorn) BLOCK_PRESETS.porn.forEach((d) => reject(`DOMAIN-SUFFIX,${d}`));
  if (r.blockMalware) BLOCK_PRESETS.malware.forEach((d) => reject(`DOMAIN-SUFFIX,${d}`));
  if (r.blockPhishing) BLOCK_PRESETS.phishing.forEach((d) => reject(`DOMAIN-SUFFIX,${d}`));
  if (r.blockCryptominers) BLOCK_PRESETS.cryptominers.forEach((d) => reject(`DOMAIN-SUFFIX,${d}`));
  r.customBlockDomains.forEach((d) => reject(`DOMAIN-SUFFIX,${d}`));
  r.customBlockIps.forEach((ip) => reject(`IP-CIDR,${ip.includes('/') ? ip : ip + '/32'},no-resolve`));

  if (r.bypassIran) {
    REGION_PRESETS.iran.suffixes.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
    REGION_PRESETS.iran.domains.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
  }
  if (r.bypassChina) {
    REGION_PRESETS.china.suffixes.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
    REGION_PRESETS.china.domains.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
  }
  if (r.bypassRussia) {
    REGION_PRESETS.russia.suffixes.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
    REGION_PRESETS.russia.domains.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
  }
  if (r.sanctionsEnabled) r.sanctions.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
  r.customBypassDomains.forEach((d) => direct(`DOMAIN-SUFFIX,${d}`));
  r.customBypassIps.forEach((ip) => direct(`IP-CIDR,${ip.includes('/') ? ip : ip + '/32'},no-resolve`));

  rules.push('GEOIP,LAN,DIRECT');
  rules.push('MATCH,PROXY');
  return rules;
}

export async function renderMihomoYaml(ctx: Ctx): Promise<string> {
  const { s, host, dohUrl } = ctx;
  const a = serverAddr(s, host);
  const chain = s.chainProxy ? chainMihomo(s.chainProxy) : null;
  const chainName = chain ? `${(chain as Record<string, unknown>).name}` : undefined;

  const proxies: Record<string, unknown>[] = buildProxyList(s).map((e) =>
    mihomoProxy(e, s, a, chainName),
  );
  if (chain) proxies.push(chain);
  for (const line of externalLines(s.externalSingle)) {
    const ext = externalToMihomo(line);
    if (ext) proxies.push(ext);
  }

  const names = proxies.map((p) => p.name as string);
  const upstream = s.upstreamTcpProxy
    ? (() => {
        const p = parseProxyUrl(s.upstreamTcpProxy);
        if (!p) return null;
        const t = p.scheme === 'http' ? 'http' : p.scheme === 'ss' ? 'ss' : 'socks5';
        return {
          name: 'Upstream',
          type: t,
          server: p.host,
          port: p.port,
          username: p.user || undefined,
          password: p.pass || undefined,
          method: p.scheme === 'ss' ? p.params.method || 'chacha20-ietf-poly1305' : undefined,
          udp: true,
        };
      })()
    : null;

  const doc: Record<string, unknown> = {
    'mixed-port': 7890,
    'allow-lan': s.allowLan,
    mode: 'rule',
    'log-level': s.logLevel,
    'tcp-concurrent': !s.routing.blockQuic,
    externalController: '127.0.0.1:9090',
    dns: {
      enable: true,
      'enhanced-mode': s.localDns ? 'redir-host' : 'fake-ip',
      nameserver: [dohUrl],
      fallback: [s.underlyingDoh],
      'fallback-filter': { geoip: true, 'geoip-code': 'US' },
    },
    proxies,
  };
  if (upstream) doc.proxies = [...(doc.proxies as Record<string, unknown>[]), upstream];

  const groups: Record<string, unknown>[] = [
    {
      name: 'PROXY',
      type: 'select',
      proxies: names,
    },
    {
      name: 'DIRECT',
      type: 'select',
      proxies: upstream ? ['Upstream', 'DIRECT'] : ['DIRECT'],
    },
    {
      name: 'BLOCK',
      type: 'select',
      proxies: ['REJECT'],
    },
    {
      name: 'Auto',
      type: 'url-test',
      proxies: names,
      url: 'https://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
    },
  ];
  doc['proxy-groups'] = groups;
  doc.rules = mihomoRules(s);

  return yamlIndent(doc, 0).trimEnd() + '\n';
}

/* -------------------------------------------------------------------------- */
/*  sing-box JSON                                                              */
/* -------------------------------------------------------------------------- */

function singboxOutbound(
  e: ProxyEntry,
  s: Settings,
  a: ServerAddr,
  tag: string,
  detour?: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    tag,
    server: a.host,
    server_port: e.port,
  };
  if (e.protocol === 'vless') {
    base.type = 'vless';
    base.uuid = s.uuid;
  } else {
    base.type = 'trojan';
    base.password = s.trojanPassword;
  }
  if (e.tls) {
    base.tls = {
      enabled: true,
      server_name: a.sni,
      utls: { enabled: true, fingerprint: s.fingerprint },
    };
    if (s.echEnabled && s.echServerName) {
      (base.tls as Record<string, unknown>)['sni'] = s.echServerName;
    }
  }
  base.transport = {
    type: 'websocket',
    path: e.protocol === 'vless' ? '/vless' : '/trojan',
    headers: { Host: a.hostHeader },
  };
  if (detour) base.detour = detour;
  return base;
}

function chainSingbox(url: string): Record<string, unknown> | null {
  const p = parseProxyUrl(url);
  if (!p) return null;
  const base: Record<string, unknown> = { tag: 'chain', server: p.host, server_port: p.port };
  if (p.scheme === 'http') {
    base.type = 'http';
    base.username = p.user || undefined;
    base.password = p.pass || undefined;
    return base;
  }
  if (p.scheme === 'socks5' || p.scheme === 'socks') {
    base.type = 'socks';
    base.username = p.user || undefined;
    base.password = p.pass || undefined;
    return base;
  }
  if (p.scheme === 'vless') {
    base.type = 'vless';
    base.uuid = p.user;
  } else if (p.scheme === 'trojan') {
    base.type = 'trojan';
    base.password = p.user;
  } else {
    return null;
  }
  if (p.params.security === 'tls') {
    base.tls = { enabled: true, server_name: p.params.sni || p.host };
  }
  const net = p.params.type || 'ws';
  if (net === 'ws') {
    base.transport = {
      type: 'websocket',
      path: p.params.path || '/',
      headers: p.params.host ? { Host: p.params.host } : undefined,
    };
  }
  return base;
}

function singboxRules(s: Settings): Record<string, unknown>[] {
  const r = s.routing;
  const rules: Record<string, unknown>[] = [];
  const suffix = (out: string, list: string[]) =>
    rules.push({ type: 'domain_suffix', outbound: out, domain_suffix: list });
  const domain = (out: string, list: string[]) =>
    rules.push({ type: 'domain', outbound: out, domain: list });
  const cidr = (out: string, list: string[]) =>
    rules.push({ type: 'ip_cidr', outbound: out, ip_cidr: list.map((x) => (x.includes('/') ? x : x + '/32')) });

  if (r.blockAds) suffix('block', BLOCK_PRESETS.ads);
  if (r.blockPorn) suffix('block', BLOCK_PRESETS.porn);
  if (r.blockMalware) suffix('block', BLOCK_PRESETS.malware);
  if (r.blockPhishing) suffix('block', BLOCK_PRESETS.phishing);
  if (r.blockCryptominers) suffix('block', BLOCK_PRESETS.cryptominers);
  if (r.customBlockDomains.length) suffix('block', r.customBlockDomains);
  if (r.customBlockIps.length) cidr('block', r.customBlockIps);

  if (r.bypassIran) {
    suffix('direct', REGION_PRESETS.iran.suffixes);
    suffix('direct', REGION_PRESETS.iran.domains);
  }
  if (r.bypassChina) {
    suffix('direct', REGION_PRESETS.china.suffixes);
    suffix('direct', REGION_PRESETS.china.domains);
  }
  if (r.bypassRussia) {
    suffix('direct', REGION_PRESETS.russia.suffixes);
    suffix('direct', REGION_PRESETS.russia.domains);
  }
  if (r.sanctionsEnabled && r.sanctions.length) suffix('direct', r.sanctions);
  if (r.customBypassDomains.length) suffix('direct', r.customBypassDomains);
  if (r.customBypassIps.length) cidr('direct', r.customBypassIps);

  rules.push({ type: 'source_geoip', geoip: 'private', outbound: 'direct' });
  return rules;
}

export async function renderSingboxJson(ctx: Ctx): Promise<string> {
  const { s, host, dohUrl } = ctx;
  const a = serverAddr(s, host);
  const hasChain = !!s.chainProxy;
  const proxyTag = hasChain ? 'proxy-chain' : 'proxy';

  const outbounds: Record<string, unknown>[] = [];
  for (const e of buildProxyList(s)) {
    outbounds.push(
      singboxOutbound(e, s, a, `proxy-${e.port}-${e.tls ? 'tls' : 'plain'}`, hasChain ? 'chain' : undefined),
    );
  }
  if (hasChain) {
    const c = chainSingbox(s.chainProxy);
    if (c) outbounds.push(c);
    // Selector over the generated proxies (first one is the default).
    const list = buildProxyList(s);
    outbounds.push({
      tag: proxyTag,
      type: 'selector',
      outbounds: list.map((e) => `proxy-${e.port}-${e.tls ? 'tls' : 'plain'}`),
      default: `proxy-${list[0].port}-${list[0].tls ? 'tls' : 'plain'}`,
    });
  }
  // External single configs.
  for (const line of externalLines(s.externalSingle)) {
    const p = parseProxyUrl(line);
    if (p && (p.scheme === 'vless' || p.scheme === 'trojan')) {
      const e: Record<string, unknown> = {
        tag: `ext-${p.host.replace(/\W/g, '-')}-${p.port}`,
        server: p.host,
        server_port: p.port,
      };
      if (p.scheme === 'vless') {
        e.type = 'vless';
        e.uuid = p.user;
      } else {
        e.type = 'trojan';
        e.password = p.user;
      }
      if (p.params.security === 'tls') {
        e.tls = { enabled: true, server_name: p.params.sni || p.host };
      }
      if ((p.params.type || 'ws') === 'ws') {
        e.transport = {
          type: 'websocket',
          path: p.params.path || '/',
          headers: p.params.host ? { Host: p.params.host } : undefined,
        };
      }
      outbounds.push(e);
    }
  }
  if (s.upstreamTcpProxy) {
    const p = parseProxyUrl(s.upstreamTcpProxy);
    if (p) {
      const u: Record<string, unknown> = { tag: 'upstream', server: p.host, server_port: p.port };
      if (p.scheme === 'http') {
        u.type = 'http';
        u.username = p.user || undefined;
        u.password = p.pass || undefined;
      } else if (p.scheme === 'socks5' || p.scheme === 'socks') {
        u.type = 'socks';
        u.username = p.user || undefined;
        u.password = p.pass || undefined;
      } else if (p.scheme === 'ss') {
        u.type = 'shadowsocks';
        u.method = p.params.method || 'chacha20-ietf-poly1305';
        u.password = p.pass;
      }
      outbounds.push(u);
    }
  }
  outbounds.push({ tag: 'direct', type: 'direct' });
  outbounds.push({ tag: 'block', type: 'blackhole' });

  // DNS servers + rules; fake-IP mode when fakeDns is enabled.
  const dnsServers: Record<string, unknown>[] = [
    { tag: 'panel-doh', url: dohUrl },
    { tag: 'local', type: 'local' },
  ];
  const dnsRules: Record<string, unknown>[] = s.localDns
    ? [
        { outbound: 'direct', server: 'local' },
        { outbound: proxyTag, server: 'panel-doh' },
      ]
    : [{ server: 'panel-doh' }];
  if (s.fakeDns) {
    dnsServers.push({ tag: 'fakeip', type: 'fakeip', ip_pool: '198.18.0.0/16', enabled: true });
    dnsRules.unshift({ outbound: proxyTag, server: 'fakeip' });
  }

  const doc: Record<string, unknown> = {
    log: { level: s.logLevel === 'disabled' ? 'info' : s.logLevel, timestamp: true },
    dns: {
      servers: dnsServers,
      rules: dnsRules,
      strategy: s.ipv6 ? 'ipv4_and_ipv6' : 'ipv4_only',
      disable_cache: false,
    },
    outbounds,
    route: {
      rules: singboxRules(s),
      final_rule: s.upstreamTcpProxy ? 'upstream' : 'direct',
      auto_detect_interface: true,
    },
  };
  return JSON.stringify(doc, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Hiddify JSON (v3)                                                          */
/* -------------------------------------------------------------------------- */

export async function renderHiddifyJson(ctx: Ctx): Promise<string> {
  const { s, host } = ctx;
  const a = serverAddr(s, host);
  const hasChain = !!s.chainProxy;
  const proxies: Record<string, unknown>[] = [];
  for (const e of buildProxyList(s)) {
    const base: Record<string, unknown> = {
      name: e.name,
      address: a.host,
      port: e.port,
      security: e.tls ? 'tls' : 'none',
      transport: 'ws',
      wsPath: e.protocol === 'vless' ? '/vless' : '/trojan',
      wsHost: a.hostHeader,
    };
    if (e.protocol === 'vless') {
      base.type = 'vless';
      base.uuid = s.uuid;
      base.flow = '';
      if (e.tls) base.fingerprint = s.fingerprint;
    } else {
      base.type = 'trojan';
      base.password = s.trojanPassword;
    }
    if (hasChain) base.out = 'chain';
    proxies.push(base);
  }
  if (hasChain) {
    const p = parseProxyUrl(s.chainProxy);
    if (p) {
      const c: Record<string, unknown> = {
        name: `${p.host}:${p.port} (chain)`,
        address: p.host,
        port: p.port,
        transport: p.params.type || 'ws',
        wsPath: p.params.path || '/',
        wsHost: p.params.host || p.host,
      };
      if (p.scheme === 'vless') {
        c.type = 'vless';
        c.uuid = p.user;
      } else if (p.scheme === 'trojan') {
        c.type = 'trojan';
        c.password = p.user;
      } else if (p.scheme === 'socks5' || p.scheme === 'socks') {
        c.type = 'socks5';
        c.username = p.user;
        c.password = p.pass;
      } else if (p.scheme === 'http') {
        c.type = 'http';
        c.username = p.user;
        c.password = p.pass;
      } else {
        c.type = 'shadowsocks';
        c.method = p.params.method || 'chacha20-ietf-poly1305';
        c.password = p.pass;
      }
      proxies.push(c);
    }
  }
  const rules: Record<string, unknown>[] = [];
  const r = s.routing;
  const suffix = (action: string, list: string[]) =>
    rules.push({ type: 'suffix', payload: list, action });
  const cidr = (action: string, list: string[]) =>
    rules.push({ type: 'cidr', payload: list.map((x) => (x.includes('/') ? x : x + '/32')), action });

  if (r.blockAds) suffix('reject', BLOCK_PRESETS.ads);
  if (r.blockPorn) suffix('reject', BLOCK_PRESETS.porn);
  if (r.blockMalware) suffix('reject', BLOCK_PRESETS.malware);
  if (r.blockPhishing) suffix('reject', BLOCK_PRESETS.phishing);
  if (r.blockCryptominers) suffix('reject', BLOCK_PRESETS.cryptominers);
  if (r.customBlockDomains.length) suffix('reject', r.customBlockDomains);
  if (r.customBlockIps.length) cidr('reject', r.customBlockIps);

  if (r.bypassIran) {
    suffix('direct', REGION_PRESETS.iran.suffixes);
    suffix('direct', REGION_PRESETS.iran.domains);
  }
  if (r.bypassChina) {
    suffix('direct', REGION_PRESETS.china.suffixes);
    suffix('direct', REGION_PRESETS.china.domains);
  }
  if (r.bypassRussia) {
    suffix('direct', REGION_PRESETS.russia.suffixes);
    suffix('direct', REGION_PRESETS.russia.domains);
  }
  if (r.sanctionsEnabled) suffix('direct', r.sanctions);
  if (r.customBypassDomains.length) suffix('direct', r.customBypassDomains);
  if (r.customBypassIps.length) cidr('direct', r.customBypassIps);

  const doc = {
    version: 3,
    proxies,
    rules,
    settings: {
      proxy: {
        block: r.blockQuic,
      },
    },
  };
  return JSON.stringify(doc, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Dispatcher                                                                 */
/* -------------------------------------------------------------------------- */

export interface RenderedConfig {
  body: string;
  contentType: string;
  filename: string;
}

/** Render the subscription payload for a client. */
export async function renderForClient(clientId: string, ctx: Ctx): Promise<RenderedConfig | null> {
  const client = CLIENTS.find((c) => c.id === clientId);
  if (!client) return null;
  const { s } = ctx;

  switch (client.format) {
    case 'links':
      return {
        body: await renderLinks(ctx),
        contentType: 'text/plain; charset=utf-8',
        filename: `${slug(s.panelName)}-${client.id}-links.txt`,
      };
    case 'v2rayn-json':
    case 'mahsa':
      return {
        body: await renderV2RayNJson(ctx),
        contentType: 'application/json; charset=utf-8',
        filename: `${slug(s.panelName)}-${client.id}.json`,
      };
    case 'mihomo-yaml':
      return {
        body: await renderMihomoYaml(ctx),
        contentType: 'text/yaml; charset=utf-8',
        filename: `${slug(s.panelName)}-${client.id}.yaml`,
      };
    case 'singbox-json':
      return {
        body: await renderSingboxJson(ctx),
        contentType: 'application/json; charset=utf-8',
        filename: `${slug(s.panelName)}-${client.id}.json`,
      };
    case 'hiddify-json':
      return {
        body: await renderHiddifyJson(ctx),
        contentType: 'application/json; charset=utf-8',
        filename: `${slug(s.panelName)}-${client.id}.json`,
      };
    case 'wg-conf':
      return {
        body: await buildWgConf(s, ctx.wg, {
          name: `${s.panelName} WARP`,
          noise: parseNoiseForClient(client.id, s),
        }),
        contentType: 'text/plain; charset=utf-8',
        filename: `${slug(s.panelName)}-warp.conf`,
      };
    case 'amnezia':
      return {
        body: await buildWgConf(s, ctx.wg, {
          name: `${s.panelName} WARP (Amnezia)`,
          amnezia: true,
          noise: parseNoiseForClient(client.id, s),
        }),
        contentType: 'text/plain; charset=utf-8',
        filename: `${slug(s.panelName)}-amnezia.conf`,
      };
    default:
      return null;
  }
}

/** Which Warp-PRO noise block belongs to which client. */
function parseNoiseForClient(clientId: string, s: Settings): Record<string, string> | undefined {
  switch (clientId) {
    case 'mahsa':
    case 'wgtunnel':
      return mahsaNoise(s);
    case 'amnezia':
    case 'clashmeta':
    case 'clashverge':
    case 'flclash':
      return clashNoise(s);
    default:
      return undefined;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mobin';
}

export { CLIENTS, type ClientDef, v2rayNoiseBlock };
