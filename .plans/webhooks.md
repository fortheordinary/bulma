# Webhooks (`POST /webhooks/blindpay`)

## Responsibilities

1. **Verify** signature (svix HMAC-SHA256, constant-time).
2. **Deduplicate** by `svix-id` against `webhook_events.id`.
3. **Persist** raw payload immediately (durability before dispatch).
4. **Dispatch** to event-specific handlers idempotently.
5. **Respond 2xx fast** — heavy work (RPC calls, BlindPay calls) handed off to Cloudflare Queues / DOs, not awaited synchronously, to keep webhook ack < 1s.

## Endpoint shape

```ts
app.post('/webhooks/blindpay', async (c) => {
  const id = c.req.header('svix-id');
  const ts = c.req.header('svix-timestamp');
  const sig = c.req.header('svix-signature');
  const raw = await c.req.text();
  if (!verifySvix({ id, ts, sig, raw, secret: c.env.BLINDPAY_WEBHOOK_SECRET })) {
    return c.json({ error: 'invalid_signature' }, 401);
  }
  if (Math.abs(Date.now()/1000 - Number(ts)) > 300) {
    return c.json({ error: 'stale' }, 400);
  }
  // dedupe + persist
  const existing = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).get();
  if (existing) return c.json({ ok: true, deduplicated: true });
  const event = JSON.parse(raw);
  await db.insert(webhookEvents).values({
    id, eventType: event.event_type, payload: raw, receivedAt: Math.floor(Date.now()/1000),
  });
  // enqueue async dispatch — do not await BlindPay or RPC calls here
  c.executionCtx.waitUntil(dispatch(event, c.env));
  return c.json({ ok: true });
});
```

> `crypto.timingSafeEqual` for sig compare. Use raw bytes from secret (`base64-decode(secret.split('_')[1])`).

## Event handlers

### `receiver.update` — status `approved`

Critical event. Triggers wallet + virtual account provisioning. All three BlindPay objects (receiver / wallet / virtual account) live in BlindPay; Bulma stores only the ids on `user_profile`.

```ts
async function onReceiverApproved(event, env) {
  const receiverId = event.data.id;
  const userId = await getUserIdByReceiver(receiverId, event); // via clientReferenceId we set at /onboard/start
  if (!userId) return; // foreign receiver, ignore

  await db.transaction(async (tx) => {
    const profile = await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).get();
    const patch: Partial<UserProfile> = {
      receiverId, onboardingState: 'approved',
    };

    if (!profile?.walletId) {
      // BlindPay's secure-method blockchain wallet. We do NOT custody — BlindPay handles signing.
      const wallet = await blindpay.POST(`/receivers/${receiverId}/blockchain-wallets`, {
        name: 'Primary', network: 'polygon',
      });
      patch.walletId = wallet.id;
    }

    if (!profile?.virtualAccountId && walletEligibleForUsVa(profile)) {
      const va = await blindpay.POST(`/receivers/${receiverId}/virtual-accounts`, {
        token: 'USDC', blockchain_wallet_id: patch.walletId ?? profile.walletId,
      });
      patch.virtualAccountId = va.id;
    }

    patch.onboardingState = 'ready';
    await tx.update(userProfile).set(patch).where(eq(userProfile.userId, userId));
  });

  await onUserOnboarded(userId); // see referrals.md
}
```

> The exact BlindPay call shape for "create blockchain wallet" depends on whether their hosted KYC link covers the wallet step internally (in which case we just record the `bw_…` from a later event) or expects us to call `POST /blockchain-wallets`. Confirm during Phase 3 — both branches are idempotent on `user_profile.wallet_id IS NULL`.

### `receiver.update` — status `rejected`

Set `user_profile.onboarding_state = 'rejected'`. Persist `kyc_warnings` into `webhook_events.payload` (no dedicated column). Do not provision. CLI surfaces via `GET /onboard/status`.

### `bankAccount.new`

No local mirror table. Treat as informational — `webhook_events` row is enough; the next `bulma recipient list` call fetches the fresh list from BlindPay.

### `payout.new` / `payout.update` / `payout.complete`

Update `payouts.status`, `payouts.failure_code`, `payouts.completed_at`. On `complete` with status `refunded` and the payout had `referralCreditApplied = true`, **return the credit** (flip credit row back to `available`).

### `payin.*`

Track payments into the virtual account. Out of MVP scope — webhook handler 200-OKs and persists to `webhook_events` for later replay.

### `tos.accept`

Persist `event.data.tos_id` into `user_profile.tos_id`. Required field on every subsequent quote.

### `limitIncrease.*`, `payin.partnerFee`, `payout.partnerFee`

Persist + ignore in MVP.

## Configuration

| Env var                     | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `BLINDPAY_WEBHOOK_SECRET`   | Worker secret; `whsec_…` from BlindPay dashboard.                  |
| `BLINDPAY_API_KEY`          | For outbound calls from webhook handler.                            |
| `BLINDPAY_INSTANCE_ID`      | `in_…` injected into URLs.                                          |

## Replay + back-pressure

- BlindPay retries failed webhooks. Our handler is idempotent by `svix-id` + per-event handler idempotency (existence checks before insert).
- If a handler throws after persisting `webhook_events`, mark `error` column; provide an admin route `POST /admin/webhooks/replay?id=…` to re-dispatch from stored payload.
- For high-volume events (payouts), shard via Cloudflare Queues so a slow handler doesn't backpressure the verification endpoint.

## Testing

- Unit-test `verifySvix` against the example in the BlindPay docs (`msg_loFOjxBNrRLzqYUf` + `1731705121` + payload → `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=`).
- Integration: use `wrangler dev` + `curl` to POST a forged-but-signed `receiver.update approved` payload, observe `user_profile.{receiver_id, wallet_id, virtual_account_id}` populate and `onboarding_state` flip to `ready`.
