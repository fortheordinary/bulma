# Referrals

## Mechanic (from product spec)

> Every onboarded user gets 5 referral codes. Every referral code that converts to an onboarded user gives the owner one free payout (zero fees on the next payout). Once a free-payout credit is consumed, the converted code's slot resets (returns to `available` so the owner can issue a new code). **If you share all 5 codes and none convert, you lose all future referrals from those slots.**

Restating in invariants:

1. Each user owns exactly 5 referral code slots, created on `onboarding_state` → `ready`.
2. Slot states: `available` → (user shares) → `shared` → (a referee onboards) → `converted` → (owner uses their free payout) → reset back to `available`.
3. Conversion is gated on the *referee* completing onboarding (reaching `onboarding_state='ready'`), not on signup.
4. The earned credit is one zero-fee payout per converted code; credit is consumed at payout execution.
5. **Forfeit rule**: if all 5 slots are simultaneously `shared` (none converted) and any of them subsequently expires without converting, the owner forfeits **all** remaining `shared` slots — they flip to `expired` and the user gets no further referral credits from this batch. (Confirm interpretation — see [open-questions.md](open-questions.md).)

## State machine per slot

```
        share()                convert(refereeUserId)            consume()
available ─────▶ shared ─────────────────────▶ converted ──────────────▶ available
   ▲                │                              │                         │
   │                │ all_shared_no_convert        │                         │
   │                ▼                              │                         │
   │             expired ◀────────────────────────────────────────────────────
   │                                               │
   └──────────────── reset on payout consume ──────┘
```

## Earning + consuming credits

- Conversion fires from the onboarding webhook handler — `onUserOnboarded(refereeUserId)` (see [webhooks.md](webhooks.md)):
  ```ts
  async function onUserOnboarded(refereeUserId) {
    const codeUsed = await db.select().from(referralCodes)
      .where(and(eq(referralCodes.refereeUserId, refereeUserId), eq(referralCodes.status, 'shared')))
      .get();
    if (!codeUsed) return;
    await db.transaction(async (tx) => {
      await tx.update(referralCodes).set({
        status: 'converted', convertedUserId: refereeUserId, convertedAt: now(),
      }).where(eq(referralCodes.id, codeUsed.id));
      await tx.insert(referralCredits).values({
        id: uuid(), userId: codeUsed.ownerUserId, sourceCodeId: codeUsed.id, status: 'available',
      });
    });
  }
  ```

  > The referee enters the code at onboarding start (`POST /onboard/start` accepts optional `referralCode`). We lookup the code, flip it to `shared` and stamp the referee's user id. If onboarding completes, conversion fires; if it stalls/fails, the code stays `shared` (and may eventually `expire`).

- Consumption at payout:
  ```ts
  // inside POST /payouts/execute when useReferralCredit=true
  const credit = await tx.select().from(referralCredits)
    .where(and(eq(referralCredits.userId, user.id), eq(referralCredits.status, 'available')))
    .orderBy(asc(referralCredits.createdAt)).limit(1).get();
  if (!credit) throw NoCreditAvailable;
  await tx.update(referralCredits).set({
    status: 'consumed', consumedPayoutId: payout.id, consumedAt: now(),
  }).where(eq(referralCredits.id, credit.id));
  // reset slot back to available
  await tx.update(referralCodes).set({
    status: 'available', refereeUserId: null, convertedUserId: null,
    convertedAt: null, sharedAt: null, code: newCode(),
  }).where(eq(referralCodes.id, credit.sourceCodeId));
  ```

  > Code value is regenerated on reset to avoid the old code being reused by a stale share link.

## Free-payout application

Two viable implementations (decision in [open-questions.md](open-questions.md)):

| Option                                            | Description                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Bulma swallows the fee**                     | Quote with `cover_fees: true` so receiver gets the full amount; the extra USDC needed is funded from a Bulma treasury wallet.        |
| **B. BlindPay partner-fee waiver / promotion**    | If BlindPay supports a per-call partner-fee override (TBD with their team), set the override at quote time.                          |

A is independent of BlindPay; ship first.

## Forfeit rule implementation

Trigger: after every "share" action, check if all 5 slots are now in `shared` status with `converted_at IS NULL`. If so, start a 30-day forfeit timer (TBD — could also be event-driven: forfeit immediately on first share-of-the-fifth, or after time elapses). Recommended: time-based — gives the user a fair window:

```sql
-- nightly cron job (Cloudflare Cron Trigger):
UPDATE referral_codes
   SET status = 'expired'
 WHERE owner_user_id IN (
   SELECT owner_user_id FROM referral_codes
    GROUP BY owner_user_id
   HAVING SUM(status = 'shared') = 5
      AND SUM(status = 'converted') = 0
      AND MIN(shared_at) < unixepoch() - 60*60*24*30
 )
   AND status = 'shared';
```

After expiry, the user does not get fresh slots (per spec: "you'll lose all your referrals"). They may still earn credits via *future* programs / promotions, but not via these expired slots.

## CLI surface

See [commands.md](commands.md#bulma-referral). Display table per the spec, plus credits balance.

Owner-side share UX (TBD how codes are physically shared — emails? deep-link to bulma signup with code prefilled? → [open-questions.md](open-questions.md)):

```
$ bulma referral share KRT8MN
Share your invite:
  https://bul.ma/i/KRT8MN

The recipient must finish onboarding for you to earn the free payout.
4 slots remaining.
```

## Edge cases

| Case                                                                 | Behavior                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Two referees use the same code (race)                                | DB unique constraint on `(code, status='shared')`; first attach wins, second gets "code taken".   |
| Referee onboards then deletes account before owner consumes credit   | Credit stays valid; deletion of referee user doesn't affect awarded credit.                       |
| Owner deletes account                                                | Cascade: revoke credits, expire codes.                                                            |
| Self-referral (user uses own code)                                   | Block at `POST /onboard/start` — same `user.id` for owner and referee → error.                    |
| Multiple credits accumulate                                          | Consume FIFO. CLI shows count. No transfer between users.                                         |
| Refund of a payout that used a credit                                | Webhook `payout.complete status=refunded` returns credit (`available` again, slot stays reset).   |
