/**
 * Mobin Panel — core type definitions
 * Created by Mobin.A
 */

/** Cloudflare Worker bindings (see wrangler.toml). */
export interface Env {
  /** KV namespace holding all panel state. */
  MOBIN_KV: KVNamespace;
}

/** Log levels supported by the panel. */
export type LogLevel = 'disabled' | 'warning' | 'error' | 'info' | 'debug';

/** Protocol selection for the proxy. */
export type ProtocolMode = 'both' | 'vless' | 'trojan';

/** Proxy IP behaviour. */
export type ProxyIpMode = 'none' | 'proxy' | 'nat64';

/** Xray fragment presets. */
export type FragmentMode = 'off' | 'low' | 'medium' | 'high' | 'severe' | 'custom';

/** A domain → preferred-IP entry ("Clean IPs" / "Proxy IPs"). */
export interface IpDomainEntry {
  id: string;
  domain: string;
  /** Comma separated list of preferred IPs. */
  ips: string;
}

/** WireGuard noise configuration (Warp PRO). */
export interface NoiseConfig {
  enabled: boolean;
  /** on | off (packet padding behaviour). */
  mode: 'on' | 'off';
  /** Packet type, e.g. tlshello. */
  packets: string;
  /** Number of padding packets. */
  count: number;
  /** Padding packet size in bytes. */
  size: number;
  /** Padding delay in ms. */
  delay: number;
}

/** Warp PRO settings (per-client noise tuning). */
export interface WarpProSettings {
  /** MahsaNG noise. */
  mahsaNoise: NoiseConfig;
  /** Clash / Amnezia noise. */
  clashNoise: { count: number; size: number };
  /** v2ray noise — a list of configurations. */
  v2rayNoise: NoiseConfig[];
}

/** Routing rule presets & custom lists. */
export interface RoutingSettings {
  bypassIran: boolean;
  bypassChina: boolean;
  bypassRussia: boolean;
  blockAds: boolean;
  blockPorn: boolean;
  blockQuic: boolean;
  blockMalware: boolean;
  blockPhishing: boolean;
  blockCryptominers: boolean;
  customBypassIps: string[];
  customBypassDomains: string[];
  customBlockIps: string[];
  customBlockDomains: string[];
  /** Sanctions bypass: services blocked by US sanctions for some regions. */
  sanctionsEnabled: boolean;
  sanctions: string[];
}

/**
 * Complete panel settings. This is the document stored in KV under
 * `mp:settings` and is also the import/export payload.
 */
export interface Settings {
  /** Display name of the panel instance. */
  panelName: string;
  /** Path prefix of the subscription endpoints (e.g. /sub). */
  subscriptionPath: string;
  /** Key used to protect subscription URLs (?t=<key>). */
  subscriptionKey: string;

  /* ------------------------------ proxy / DNS ----------------------------- */
  localDns: boolean;
  antiSanctionDns: boolean;
  fakeDns: boolean;
  ipv6: boolean;
  allowLan: boolean;
  logLevel: LogLevel;
  customDomain: string;
  underlyingDoh: string;
  fallbackDomain: string;

  /* ----------------------------- VLESS / Trojan --------------------------- */
  protocol: ProtocolMode;
  uuid: string;
  trojanPassword: string;
  remoteDns: string;
  upstreamTcpProxy: string;
  chainProxy: string;
  cleanIps: IpDomainEntry[];
  tlsPorts: number[];
  nonTlsPorts: number[];
  fingerprint: string;
  bestPingInterval: number;
  tcpFastOpen: boolean;

  /* -------------------------------- proxy IP ------------------------------ */
  proxyIpMode: ProxyIpMode;
  proxyIps: IpDomainEntry[];
  nat64Prefixes: string[];

  /* ----------------------------------- ECH -------------------------------- */
  echEnabled: boolean;
  echServerName: string;

  /* --------------------------------- custom CDN --------------------------- */
  cdnEnabled: boolean;
  cdnAddresses: string[];
  cdnHost: string;
  cdnSni: string;

  /* --------------------------------- fragment ----------------------------- */
  fragmentEnabled: boolean;
  fragmentMode: FragmentMode;
  fragmentPackets: string;
  fragmentLength: string;
  fragmentDelay: string;
  fragmentMaxSplit: string;

  /* ---------------------------- external raw configs ---------------------- */
  externalSubscriptions: string;
  externalSingle: string;

  /* ----------------------------------- warp ------------------------------- */
  warpRemoteDns: string;
  warpEndpoints: string[];
  warpBestPing: number;
  warpReservedBytes: string;
  warpAutoRenew: boolean;
  warpPro: WarpProSettings;

  /* --------------------------------- routing ------------------------------ */
  routing: RoutingSettings;
}

/** Stats persisted in KV. Buckets are keyed by 10-minute epoch. */
export interface PanelStats {
  total: number;
  /** 10-minute bucket → count, only the last ~48h are kept. */
  buckets: Record<string, number>;
}

/** Telegram integration settings (stored separately from shared settings). */
export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  userId: string;
}

/** Auth metadata returned by GET /api/auth/status. */
export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
}

/** Dashboard payload. */
export interface DashboardData {
  totalRequests: number;
  requestsLast24h: number;
  dailyQuota: number;
  usagePct: number;
  version: string;
  panelUrl: string;
  telegramConfigured: boolean;
  initialized: boolean;
}
