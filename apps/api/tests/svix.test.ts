import { describe, expect, it } from 'bun:test';
import { computeSvixSignature, verifySvix } from '../src/lib/svix';

const VECTOR = {
  secret: 'whsec_plJ3nmyCDGBKInavdOK15jsl',
  payload: '{"event_type":"ping","data":{"success":true}}',
  msgId: 'msg_loFOjxBNrRLzqYUf',
  timestamp: '1731705121',
  expectedSig: 'rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
};

describe('computeSvixSignature', () => {
  it('matches BlindPay-documented vector', async () => {
    const sig = await computeSvixSignature({
      msgId: VECTOR.msgId,
      timestamp: VECTOR.timestamp,
      payload: VECTOR.payload,
      secret: VECTOR.secret,
    });
    expect(sig).toBe(VECTOR.expectedSig);
  });
});

describe('verifySvix', () => {
  const baseNow = Number(VECTOR.timestamp) * 1000;

  it('accepts valid v1 signature within drift window', async () => {
    const result = await verifySvix(
      {
        svixId: VECTOR.msgId,
        svixTimestamp: VECTOR.timestamp,
        svixSignature: `v1,${VECTOR.expectedSig}`,
        payload: VECTOR.payload,
        secret: VECTOR.secret,
      },
      baseNow,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts when multiple space-delimited signatures are present', async () => {
    const result = await verifySvix(
      {
        svixId: VECTOR.msgId,
        svixTimestamp: VECTOR.timestamp,
        svixSignature: `v1,wrongsig= v1,${VECTOR.expectedSig}`,
        payload: VECTOR.payload,
        secret: VECTOR.secret,
      },
      baseNow,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects invalid signature', async () => {
    const result = await verifySvix(
      {
        svixId: VECTOR.msgId,
        svixTimestamp: VECTOR.timestamp,
        svixSignature: 'v1,wrongbase64sig==',
        payload: VECTOR.payload,
        secret: VECTOR.secret,
      },
      baseNow,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_signature');
  });

  it('rejects stale timestamp (> 5 min drift)', async () => {
    const result = await verifySvix(
      {
        svixId: VECTOR.msgId,
        svixTimestamp: VECTOR.timestamp,
        svixSignature: `v1,${VECTOR.expectedSig}`,
        payload: VECTOR.payload,
        secret: VECTOR.secret,
      },
      baseNow + 10 * 60 * 1000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
  });

  it('rejects malformed headers', async () => {
    const result = await verifySvix(
      {
        svixId: '',
        svixTimestamp: VECTOR.timestamp,
        svixSignature: `v1,${VECTOR.expectedSig}`,
        payload: VECTOR.payload,
        secret: VECTOR.secret,
      },
      baseNow,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('malformed');
  });
});
