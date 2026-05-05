import { describe, it, expect } from 'vitest';
import { normalizeMatchStatus } from './match-status';

describe('normalizeMatchStatus', () => {
  it('returns known statuses as-is', () => {
    expect(normalizeMatchStatus('FT')).toBe('FT');
    expect(normalizeMatchStatus('AFT')).toBe('AFT');
    expect(normalizeMatchStatus('NS')).toBe('NS');
    expect(normalizeMatchStatus('1H')).toBe('1H');
    expect(normalizeMatchStatus('HT')).toBe('HT');
    expect(normalizeMatchStatus('2H')).toBe('2H');
    expect(normalizeMatchStatus('ET')).toBe('ET');
    expect(normalizeMatchStatus('P')).toBe('P');
    expect(normalizeMatchStatus('CANC')).toBe('CANC');
    expect(normalizeMatchStatus('LIVE')).toBe('LIVE');
    expect(normalizeMatchStatus('TBD')).toBe('TBD');
    expect(normalizeMatchStatus('PST')).toBe('PST');
    expect(normalizeMatchStatus('SUSP')).toBe('SUSP');
    expect(normalizeMatchStatus('INT')).toBe('INT');
    expect(normalizeMatchStatus('AET')).toBe('AET');
    expect(normalizeMatchStatus('PEN')).toBe('PEN');
    expect(normalizeMatchStatus('ABD')).toBe('ABD');
    expect(normalizeMatchStatus('AWD')).toBe('AWD');
    expect(normalizeMatchStatus('WO')).toBe('WO');
    expect(normalizeMatchStatus('BT')).toBe('BT');
  });

  it('returns NS for unknown statuses', () => {
    expect(normalizeMatchStatus('UNKNOWN')).toBe('NS');
    expect(normalizeMatchStatus('XYZ')).toBe('NS');
    expect(normalizeMatchStatus('Finished')).toBe('NS');
  });

  it('returns NS for undefined input', () => {
    expect(normalizeMatchStatus(undefined)).toBe('NS');
  });

  it('returns NS for empty string', () => {
    expect(normalizeMatchStatus('')).toBe('NS');
  });

  it('is case-sensitive for known statuses', () => {
    expect(normalizeMatchStatus('ft')).toBe('NS');
    expect(normalizeMatchStatus('Ft')).toBe('NS');
  });
});
