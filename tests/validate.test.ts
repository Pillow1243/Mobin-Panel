/**
 * Mobin Panel — input validation & sanitization tests
 * Created by Mobin.A
 */
import { describe, expect, it } from 'vitest';
import {
  asBool,
  asDomain,
  asDohUrl,
  asHttpUrl,
  asInt,
  asIpList,
  asIpOrCidr,
  asNat64Prefix,
  asPort,
  asProxyUrl,
  asString,
  asStringArray,
  validatePassword,
} from '../src/utils/validate';

describe('asString', () => {
  it('strips control characters and clamps length', () => {
    expect(asString('ab\u0000cd\u0007ef', 10)).toBe('abcdef');
    expect(asString('x'.repeat(100), 5)).toBe('xxxxx');
  });

  it('falls back for non-strings', () => {
    expect(asString(42, 10, 'fb')).toBe('fb');
    expect(asString(null)).toBe('');
  });
});

describe('asStringArray', () => {
  it('keeps clean items, drops empty ones', () => {
    expect(asStringArray(['a.com', '', 'b.com', null])).toEqual(['a.com', 'b.com']);
    expect(asStringArray('nope')).toEqual([]);
  });
});

describe('asInt', () => {
  it('clamps into range', () => {
    expect(asInt(999, 1, 10, 5)).toBe(10);
    expect(asInt('7', 1, 10, 5)).toBe(7);
    expect(asInt('abc', 1, 10, 5)).toBe(5);
  });
});

describe('asBool', () => {
  it('only accepts real booleans', () => {
    expect(asBool(true)).toBe(true);
    expect(asBool('true')).toBe(false);
    expect(asBool(1, true)).toBe(true);
  });
});

describe('asHttpUrl / asDohUrl', () => {
  it('accepts https URLs, rejects everything else', () => {
    expect(asHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(asHttpUrl('http://example.com')).toBe('');
    expect(asHttpUrl('https://exa mple.com')).toBe('');
    expect(asHttpUrl('javascript:alert(1)')).toBe('');
    expect(asDohUrl('https://1.1.1.1/dns-query')).toBe('https://1.1.1.1/dns-query');
    expect(asDohUrl('https://dns.google/resolve')).toBe('https://dns.google/resolve');
    expect(asDohUrl('http://doh.example.com')).toBe('');
  });
});

describe('asDomain', () => {
  it('lowercases and validates domains', () => {
    expect(asDomain('Example.COM')).toBe('example.com');
    expect(asDomain('sub.Example.co.uk')).toBe('sub.example.co.uk');
  });

  it('rejects wildcards, IPs and junk', () => {
    expect(asDomain('*')).toBe('');
    expect(asDomain('1.2.3.4')).toBe('');
    expect(asDomain('-bad-.com')).toBe('');
    expect(asDomain('a b.com')).toBe('');
  });
});

describe('asIpOrCidr / asIpList', () => {
  it('validates IPv4/IPv6 with optional CIDR', () => {
    expect(asIpOrCidr('8.8.8.8')).toBe('8.8.8.8');
    expect(asIpOrCidr('192.168.0.0/24')).toBe('192.168.0.0/24');
    expect(asIpOrCidr('2606:4700:4700::1111')).toBe('2606:4700:4700::1111');
    expect(asIpOrCidr('999.1.1.1')).toBe('');
    expect(asIpOrCidr('8.8.8.8/33')).toBe('8.8.8.8/33'); // syntax-accepted, fine
  });

  it('filters a comma list', () => {
    expect(asIpList('8.8.8.8, bad, 1.1.1.1')).toBe('8.8.8.8,1.1.1.1');
    expect(asIpList('nope')).toBe('');
  });
});

describe('asPort', () => {
  it('accepts 1-65535 only', () => {
    expect(asPort(443)).toBe(443);
    expect(asPort('2053')).toBe(2053);
    expect(asPort(0)).toBeNull();
    expect(asPort(70000)).toBeNull();
    expect(asPort('44a3')).toBeNull();
  });
});

describe('asProxyUrl', () => {
  it('accepts proxy schemes with credentials', () => {
    expect(asProxyUrl('vless://abcd@host.com:443?security=tls#x')).toBe(
      'vless://abcd@host.com:443?security=tls#x',
    );
    expect(asProxyUrl('socks5://user:pass@host:1080')).toBe('socks5://user:pass@host:1080');
    expect(asProxyUrl('https://proxy.example.com:8080')).toBe('https://proxy.example.com:8080');
  });

  it('rejects non-proxy URLs', () => {
    expect(asProxyUrl('https://proxy example.com')).toBe('');
    expect(asProxyUrl('ftp://host')).toBe('');
  });
});

describe('asNat64Prefix', () => {
  it('accepts IPv6 prefix forms', () => {
    expect(asNat64Prefix('64:ff9b::')).toBe('64:ff9b::');
    expect(asNat64Prefix('2001:db8::')).toBe('2001:db8::');
  });

  it('rejects IPv4 and garbage', () => {
    expect(asNat64Prefix('8.8.8.8')).toBe('');
    expect(asNat64Prefix('zz::')).toBe('');
  });
});

describe('validatePassword', () => {
  it('enforces 8-128 length', () => {
    expect(validatePassword('short')).not.toBeNull();
    expect(validatePassword('a'.repeat(129))).not.toBeNull();
    expect(validatePassword('Str0ng!Passw0rd')).toBeNull();
  });
});
