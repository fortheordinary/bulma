import { describe, expect, it } from 'bun:test';
import {
  type BlockchainWalletRef,
  isVirtualAccountEligible,
  type ManagedWalletRef,
  pickManagedWallet,
  pickVirtualAccountPlan,
  type VirtualAccountRef,
} from '../src/lib/onboard';

describe('pickManagedWallet', () => {
  const wallet = (id: string): ManagedWalletRef => ({
    id,
    address: `0x${id}`,
  });

  it('reuses the first existing wallet', () => {
    expect(pickManagedWallet([wallet('a'), wallet('b')])).toEqual(wallet('a'));
  });

  it('returns null when none exist (signals create)', () => {
    expect(pickManagedWallet([])).toBeNull();
  });
});

describe('isVirtualAccountEligible', () => {
  it('is eligible regardless of country (BlindPay always issues a US VA)', () => {
    expect(isVirtualAccountEligible(null)).toBe(true);
    expect(isVirtualAccountEligible(undefined)).toBe(true);
    expect(isVirtualAccountEligible('US')).toBe(true);
    expect(isVirtualAccountEligible('us')).toBe(true);
    expect(isVirtualAccountEligible('BR')).toBe(true);
    expect(isVirtualAccountEligible('AR')).toBe(true);
    expect(isVirtualAccountEligible('GB')).toBe(true);
  });
});

describe('pickVirtualAccountPlan', () => {
  const va = (id: string): VirtualAccountRef => ({ id });
  const bridge = (
    over: Partial<BlockchainWalletRef> = {},
  ): BlockchainWalletRef => ({
    id: 'bw_1',
    address: '0xWALLET',
    is_account_abstraction: true,
    ...over,
  });

  it('skips when ineligible', () => {
    expect(pickVirtualAccountPlan(false, '0xabc', [], [])).toEqual({
      kind: 'skip',
    });
  });

  it('skips when there is no wallet address', () => {
    expect(pickVirtualAccountPlan(true, null, [], [])).toEqual({
      kind: 'skip',
    });
  });

  it('reuses the first existing virtual account', () => {
    expect(
      pickVirtualAccountPlan(true, '0xabc', [va('va_1'), va('va_2')], []),
    ).toEqual({ kind: 'reuse', virtualAccountId: 'va_1' });
  });

  it('creates reusing a matching AA bridge (case-insensitive address)', () => {
    expect(
      pickVirtualAccountPlan(true, '0xwallet', [], [bridge()]),
    ).toEqual({ kind: 'create', bridgeId: 'bw_1' });
  });

  it('creates with no bridge when address does not match', () => {
    expect(
      pickVirtualAccountPlan(true, '0xother', [], [bridge()]),
    ).toEqual({ kind: 'create', bridgeId: null });
  });

  it('creates with no bridge when match is not account-abstraction', () => {
    expect(
      pickVirtualAccountPlan(true, '0xwallet', [], [
        bridge({ is_account_abstraction: false }),
      ]),
    ).toEqual({ kind: 'create', bridgeId: null });
  });

  it('prefers reuse over bridge creation when both are available', () => {
    expect(
      pickVirtualAccountPlan(true, '0xwallet', [va('va_1')], [bridge()]),
    ).toEqual({ kind: 'reuse', virtualAccountId: 'va_1' });
  });
});
