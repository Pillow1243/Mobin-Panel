/**
 * Mobin Panel — DNS helpers tests
 * Created by Mobin.A
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildDoHUrl, nat64, parseDoHResponse, preferredIps, resolveDoH } from '../src/services/dns';
import { makeSettings } from './helpers';

describe('buildDoHUrl', () => {
  it('builds dns-json queries for the common server shapes', () => {
    expect(buildDoHUrl('https://1.1.1.1/dns-query', 'example.com')).toBe(
      'https://1.1.1.1/dns-query?name=example.com&type=A',
    );
    expect(buildDoHUrl('https://dns.google/resolve', 'example.com')).toBe(
      'https://dns.google/resolve?name=example.com&type=A',
    );
    expect(buildDoHUrl('https://doh.example.com', 'example.com')).toBe(
      'https://doh.example.com/?name=example.com&type=A',
    );
  });

  it('encodes the name and rejects bad servers', () => {
    expect(buildDoHUrl('https://1.1.1.1', 'a b')).toContain('name=a%20b');
    expect(buildDoHUrl('not a url', 'example.com')).toBe('');
  });
});

describe('parseDoHResponse', () => {
  it('extracts A and AAAA records, IPv4 first', () => {
    const out = parseDoHResponse({
      Status: 0,
      Answer: [
        { type: 28, data: '2606:2800:220:1:248:1893:25c8:1946' },
        { type: 1, data: '93.184.216.34' },
        { type: 5, data: 'cname.example.com' }, // CNAME — ignored
        { type: 1, data: 'not-an-ip' }, // malformed — ignored
      ],
    });
    expect(out).toEqual([
      { ip: '93.184.216.34', family: 4 },
      { ip: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });

  it('returns [] on NXDOMAIN or garbage', () => {
    expect(parseDoHResponse({ Status: 3 })).toEqual([]);
    expect(parseDoHResponse({})).toEqual([]);
    expect(parseDoHResponse({ Status: 0, Answer: undefined })).toEqual([]);
  });
});

describe('resolveDoH', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a successful HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Status: 0,
            Answer: [{ type: 1, data: '1.2.3.4' }],
          }),
          { status: 200, headers: { 'content-type': 'application/dns-json' } },
        ),
      ),
    );
    const out = await resolveDoH('https://1.1.1.1/dns-query', 'example.com');
    expect(out).toEqual([{ ip: '1.2.3.4', family: 4 }]);
  });

  it('degrades to [] on network errors and non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await resolveDoH('https://1.1.1.1/dns-query', 'x')).toEqual([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 500 })),
    );
    expect(await resolveDoH('https://1.1.1.1/dns-query', 'x')).toEqual([]);
    // invalid server URL → no fetch at all
    expect(await resolveDoH('garbage', 'x')).toEqual([]);
  });
});

describe('nat64', () => {
  it('embeds the IPv4 address as the last two hextets', () => {
    expect(nat64('8.8.8.8', '64:ff9b::')).toBe('64:ff9b:0:0:0:0808:0808');
    expect(nat64('255.255.255.255', '2001:db8::/48')).toBe('2001:db8:0:0:0:ffff:ffff');
    expect(nat64('192.168.1.10', '2001:db8:1234::')).toBe('2001:db8:1234:0:0:c0a8:010a');
  });

  it('rejects invalid inputs', () => {
    expect(nat64('999.8.8.8', '64:ff9b::')).toBeNull();
    expect(nat64('8.8.8.8', 'not-ipv6')).toBeNull();
    expect(nat64('', '64:ff9b::')).toBeNull();
  });
});

describe('preferredIps', () => {
  it('matches the domain and subdomains from clean/proxy entries', () => {
    const s = makeSettings({
      cleanIps: [{ id: '1', domain: 'cloudflare.com', ips: '104.16.0.1, 104.16.0.2' }],
      proxyIps: [{ id: '2', domain: 'example.org', ips: '9.9.9.9' }],
    });
    expect(preferredIps(s, 'cloudflare.com')).toEqual({
      domain: 'cloudflare.com',
      ips: ['104.16.0.1', '104.16.0.2'],
    });
    expect(preferredIps(s, 'www.cloudflare.com')).toEqual({
      domain: 'cloudflare.com',
      ips: ['104.16.0.1', '104.16.0.2'],
    });
    expect(preferredIps(s, 'example.org')).toEqual({ domain: 'example.org', ips: ['9.9.9.9'] });
    expect(preferredIps(s, 'other.net')).toBeNull();
  });
});
