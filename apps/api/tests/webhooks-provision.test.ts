import { describe, expect, it } from 'bun:test';
import {
  isVirtualAccountEligible,
  pickManagedWallet,
  pickVirtualAccountPlan,
} from '../src/routes/webhooks';

const MANAGED = { id: 'bl_u4JwQgOipBtx', address: '0xDAD703c5C06d4359e935B63939d8408600768ff5' };
const ADDR = MANAGED.address.toLowerCase();

describe('pickManagedWallet (idempotency: no double-provisioning)', () => {
  it('reuses the first existing wallet instead of creating one', () => {
    expect(pickManagedWallet([MANAGED])).toEqual(MANAGED);
  });

  it('reuses the first when several exist', () => {
    const second = { id: 'bl_other', address: '0xabc' };
    expect(pickManagedWallet([MANAGED, second])).toEqual(MANAGED);
  });

  it('returns null (signal create) when none exist', () => {
    expect(pickManagedWallet([])).toBeNull();
  });
});

describe('isVirtualAccountEligible', () => {
  it('is eligible for any country (BlindPay always issues a US VA)', () => {
    expect(isVirtualAccountEligible('US')).toBe(true);
    expect(isVirtualAccountEligible('us')).toBe(true);
    expect(isVirtualAccountEligible(undefined)).toBe(true);
    expect(isVirtualAccountEligible(null)).toBe(true);
    expect(isVirtualAccountEligible('BR')).toBe(true);
    expect(isVirtualAccountEligible('MX')).toBe(true);
  });
});

describe('pickVirtualAccountPlan', () => {
  it('non-US receiver skips VA creation', () => {
    expect(pickVirtualAccountPlan(false, ADDR, [], [])).toEqual({ kind: 'skip' });
  });

  it('skips when wallet address is missing', () => {
    expect(pickVirtualAccountPlan(true, null, [], [])).toEqual({ kind: 'skip' });
  });

  it('reuses an existing VA (idempotency: no second VA)', () => {
    const plan = pickVirtualAccountPlan(true, ADDR, [{ id: 'va_YNtV9z7KIkFo' }], []);
    expect(plan).toEqual({ kind: 'reuse', virtualAccountId: 'va_YNtV9z7KIkFo' });
  });

  it('reuses a matching AA bridge wallet when creating', () => {
    const bridges = [
      { id: 'bw_nonAA', address: ADDR, is_account_abstraction: false },
      { id: 'bw_other', address: '0xdeadbeef', is_account_abstraction: true },
      { id: 'bw_match', address: MANAGED.address, is_account_abstraction: true },
    ];
    const plan = pickVirtualAccountPlan(true, ADDR, [], bridges);
    expect(plan).toEqual({ kind: 'create', bridgeId: 'bw_match' });
  });

  it('matches the bridge address case-insensitively', () => {
    const bridges = [{ id: 'bw_match', address: MANAGED.address.toUpperCase(), is_account_abstraction: true }];
    const plan = pickVirtualAccountPlan(true, ADDR, [], bridges);
    expect(plan).toEqual({ kind: 'create', bridgeId: 'bw_match' });
  });

  it('signals bridge creation (bridgeId null) when no AA bridge matches', () => {
    const bridges = [{ id: 'bw_nonAA', address: ADDR, is_account_abstraction: false }];
    const plan = pickVirtualAccountPlan(true, ADDR, [], bridges);
    expect(plan).toEqual({ kind: 'create', bridgeId: null });
  });
});
