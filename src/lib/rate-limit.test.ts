import { describe, it, expect } from 'vitest';
import { getClientIdentifier } from './rate-limit';

describe('getClientIdentifier', () => {
  it('uses x-forwarded-for when present', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.42' },
    });
    expect(getClientIdentifier(req)).toBe('ip_203.0.113.42');
  });

  it('uses first IP from comma-separated x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.42, 198.51.100.10, 10.0.0.1' },
    });
    expect(getClientIdentifier(req)).toBe('ip_203.0.113.42');
  });

  it('trims whitespace from forwarded-for IPs', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '  203.0.113.42  ' },
    });
    expect(getClientIdentifier(req)).toBe('ip_203.0.113.42');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '198.51.100.5' },
    });
    expect(getClientIdentifier(req)).toBe('ip_198.51.100.5');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '203.0.113.42',
        'x-real-ip': '198.51.100.5',
      },
    });
    expect(getClientIdentifier(req)).toBe('ip_203.0.113.42');
  });

  it('falls back to unknown when no headers', () => {
    const req = new Request('http://localhost');
    expect(getClientIdentifier(req)).toBe('ip_unknown');
  });
});
