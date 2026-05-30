# Webhooks

## What are Webhooks?

Webhooks are a way to receive events from all BlindPay updates. For every receiver created, bank account created, and every payout/payin event, you will receive all the data in real time.

## Available Events

| Event | Description |
|-------|-------------|
| `bankAccount.new` | Triggered when a bank account is created |
| `receiver.new` | Triggered when a receiver is created |
| `receiver.update` | Triggered when a receiver is updated |
| `payout.new` | Triggered when a payout is started |
| `payout.update` | Triggered when a payout receives an update |
| `payout.complete` | Triggered when a payout is completed, failed, or refunded |
| `payout.partnerFee` | Triggered when a payout is completed and a partner fee is delivered |
| `payin.new` | Triggered when a payin is started |
| `payin.update` | Triggered when a payin receives an update |
| `payin.complete` | Triggered when a payin is completed or failed |
| `payin.partnerFee` | Triggered when a payin is completed and a partner fee is delivered |
| `tos.accept` | Triggered when terms of service is accepted |
| `limitIncrease.new` | Triggered when a limit increase request is requested |
| `limitIncrease.update` | Triggered when a limit increase request is updated |

## Creating a Webhook

1. Go to the [BlindPay Dashboard](https://app.blindpay.com/)
2. Select an instance
3. Click on the `Webhooks` tab
4. Add your webhook URL

For testing, you can use [Webhook Cool](https://webhook.cool/) to get a unique URL to receive events.

## Verifying Webhooks

Each webhook call includes verification headers to ensure the request is authentic.

### Headers

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier (same when webhook is resent) |
| `svix-timestamp` | Timestamp in seconds since epoch |
| `svix-signature` | Base64 encoded list of signatures (space delimited) |

### Verification Process

**Step 1**: Construct the signed content

```javascript
const signedContent = `${svix_id}.${svix_timestamp}.${body}`
```

**Step 2**: Calculate the expected signature using HMAC-SHA256

```javascript
const crypto = require('node:crypto')

// Extract the base64 portion of your signing secret (after whsec_ prefix)
const secretBytes = require('node:buffer').Buffer.from(secret.split('_')[1], 'base64')

const signature = crypto
  .createHmac('sha256', secretBytes)
  .update(signedContent)
  .digest('base64')
```

**Step 3**: Compare signatures

The `svix-signature` header contains space-delimited signatures with version prefixes (e.g., `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=`).

- Remove the version prefix (e.g., `v1,`) before comparing
- Use constant-time string comparison to prevent timing attacks

**Step 4**: Verify timestamp

Compare `svix-timestamp` against your system time to prevent replay attacks.

### Example Verification

> To get your `secret`, go to BlindPay Dashboard > Open your instance > Webhooks > Click on the ellipsis button and click on `Get secret`.

```javascript
const crypto = require('node:crypto')

// Example values
const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl'
const payload = '{"event_type":"ping","data":{"success":true}}'
const msg_id = 'msg_loFOjxBNrRLzqYUf'
const timestamp = '1731705121'

// Construct signed content
const signedContent = `${msg_id}.${timestamp}.${payload}`

// Calculate signature
const secretBytes = require('node:buffer').Buffer.from(secret.split('_')[1], 'base64')

const signature = crypto
  .createHmac('sha256', secretBytes)
  .update(signedContent)
  .digest('base64')

console.log(`v1,${signature}`)
// Expected: v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=
```

> **Warning**: Never modify the request body before verification, as even small changes will invalidate the signature.
