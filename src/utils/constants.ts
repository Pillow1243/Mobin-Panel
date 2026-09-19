/**
 * Mobin Panel — constants, defaults and curated rule lists
 * Created by Mobin.A
 */
import type { Settings } from '../types';

/** Panel version (shown in the UI & dashboard API). */
export const PANEL_VERSION = '1.0.0';

/** Free Workers limit used for the usage bar (VLESS/Trojan requests/day). */
export const DAILY_QUOTA = 100_000;

/** Max request body size for API endpoints (bytes). */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Cookie name + lifetime. */
export const SESSION_COOKIE = 'mobin_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** TLS ports offered by the panel. */
export const TLS_PORT_OPTIONS = [443, 8443, 2053, 2083, 2087, 2096];
/** Non-TLS ports offered by the panel. */
export const NON_TLS_PORT_OPTIONS = [80, 8080, 8880, 2052, 2082, 2086, 2095];

export const FINGERPRINT_OPTIONS = [
  'chrome',
  'firefox',
  'safari',
  'ios',
  'android',
  'edge',
  '360',
  'qq',
  'random',
  'randomized',
];

export const LOG_LEVEL_OPTIONS = ['disabled', 'warning', 'error', 'info', 'debug'] as const;

export const PROTOCOL_OPTIONS = [
  { value: 'both', label: 'VLESS & Trojan' },
  { value: 'vless', label: 'VLESS only' },
  { value: 'trojan', label: 'Trojan only' },
];

export const FRAGMENT_MODE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'severe', label: 'Severe' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Fragment presets → length/delay ranges used in generated Xray links.
 * (Xray fragment: pktM{maxSplit}{packet}:{lengthRange}:{delayRange})
 */
export const FRAGMENT_PRESETS: Record<
  string,
  { maxSplit: string; length: string; delay: string }
> = {
  off: { maxSplit: '0', length: '', delay: '' },
  low: { maxSplit: '3', length: '100-200', delay: '0-10' },
  medium: { maxSplit: '5', length: '100-300', delay: '0-20' },
  high: { maxSplit: '10', length: '100-500', delay: '0-30' },
  severe: { maxSplit: '20', length: '100-1000', delay: '0-50' },
};

export const FRAGMENT_PACKET_OPTIONS = ['tlshello', '1-1', '1-2', '1-3', '1-5'];

export const PROXY_IP_MODE_OPTIONS = [
  { value: 'none', label: 'Disabled' },
  { value: 'proxy', label: 'Proxy IP' },
  { value: 'nat64', label: 'NAT64' },
];

/** NAT64 prefix presets (multi-select). */
export const NAT64_PREFIX_OPTIONS = ['64:ff9b::', '64:ff9b:1::', '2001:db8::', '2001:db8:1::'];

/**
 * WARP WireGuard endpoint presets (multi-select).
 * Cloudflare anycast IPv6 first — it works globally and is hard to block.
 */
export const WARP_ENDPOINT_OPTIONS = [
  '2606:4700:4700::1111',
  '104.16.132.222',
  '104.16.133.222',
  '188.114.96.170',
  '188.114.97.170',
  '172.64.32.67',
  '172.64.33.67',
  '198.41.200.138',
  '198.41.201.138',
];

/** Warps are reached on UDP 51820. */
export const WARP_PORT = 51820;

/* -------------------------------------------------------------------------- */
/*  Routing rule lists (compact curated defaults — users can add their own)   */
/* -------------------------------------------------------------------------- */

/** Domain suffixes + notable domains for regional bypass presets. */
export const REGION_PRESETS: Record<'iran' | 'china' | 'russia', { suffixes: string[]; domains: string[] }> = {
  iran: {
    suffixes: ['ir'],
    domains: [
      'digikala.com',
      'snapp.ir',
      'snappmarket.com',
      'bale.to',
      'rubika.ir',
      'eitaa.com',
      'pib.ir',
      'idg.co',
      'kaashmock.co',
      'ca.ir',
    ],
  },
  china: {
    suffixes: ['cn', 'net.cn', 'com.cn'],
    domains: [
      'alibaba.com',
      'baidu.com',
      'taobao.com',
      'tmall.com',
      'qq.com',
      'wechat.com',
      'weixin.com',
      'weibo.com',
      'xiaomi.com',
      'huawei.com',
      'tencent.com',
      'douyin.com',
      'bilibili.com',
      'migu.cn',
    ],
  },
  russia: {
    suffixes: ['ru', 'su'],
    domains: ['vk.com', 'dzen.ru', 'mail.ru', 'ozon.com', 'avito.ru', 'yandex.com'],
  },
};

/** Block category lists (compact curated defaults). */
export const BLOCK_PRESETS: Record<
  'ads' | 'porn' | 'malware' | 'phishing' | 'cryptominers',
  string[]
> = {
  ads: [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'google-analytics.com',
    'adservice.google.com',
    'adnxs.com',
    'adsrvr.org',
    'adcolony.com',
    'amazon-adsystem.com',
    'criteo.com',
    'criteo.net',
    'pubmatic.com',
    'rubiconproject.com',
    'taboola.com',
    'outbrain.com',
    'scorecardresearch.com',
    'moatads.com',
    '2mdn.net',
    'adroll.com',
    'applovin.com',
    'tenjin.io',
    'adsafeprotected.com',
  ],
  porn: [
    'pornhub.com',
    'xvideos.com',
    'xvideos.red',
    'xhamster.com',
    'youporn.com',
    'redtube.com',
    'tube8.com',
    'spankbang.com',
    'xnxx.com',
    'brazzers.com',
    'hqporner.com',
    'eporner.com',
  ],
  malware: [
    'kryptlogic.com',
    'cryptshelter.org',
    'malwaredomainlist.com',
    'exploit.in',
    'zerodayinitiative.com',
    'c2-canon.com',
  ],
  phishing: [
    'paypal-secure-alerts.com',
    'paypal-notice.com',
    'g00gle.com',
    'm1crosoft.com',
    'faceb00k.com',
    'appIe.com',
    'paypa1.com',
    'icloud-verify.com',
  ],
  cryptominers: [
    'coinhive.com',
    'coin-hive.com',
    'jsecoin.com',
    'cryptoloot.pro',
    'minergate.com',
    'xmr.to',
    'webmining.bit',
    'coinimp.com',
  ],
};

/** Sanctions-bypass presets (services geo/sanction-restricted for some users). */
export const SANCTION_PRESETS: { id: string; label: string; domains: string[] }[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT / OpenAI',
    domains: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com', 'auth0.com'],
  },
  {
    id: 'google-ai',
    label: 'Google AIs',
    domains: ['gemini.google.com', 'ai.google.dev', 'aistudio.google.com', 'cloud.google.com'],
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    domains: ['bing.com', 'bingapis.com', 'copilot.microsoft.com', 'sway.com'],
  },
  { id: 'oracle', label: 'Oracle', domains: ['oracle.com', 'oraclecloud.com'] },
  { id: 'docker', label: 'Docker', domains: ['docker.com', 'docker.io', 'docker-cdn.net'] },
  { id: 'adobe', label: 'Adobe', domains: ['adobe.com', 'adobedtm.com', 'adobe.io'] },
  {
    id: 'epic',
    label: 'Epic Games',
    domains: ['epicgames.com', 'epicgames.dev', 'unrealengine.com', 'fortnite.com'],
  },
  { id: 'intel', label: 'Intel', domains: ['intel.com'] },
  { id: 'amd', label: 'AMD', domains: ['amd.com'] },
  { id: 'nvidia', label: 'Nvidia', domains: ['nvidia.com', 'nvidiagrid.net'] },
  { id: 'asus', label: 'Asus', domains: ['asus.com', 'asuscomm.com'] },
  { id: 'hp', label: 'HP', domains: ['hp.com', 'hpe.com'] },
  { id: 'lenovo', label: 'Lenovo', domains: ['lenovo.com'] },
];

/** Default sanctions selection (ChatGPT + Google AIs, like most panels). */
export const DEFAULT_SANCTIONS = [
  'chatgpt.com',
  'openai.com',
  'oaistatic.com',
  'oaiusercontent.com',
  'gemini.google.com',
  'ai.google.dev',
  'aistudio.google.com',
];

/** Clients offered in the subscriptions page (id → label + output format). */
export interface ClientDef {
  id: string;
  label: string;
  format:
    | 'links'
    | 'v2rayn-json'
    | 'mihomo-yaml'
    | 'singbox-json'
    | 'hiddify-json'
    | 'wg-conf'
    | 'amnezia'
    | 'mahsa';
}

export const CLIENTS: ClientDef[] = [
  { id: 'v2rayn', label: 'v2rayN (Windows)', format: 'v2rayn-json' },
  { id: 'v2rayng', label: 'v2rayNG (Android)', format: 'v2rayn-json' },
  { id: 'mahsa', label: 'MahsaNG (iOS)', format: 'mahsa' },
  { id: 'streisand', label: 'Streisand (iOS)', format: 'links' },
  { id: 'singbox', label: 'sing-box', format: 'singbox-json' },
  { id: 'husi', label: 'husi (iOS)', format: 'links' },
  { id: 'clashmeta', label: 'Clash Meta', format: 'mihomo-yaml' },
  { id: 'clashverge', label: 'Clash Verge (Rev)', format: 'mihomo-yaml' },
  { id: 'flclash', label: 'FLClash', format: 'mihomo-yaml' },
  { id: 'stash', label: 'Stash (iOS)', format: 'v2rayn-json' },
  { id: 'shadowrocket', label: 'Shadowrocket (iOS)', format: 'links' },
  { id: 'passwall', label: 'PassWall / OpenClash', format: 'links' },
  { id: 'nekobox', label: 'NekoBox', format: 'links' },
  { id: 'hiddify', label: 'Hiddify', format: 'hiddify-json' },
  { id: 'karing', label: 'Karing (iOS)', format: 'links' },
  { id: 'wireguard', label: 'WireGuard', format: 'wg-conf' },
  { id: 'amnezia', label: 'Amnezia VPN', format: 'amnezia' },
  { id: 'wgtunnel', label: 'WG Tunnel', format: 'wg-conf' },
];

/* -------------------------------------------------------------------------- */
/*  Default settings                                                           */
/* -------------------------------------------------------------------------- */

import { uuid, randomPassword } from './crypto';
import { asDohUrl } from './validate';

/** Build the factory-default settings document. */
export function defaultSettings(): Settings {
  return {
    panelName: 'Mobin Panel',
    subscriptionPath: '/sub',
    subscriptionKey: uuid(),

    localDns: true,
    antiSanctionDns: true,
    fakeDns: false,
    ipv6: false,
    allowLan: false,
    logLevel: 'disabled',
    customDomain: '',
    underlyingDoh: 'https://1.1.1.1/dns-query',
    fallbackDomain: '',

    protocol: 'both',
    uuid: uuid(),
    trojanPassword: randomPassword(16),
    remoteDns: 'https://1.1.1.1/dns-query',
    upstreamTcpProxy: '',
    chainProxy: '',
    cleanIps: [],
    tlsPorts: [443],
    nonTlsPorts: [8080],
    fingerprint: 'chrome',
    bestPingInterval: 250,
    tcpFastOpen: false,

    proxyIpMode: 'none',
    proxyIps: [],
    nat64Prefixes: ['64:ff9b::'],

    echEnabled: false,
    echServerName: '',

    cdnEnabled: false,
    cdnAddresses: [],
    cdnHost: '',
    cdnSni: '',

    fragmentEnabled: true,
    fragmentMode: 'low',
    fragmentPackets: 'tlshello',
    fragmentLength: '',
    fragmentDelay: '',
    fragmentMaxSplit: '',

    externalSubscriptions: '',
    externalSingle: '',

    warpRemoteDns: 'https://1.1.1.1/dns-query',
    warpEndpoints: ['2606:4700:4700::1111'],
    warpBestPing: 250,
    warpReservedBytes: '16',
    warpAutoRenew: false,
    warpPro: {
      mahsaNoise: { enabled: false, mode: 'on', packets: 'tlshello', count: 3, size: 300, delay: 20 },
      clashNoise: { count: 3, size: 300 },
      v2rayNoise: [
        { enabled: true, mode: 'on', packets: 'tlshello', count: 3, size: 300, delay: 20 },
      ],
    },

    routing: {
      bypassIran: false,
      bypassChina: false,
      bypassRussia: false,
      blockAds: false,
      blockPorn: false,
      blockQuic: false,
      blockMalware: false,
      blockPhishing: false,
      blockCryptominers: false,
      customBypassIps: [],
      customBypassDomains: [],
      customBlockIps: [],
      customBlockDomains: [],
      sanctionsEnabled: true,
      sanctions: DEFAULT_SANCTIONS,
    },
  };
}

/**
 * Sanitize an arbitrary (possibly hostile) object into a valid Settings.
 * Unknown keys are dropped; every value is coerced/clamped. This is the only
 * path through which external data (API, import) can reach KV.
 */
export function sanitizeSettings(input: unknown, prev: Settings): Settings {
  const doh = (v: unknown, fb: string) => asDohUrl(v, fb);
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const g = <K extends keyof Settings>(k: K, fallback: Settings[K]): Settings[K] =>
    s[k] === undefined ? fallback : (s[k] as Settings[K]);

  const portSet = (v: unknown, allowed: number[]): number[] => {
    if (!Array.isArray(v)) return prev.tlsPorts;
    return [...new Set(v.map((p) => parseInt(String(p), 10)).filter((p) => allowed.includes(p)))];
  };
  const ipEntries = (v: unknown, max = 32): Settings['cleanIps'] => {
    if (!Array.isArray(v)) return prev.cleanIps;
    return v.slice(0, max).map((e: any, i: number) => ({
      id: typeof e?.id === 'string' ? e.id.slice(0, 32) : `e${i}-${Date.now().toString(36)}`,
      domain: typeof e?.domain === 'string' ? e.domain.toLowerCase().slice(0, 253) : '',
      ips: typeof e?.ips === 'string' ? e.ips.slice(0, 1024) : '',
    }));
  };

  const warpProIn = (s.warpPro || {}) as Record<string, any>;
  const noiseIn = (n: any): Settings['warpPro']['mahsaNoise'] => ({
    enabled: !!n?.enabled,
    mode: n?.mode === 'off' ? 'off' : 'on',
    packets: typeof n?.packets === 'string' ? n.packets.slice(0, 32) : 'tlshello',
    count: Math.min(64, Math.max(0, parseInt(n?.count, 10) || 0)),
    size: Math.min(65535, Math.max(0, parseInt(n?.size, 10) || 0)),
    delay: Math.min(10000, Math.max(0, parseInt(n?.delay, 10) || 0)),
  });

  const routingIn = (s.routing || {}) as Record<string, any>;

  return {
    panelName: typeof s.panelName === 'string' ? s.panelName.slice(0, 64) : prev.panelName,
    subscriptionPath: typeof s.subscriptionPath === 'string'
      ? s.subscriptionPath.replace(/[^a-zA-Z0-9/-]/g, '').slice(0, 32) || '/sub'
      : prev.subscriptionPath,
    subscriptionKey: typeof s.subscriptionKey === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(s.subscriptionKey)
      ? s.subscriptionKey
      : prev.subscriptionKey,

    localDns: !!g('localDns', prev.localDns),
    antiSanctionDns: !!g('antiSanctionDns', prev.antiSanctionDns),
    fakeDns: !!g('fakeDns', prev.fakeDns),
    ipv6: !!g('ipv6', prev.ipv6),
    allowLan: !!g('allowLan', prev.allowLan),
    logLevel: (LOG_LEVEL_OPTIONS as readonly string[]).includes(g('logLevel', prev.logLevel))
      ? (g('logLevel', prev.logLevel) as Settings['logLevel'])
      : prev.logLevel,
    customDomain: typeof s.customDomain === 'string' ? s.customDomain.toLowerCase().slice(0, 253) : '',
    underlyingDoh: doh(s.underlyingDoh, prev.underlyingDoh),
    fallbackDomain: typeof s.fallbackDomain === 'string' ? s.fallbackDomain.toLowerCase().slice(0, 253) : '',

    protocol: (['both', 'vless', 'trojan'] as const).includes(g('protocol', prev.protocol))
      ? (g('protocol', prev.protocol) as Settings['protocol'])
      : prev.protocol,
    uuid:
      typeof s.uuid === 'string' && /^[0-9a-f-]{36}$/i.test(s.uuid)
        ? s.uuid.toLowerCase()
        : prev.uuid,
    trojanPassword:
      typeof s.trojanPassword === 'string' && s.trojanPassword.length >= 8
        ? s.trojanPassword.slice(0, 64)
        : prev.trojanPassword,
    remoteDns: doh(s.remoteDns, prev.remoteDns),
    upstreamTcpProxy:
      typeof s.upstreamTcpProxy === 'string' &&
      /^(vless|trojan|ss|socks5|socks|http|https):\/\/[^\s]{3,255}$/i.test(s.upstreamTcpProxy)
        ? s.upstreamTcpProxy
        : '',
    chainProxy:
      typeof s.chainProxy === 'string' &&
      /^(vless|trojan|ss|socks5|socks|http|https):\/\/[^\s]{3,255}$/i.test(s.chainProxy)
        ? s.chainProxy
        : '',
    cleanIps: ipEntries(s.cleanIps),
    tlsPorts: portSet(s.tlsPorts, TLS_PORT_OPTIONS),
    nonTlsPorts: portSet(s.nonTlsPorts, NON_TLS_PORT_OPTIONS),
    fingerprint: FINGERPRINT_OPTIONS.includes(g('fingerprint', prev.fingerprint))
      ? g('fingerprint', prev.fingerprint)
      : prev.fingerprint,
    bestPingInterval: Math.min(5000, Math.max(50, parseInt(g('bestPingInterval', prev.bestPingInterval) as any, 10) || prev.bestPingInterval)),
    tcpFastOpen: !!g('tcpFastOpen', prev.tcpFastOpen),

    proxyIpMode: (['none', 'proxy', 'nat64'] as const).includes(g('proxyIpMode', prev.proxyIpMode))
      ? (g('proxyIpMode', prev.proxyIpMode) as Settings['proxyIpMode'])
      : prev.proxyIpMode,
    proxyIps: ipEntries(s.proxyIps),
    nat64Prefixes: Array.isArray(s.nat64Prefixes)
      ? s.nat64Prefixes.map((p: any) => (typeof p === 'string' ? p.toLowerCase().slice(0, 64) : '')).filter(Boolean)
      : prev.nat64Prefixes,

    echEnabled: !!g('echEnabled', prev.echEnabled),
    echServerName: typeof s.echServerName === 'string' ? s.echServerName.toLowerCase().slice(0, 253) : '',

    cdnEnabled: !!g('cdnEnabled', prev.cdnEnabled),
    cdnAddresses: Array.isArray(s.cdnAddresses)
      ? s.cdnAddresses.map((a: any) => (typeof a === 'string' ? a.toLowerCase().slice(0, 253) : '')).filter(Boolean)
      : prev.cdnAddresses,
    cdnHost: typeof s.cdnHost === 'string' ? s.cdnHost.toLowerCase().slice(0, 253) : '',
    cdnSni: typeof s.cdnSni === 'string' ? s.cdnSni.toLowerCase().slice(0, 253) : '',

    fragmentEnabled: !!g('fragmentEnabled', prev.fragmentEnabled),
    fragmentMode: (['off', 'low', 'medium', 'high', 'severe', 'custom'] as const).includes(
      g('fragmentMode', prev.fragmentMode),
    )
      ? (g('fragmentMode', prev.fragmentMode) as Settings['fragmentMode'])
      : prev.fragmentMode,
    fragmentPackets: FRAGMENT_PACKET_OPTIONS.includes(g('fragmentPackets', prev.fragmentPackets))
      ? g('fragmentPackets', prev.fragmentPackets)
      : prev.fragmentPackets,
    fragmentLength: typeof s.fragmentLength === 'string' ? s.fragmentLength.slice(0, 32) : '',
    fragmentDelay: typeof s.fragmentDelay === 'string' ? s.fragmentDelay.slice(0, 32) : '',
    fragmentMaxSplit: typeof s.fragmentMaxSplit === 'string' ? s.fragmentMaxSplit.slice(0, 8) : '',

    externalSubscriptions: typeof s.externalSubscriptions === 'string' ? s.externalSubscriptions.slice(0, 20000) : '',
    externalSingle: typeof s.externalSingle === 'string' ? s.externalSingle.slice(0, 20000) : '',

    warpRemoteDns: doh(s.warpRemoteDns, prev.warpRemoteDns),
    warpEndpoints: Array.isArray(s.warpEndpoints)
      ? s.warpEndpoints.map((e: any) => (typeof e === 'string' ? e.slice(0, 64) : '')).filter(Boolean)
      : prev.warpEndpoints,
    warpBestPing: Math.min(5000, Math.max(50, parseInt(g('warpBestPing', prev.warpBestPing) as any, 10) || prev.warpBestPing)),
    warpReservedBytes: typeof s.warpReservedBytes === 'string' ? s.warpReservedBytes.slice(0, 16) : '',
    warpAutoRenew: !!g('warpAutoRenew', prev.warpAutoRenew),
    warpPro: {
      mahsaNoise: noiseIn(warpProIn.mahsaNoise),
      clashNoise: {
        count: Math.min(64, Math.max(0, parseInt(warpProIn.clashNoise?.count, 10) || 0)),
        size: Math.min(65535, Math.max(0, parseInt(warpProIn.clashNoise?.size, 10) || 0)),
      },
      v2rayNoise: Array.isArray(warpProIn.v2rayNoise)
        ? warpProIn.v2rayNoise.slice(0, 8).map(noiseIn)
        : prev.warpPro.v2rayNoise,
    },

    routing: {
      bypassIran: !!routingIn.bypassIran,
      bypassChina: !!routingIn.bypassChina,
      bypassRussia: !!routingIn.bypassRussia,
      blockAds: !!routingIn.blockAds,
      blockPorn: !!routingIn.blockPorn,
      blockQuic: !!routingIn.blockQuic,
      blockMalware: !!routingIn.blockMalware,
      blockPhishing: !!routingIn.blockPhishing,
      blockCryptominers: !!routingIn.blockCryptominers,
      customBypassIps: Array.isArray(routingIn.customBypassIps)
        ? routingIn.customBypassIps.map((x: any) => (typeof x === 'string' ? x.toLowerCase().slice(0, 64) : '')).filter(Boolean).slice(0, 200)
        : prev.routing.customBypassIps,
      customBypassDomains: Array.isArray(routingIn.customBypassDomains)
        ? routingIn.customBypassDomains.map((x: any) => (typeof x === 'string' ? x.toLowerCase().slice(0, 253) : '')).filter(Boolean).slice(0, 500)
        : prev.routing.customBypassDomains,
      customBlockIps: Array.isArray(routingIn.customBlockIps)
        ? routingIn.customBlockIps.map((x: any) => (typeof x === 'string' ? x.toLowerCase().slice(0, 64) : '')).filter(Boolean).slice(0, 200)
        : prev.routing.customBlockIps,
      customBlockDomains: Array.isArray(routingIn.customBlockDomains)
        ? routingIn.customBlockDomains.map((x: any) => (typeof x === 'string' ? x.toLowerCase().slice(0, 253) : '')).filter(Boolean).slice(0, 500)
        : prev.routing.customBlockDomains,
      sanctionsEnabled: !!routingIn.sanctionsEnabled,
      sanctions: Array.isArray(routingIn.sanctions)
        ? routingIn.sanctions.map((x: any) => (typeof x === 'string' ? x.toLowerCase().slice(0, 253) : '')).filter(Boolean).slice(0, 500)
        : prev.routing.sanctions,
    },
  };
}
