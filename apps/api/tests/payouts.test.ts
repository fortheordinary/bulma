import { describe, expect, it } from 'bun:test';
import {
  isQuoteExpired,
  isTerminalStatus,
  normalizePayoutStatus,
  parseUsdToCents,
} from '../src/lib/payouts';

describe('normalizePayoutStatus', () => {
  it('maps terminal statuses (any case)', () => {
    expect(normalizePayoutStatus('completed')).toBe('completed');
    expect(normalizePayoutStatus('COMPLETED')).toBe('completed');
    expect(normalizePayoutStatus('failed')).toBe('failed');
    expect(normalizePayoutStatus('refunded')).toBe('refunded');
  });
  it('treats in-flight / unknown / empty as pending', () => {
    expect(normalizePayoutStatus('processing')).toBe('pending');
    expect(normalizePayoutStatus('on_hold')).toBe('pending');
    expect(normalizePayoutStatus('')).toBe('pending');
    expect(normalizePayoutStatus(null)).toBe('pending');
    expect(normalizePayoutStatus(undefined)).toBe('pending');
  });
});

describe('isTerminalStatus', () => {
  it('pending is not terminal; the rest are', () => {
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('refunded')).toBe(true);
  });
});

describe('isQuoteExpired (quotes valid 5 min, ms epoch)', () => {
  const now = 1_780_000_000_000;
  it('expired when now >= expiresAt', () => {
    expect(isQuoteExpired(now - 1, now)).toBe(true);
    expect(isQuoteExpired(now, now)).toBe(true);
  });
  it('valid while in the future', () => {
    expect(isQuoteExpired(now + 5 * 60_000, now)).toBe(false);
  });
});

describe('parseUsdToCents', () => {
  it('parses plain and decimal amounts', () => {
    expect(parseUsdToCents('10')).toBe(1000);
    expect(parseUsdToCents('10.5')).toBe(1050);
    expect(parseUsdToCents('10.50')).toBe(1050);
    expect(parseUsdToCents('0.99')).toBe(99);
    expect(parseUsdToCents(10)).toBe(1000);
  });
  it('strips $ and thousands separators', () => {
    expect(parseUsdToCents('$1,234.56')).toBe(123456);
  });
  it('recognizes the dev magic amounts in cents', () => {
    expect(parseUsdToCents('666')).toBe(66600); // -> Failed on dev
    expect(parseUsdToCents('777')).toBe(77700); // -> Refunded on dev
  });
  it('rejects non-positive / malformed / over-precise', () => {
    expect(parseUsdToCents('0')).toBeNull();
    expect(parseUsdToCents('-5')).toBeNull();
    expect(parseUsdToCents('abc')).toBeNull();
    expect(parseUsdToCents('10.555')).toBeNull();
    expect(parseUsdToCents('')).toBeNull();
  });
});
