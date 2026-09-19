/**
 * Mobin Panel — config generator tests
 * Created by Mobin.A
 */
import { describe, expect, it } from 'vitest';
import {
  buildProxyList,
  fragmentParam,
  mihomoRules,
  renderForClient,
  renderLinks,
  renderMihomoYaml,
  renderSingboxJson,
  renderV2RayNJson,
  trojanLink,
  vlessLink,
} from '../src/services/configGenerator';
import type { Settings } from '../src/types';
import { makeCtx, makeSettings } from './helpers';

const HOST = 'panel.example.com';

describe('buildProxyList', () => {
  it('builds one entry per port per enabled protocol', () => {
    const s = makeSettings({
      tlsPorts: [443, 8443],
      nonTlsPorts: [8080],
      protocol: 'both',
    });
    const list = buildProxyList(s);
    expect(list).toHaveLength(6);
    expect(list.filter((e) => e.protocol === 'vless')).toHaveLength(3);
    expect(list.filter((e) => e.protocol === 'trojan')).toHaveLength(3);
    expect(list.every((e) => (e.port === 8080 ? !e.tls : e.tls))).toBe(true);
  });

  it('respects the protocol selector', () => {
    const s = makeSettings({ protocol: 'trojan' });
    expect(buildProxyList(s).every((e) => e.protocol === 'trojan')).toBe(true);
    expect(buildProxyList(s)).toHaveLength(2);
  });
});

describe('vlessLink / trojanLink', () => {
  it('produces a well-formed vless WS link', () => {
    const { s, ctx } = makeCtx({});
    const e = buildProxyList(s)[0];
    const link = vlessLink(e, s, HOST);
    const url = new URL(link.replace('vless://', 'https://'));
    expect(url.username).toBe(s.uuid);
    expect(url.hostname).toBe(HOST);
    const q = url.searchParams;
    expect(q.get('encryption')).toBe('none');
    expect(q.get('type')).toBe('ws');
    expect(q.get('path')).toBe('/vless');
    expect(q.get('host')).toBe(HOST);
    expect(q.get('uuid')).toBe(s.uuid); // echoed for WS upgrade auth
    expect(link).toContain('fingerprint=chrome');
    expect(link).toContain('fragment='); // default settings enable fragment (low)
  });

  it('adds tfo and ech when enabled', () => {
    const { s, ctx } = makeCtx({ tcpFastOpen: true, echEnabled: true, echServerName: 'cf.example' });
    const e = buildProxyList(s)[0];
    const link = vlessLink(e, s, HOST);
    expect(link).toContain('tfo=1');
    expect(link).toContain(`ech=${encodeURIComponent('cf.example')}`);
  });

  it('uses the CDN host when enabled (Host/SNI preserved)', () => {
    const { s } = makeCtx({ cdnEnabled: true, cdnHost: 'cdn.example.net', customDomain: 'orig.example.com' });
    const e = buildProxyList(s)[0];
    const link = vlessLink(e, s, HOST);
    const url = new URL(link.replace('vless://', 'https://'));
    expect(url.hostname).toBe('cdn.example.net');
    expect(url.searchParams.get('host')).toBe('orig.example.com');
    expect(url.searchParams.get('sni')).toBe('orig.example.com');
  });

  it('produces a well-formed trojan WS link with pass echo', () => {
    const { s } = makeCtx({});
    const e = buildProxyList(s).find((x) => x.protocol === 'trojan')!;
    const link = trojanLink(e, s, HOST);
    const url = new URL(link.replace('trojan://', 'https://'));
    expect(url.username).toBe(s.trojanPassword);
    const q = url.searchParams;
    expect(q.get('type')).toBe('ws');
    expect(q.get('path')).toBe('/trojan');
    expect(q.get('pass')).toBe(s.trojanPassword);
  });
});

describe('fragmentParam', () => {
  it('is empty when disabled', () => {
    const { s } = makeCtx({ fragmentEnabled: false });
    expect(fragmentParam(s)).toBe('');
  });

  it('uses the preset for non-custom modes', () => {
    const { s } = makeCtx({ fragmentEnabled: true, fragmentMode: 'low' });
    expect(fragmentParam(s)).toMatch(/^pktM\d+tlshello:\d+-\d+:\d+-\d+$/);
  });

  it('honours custom values', () => {
    const { s } = makeCtx({
      fragmentEnabled: true,
      fragmentMode: 'custom',
      fragmentPackets: 'cdntls',
      fragmentLength: '50-100',
      fragmentDelay: '10-20',
      fragmentMaxSplit: '5',
    });
    expect(fragmentParam(s)).toBe('pktM5cdntls:50-100:10-20');
  });
});

describe('mihomoRules', () => {
  it('emits block + bypass rules and always ends with LAN/MATCH', () => {
    const s = makeSettings({
      routing: {
        ...makeSettings().routing,
        blockAds: true,
        bypassIran: true,
        customBlockDomains: ['bad.example'],
        customBypassIps: ['1.2.3.0/24'],
      },
    } as Settings);
    const rules = mihomoRules(s);
    expect(rules).toContain('DOMAIN-SUFFIX,bad.example,REJECT');
    expect(rules).toContain('IP-CIDR,1.2.3.0/24,no-resolve,DIRECT');
    expect(rules.some((r) => r.includes('REJECT'))).toBe(true);
    expect(rules).toContain('GEOIP,LAN,DIRECT');
    expect(rules[rules.length - 1]).toBe('MATCH,PROXY');
  });

  it('respects a minimal config (no sanctions list)', () => {
    const s = makeSettings({
      routing: { ...makeSettings().routing, sanctionsEnabled: false },
    } as Settings);
    const rules = mihomoRules(s);
    expect(rules).toEqual(['GEOIP,LAN,DIRECT', 'MATCH,PROXY']);
  });
});

describe('renderForClient', () => {
  it('returns null for unknown clients', async () => {
    const { ctx } = makeCtx();
    expect(await renderForClient('nope', ctx)).toBeNull();
  });

  it('v2rayN json: parseable, one entry per proxy', async () => {
    const { s, ctx } = makeCtx({});
    const out = (await renderForClient('v2rayn', ctx))!;
    expect(out.contentType).toContain('application/json');
    const doc = JSON.parse(out.body) as { type?: string; network?: string }[];
    expect(Array.isArray(doc)).toBe(true);
    expect(doc).toHaveLength(buildProxyList(s).length);
    doc.forEach((o) => {
      expect(['vless', 'trojan']).toContain(o.type);
      expect(o.network).toBe('ws');
    });
  });

  it('mahsa: v2rayN-compatible JSON', async () => {
    const { ctx } = makeCtx();
    const out = (await renderForClient('mahsa', ctx))!;
    const doc = JSON.parse(out.body);
    expect(Array.isArray(doc)).toBe(true);
  });

  it('streisand / shadowrocket / husi: share links', async () => {
    const { s, ctx } = makeCtx();
    for (const id of ['streisand', 'shadowrocket', 'husi']) {
      const out = (await renderForClient(id, ctx))!;
      const lines = out.body.split('\n').filter(Boolean);
      // one share link per entry + the aggregated WARP link
      expect(lines).toHaveLength(buildProxyList(s).length + 1);
      lines.slice(0, -1).forEach((l) => expect(l).toMatch(/^(vless|trojan):\/\//));
      expect(lines[lines.length - 1]).toMatch(/^wg:\/\//);
    }
  });

  it('clash meta: mihomo YAML with proxies and rules', async () => {
    const { ctx } = makeCtx();
    const out = (await renderForClient('clashmeta', ctx))!;
    expect(out.contentType).toContain('yaml');
    expect(out.body).toContain('proxies:');
    expect(out.body).toContain('rules:');
    expect(out.body).toContain('MATCH,PROXY');
  });

  it('sing-box: valid JSON with expected structure', async () => {
    const { s, ctx } = makeCtx({ fakeDns: true, localDns: true });
    const out = (await renderForClient('singbox', ctx))!;
    const doc = JSON.parse(out.body);
    expect(Array.isArray(doc.outbounds)).toBe(true);
    expect(doc.outbounds.length).toBeGreaterThanOrEqual(1);
    // fakeDns on → fakeip dns server; localDns on → typed local server
    expect(JSON.stringify(doc.dns.servers)).toContain('fakeip');
    expect(JSON.stringify(doc.dns.servers)).toContain('"local"');
  });

  it('hiddify: valid JSON', async () => {
    const { ctx } = makeCtx();
    const out = (await renderForClient('hiddify', ctx))!;
    expect(() => JSON.parse(out.body)).not.toThrow();
  });

  it('wireguard / amnezia / wgtunnel: WARP conf with keys', async () => {
    const { ctx } = makeCtx();
    for (const id of ['wireguard', 'amnezia', 'wgtunnel']) {
      const out = (await renderForClient(id, ctx))!;
      expect(out.body).toContain('PrivateKey = ' + ctx.wg.privateKey);
      expect(out.body).toContain('Address = 172.16.0.2/32');
      expect(out.body).toContain('Endpoint = [2606:4700:4700::1111]');
      expect(out.body).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
    }
    const amnezia = (await renderForClient('amnezia', ctx))!;
    expect(amnezia.body).toMatch(/amnezia|robustness/i);
  });
});

describe('renderLinks / renderMihomoYaml / renderSingboxJson / renderV2RayNJson (direct)', () => {
  it('renderLinks emits one link per entry plus the WARP link', async () => {
    const { s, ctx } = makeCtx();
    const body = await renderLinks(ctx);
    const lines = body.split('\n').filter(Boolean);
    expect(lines).toHaveLength(buildProxyList(s).length + 1);
    expect(lines[lines.length - 1]).toMatch(/^wg:\/\//);
  });

  it('renderMihomoYaml includes a working proxy group', async () => {
    const { ctx } = makeCtx();
    const yaml = await renderMihomoYaml(ctx);
    expect(yaml).toContain('mixed-port:');
    expect(yaml).toContain('proxies:');
    expect(yaml).toContain('proxy-groups:');
    expect(yaml).toContain('MATCH,PROXY');
  });

  it('renderSingboxJson is always parseable', async () => {
    const { ctx } = makeCtx();
    const body = await renderSingboxJson(ctx);
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it('renderV2RayNJson is always parseable', async () => {
    const { ctx } = makeCtx();
    const body = await renderV2RayNJson(ctx);
    expect(() => JSON.parse(body)).not.toThrow();
  });
});
