import { describe, expect, it } from 'bun:test';
import {
  formatUsdCents,
  tokenAmountToCents,
  walletBalanceToCents,
} from '../src/lib/money';

describe('tokenAmountToCents', () => {
  it('converts a decimal token amount to cents', () => {
    expect(tokenAmountToCents(1234.56)).toBe(123456);
    expect(tokenAmountToCents(1)).toBe(100);
    expect(tokenAmountToCents(0.1)).toBe(10);
    expect(tokenAmountToCents(0.01)).toBe(1);
  });

  it('rounds float artifacts to the nearest cent', () => {
    expect(tokenAmountToCents(19.99)).toBe(1999);
    expect(tokenAmountToCents(0.07)).toBe(7);
    expect(tokenAmountToCents(0.29)).toBe(29);
  });

  it('treats zero / non-positive / non-finite as 0', () => {
    expect(tokenAmountToCents(0)).toBe(0);
    expect(tokenAmountToCents(-5)).toBe(0);
    expect(tokenAmountToCents(Number.NaN)).toBe(0);
    expect(tokenAmountToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('walletBalanceToCents (mocked upstream balance map)', () => {
  const upstream = {
    USDC: { address: '0xusdc', id: '', symbol: 'USDC', amount: 0 },
    USDT: { address: '', id: '', symbol: 'USDT', amount: 0 },
    USDB: { address: '0xusdb', id: 'uuid', symbol: 'USDB', amount: 42.5 },
  };

  it('selects the configured token and converts to cents', () => {
    expect(walletBalanceToCents(upstream, 'USDB')).toBe(4250);
  });

  it('returns 0 for a zero balance', () => {
    expect(walletBalanceToCents(upstream, 'USDC')).toBe(0);
  });

  it('returns 0 when the token symbol is absent', () => {
    expect(walletBalanceToCents(upstream, 'EURC')).toBe(0);
  });
});

describe('formatUsdCents', () => {
  it('formats cents as USD with thousands separators', () => {
    expect(formatUsdCents(123456)).toBe('$1,234.56');
    expect(formatUsdCents(0)).toBe('$0.00');
    expect(formatUsdCents(5)).toBe('$0.05');
    expect(formatUsdCents(100000000)).toBe('$1,000,000.00');
  });
});
