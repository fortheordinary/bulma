import { describe, expect, it } from 'bun:test';
import {
  generateDeviceCode,
  generateUserCode,
  isValidUserCodeFormat,
} from '../src/lib/codes';

describe('generateUserCode', () => {
  it('produces XXXX-XXXX format', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateUserCode();
      expect(isValidUserCodeFormat(code)).toBe(true);
    }
  });

  it('never emits ambiguous chars (0, 1, I, O)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateUserCode();
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it('respects injected RNG', () => {
    const fixed = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const code = generateUserCode(() => fixed);
    expect(code).toBe('ABCD-EFGH');
  });
});

describe('generateDeviceCode', () => {
  it('is 64-char hex (32 bytes)', () => {
    const code = generateDeviceCode();
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is unique across many calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateDeviceCode());
    expect(seen.size).toBe(200);
  });
});

describe('isValidUserCodeFormat', () => {
  it('accepts valid codes', () => {
    expect(isValidUserCodeFormat('WDJB-MJHT')).toBe(true);
    expect(isValidUserCodeFormat('ABCD-EFGH')).toBe(true);
  });

  it('rejects malformed codes', () => {
    expect(isValidUserCodeFormat('WDJBMJHT')).toBe(false);
    expect(isValidUserCodeFormat('WDJB-MJH')).toBe(false);
    expect(isValidUserCodeFormat('WDJB-MJHT-')).toBe(false);
    expect(isValidUserCodeFormat('wdjb-mjht')).toBe(false);
    expect(isValidUserCodeFormat('WDJ1-MJHT')).toBe(false);
    expect(isValidUserCodeFormat('WDJO-MJHT')).toBe(false);
  });
});
