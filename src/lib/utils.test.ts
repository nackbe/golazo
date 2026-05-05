import { describe, it, expect, vi } from 'vitest';
import { cn, formatDate, generatePollaCode } from './utils';

describe('cn', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', true && 'block')).toBe('base block');
  });

  it('ignores undefined and null', () => {
    expect(cn('base', undefined, null)).toBe('base');
  });
});

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2024-06-15T18:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2024-06-15T18:00:00Z'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('generatePollaCode', () => {
  it('generates a 6-character code', () => {
    const code = generatePollaCode();
    expect(code).toHaveLength(6);
  });

  it('only uses allowed characters', () => {
    const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 20; i++) {
      const code = generatePollaCode();
      for (const char of code) {
        expect(allowed).toContain(char);
      }
    }
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 50 }, generatePollaCode));
    expect(codes.size).toBeGreaterThan(40); // probabilidad de colisión es baja
  });
});
