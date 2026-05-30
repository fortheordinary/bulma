import { describe, expect, it } from 'bun:test';
import {
  attachDecision,
  generateReferralCode,
  isForfeitEligible,
  isOrphanedReservation,
  isValidReferralCode,
  shareLink,
  type AttachableCode,
  type ForfeitSlot,
  type ReservationRow,
} from '../src/lib/referrals';

describe('generateReferralCode', () => {
  it('is a valid 6-char code with no ambiguous chars', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateReferralCode();
      expect(isValidReferralCode(code)).toBe(true);
      expect(code).not.toMatch(/[01IO]/);
    }
  });
  it('is reasonably unique', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateReferralCode());
    expect(seen.size).toBeGreaterThan(495);
  });
});

describe('isValidReferralCode', () => {
  it('accepts 6-char alphabet codes, rejects others', () => {
    expect(isValidReferralCode('ABCDEF')).toBe(true);
    expect(isValidReferralCode('KRT8MN')).toBe(true);
    expect(isValidReferralCode('abcdef')).toBe(false);
    expect(isValidReferralCode('ABCDE')).toBe(false);
    expect(isValidReferralCode('ABCDEFG')).toBe(false);
    expect(isValidReferralCode('ABC0EF')).toBe(false); // 0 excluded
    expect(isValidReferralCode('ABCIEF')).toBe(false); // I excluded
  });
});

describe('attachDecision', () => {
  const base: AttachableCode = {
    ownerUserId: 'us_owner',
    status: 'shared',
    convertedUserId: null,
  };

  it('allows a fresh shared/available code', () => {
    expect(attachDecision(base, 'us_referee')).toBe('ok');
    expect(attachDecision({ ...base, status: 'available' }, 'us_referee')).toBe('ok');
  });
  it('blocks self-referral', () => {
    expect(attachDecision(base, 'us_owner')).toBe('self_referral');
  });
  it('blocks an already-claimed or converted code', () => {
    expect(attachDecision({ ...base, convertedUserId: 'us_other' }, 'us_referee')).toBe('already_used');
    expect(attachDecision({ ...base, status: 'converted', convertedUserId: 'us_other' }, 'us_referee')).toBe('already_used');
  });
  it('blocks an expired code', () => {
    expect(attachDecision({ ...base, status: 'expired' }, 'us_referee')).toBe('expired');
  });
  it('allows the ownerless bootstrap code (INITIAL) for anyone', () => {
    const seed: AttachableCode = { ownerUserId: null, status: 'available', convertedUserId: null };
    expect(attachDecision(seed, 'us_anyone')).toBe('ok');
  });
});

describe('isForfeitEligible', () => {
  const now = 1_800_000_000;
  const oldShare = now - 60 * 60 * 24 * 31; // 31 days ago
  const sharedSlot = (sharedAt: number): ForfeitSlot => ({
    status: 'shared',
    sharedAt,
    convertedAt: null,
  });

  it('forfeits 5 stale shared slots with no conversion', () => {
    const slots = Array.from({ length: 5 }, () => sharedSlot(oldShare));
    expect(isForfeitEligible(slots, now)).toBe(true);
  });
  it('does not forfeit when fewer than 5 slots', () => {
    expect(isForfeitEligible([sharedSlot(oldShare)], now)).toBe(false);
  });
  it('does not forfeit when any slot converted', () => {
    const slots = Array.from({ length: 5 }, () => sharedSlot(oldShare));
    slots[0] = { status: 'shared', sharedAt: oldShare, convertedAt: now - 100 };
    expect(isForfeitEligible(slots, now)).toBe(false);
  });
  it('does not forfeit within the window', () => {
    const recent = now - 60 * 60 * 24 * 5; // 5 days ago
    const slots = Array.from({ length: 5 }, () => sharedSlot(recent));
    expect(isForfeitEligible(slots, now)).toBe(false);
  });
  it('does not forfeit when not all slots are shared', () => {
    const slots = Array.from({ length: 5 }, () => sharedSlot(oldShare));
    slots[0] = { status: 'available', sharedAt: null, convertedAt: null };
    expect(isForfeitEligible(slots, now)).toBe(false);
  });
});

describe('isOrphanedReservation', () => {
  const now = 1_800_000_000;
  const grace = 60 * 15;
  const stale = now - grace - 1;
  const fresh = now - grace + 1;

  it('flags a reserved credit with no payout past the grace window', () => {
    const c: ReservationRow = { status: 'consumed', consumedPayoutId: null, consumedAt: stale };
    expect(isOrphanedReservation(c, now, grace)).toBe(true);
  });
  it('does not flag a reservation still within the grace window', () => {
    const c: ReservationRow = { status: 'consumed', consumedPayoutId: null, consumedAt: fresh };
    expect(isOrphanedReservation(c, now, grace)).toBe(false);
  });
  it('does not flag a committed credit (payout linked)', () => {
    const c: ReservationRow = { status: 'consumed', consumedPayoutId: 'po_1', consumedAt: stale };
    expect(isOrphanedReservation(c, now, grace)).toBe(false);
  });
  it('does not flag an available or expired credit', () => {
    expect(
      isOrphanedReservation({ status: 'available', consumedPayoutId: null, consumedAt: null }, now, grace),
    ).toBe(false);
    expect(
      isOrphanedReservation({ status: 'expired', consumedPayoutId: null, consumedAt: stale }, now, grace),
    ).toBe(false);
  });
});

describe('shareLink', () => {
  it('builds an /i/<code> link and trims a trailing slash', () => {
    expect(shareLink('https://bul.ma', 'KRT8MN')).toBe('https://bul.ma/i/KRT8MN');
    expect(shareLink('http://localhost:5173/', 'ABCDEF')).toBe('http://localhost:5173/i/ABCDEF');
  });
});
