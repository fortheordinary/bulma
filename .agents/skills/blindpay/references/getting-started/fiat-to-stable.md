# Fiat to Stable (Payin Quick Start)

This guide walks you through receiving your first payin with BlindPay.

## Prerequisites

Before you start, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key

## Step 1: Accept Terms of Service

For testing purposes you can accept the terms of service by yourself. For production, **you should make your customer accept the terms**.

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key and `in_000000000000` with your instance ID.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/e/instances/in_000000000000/tos \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "idempotency_key": "<your_uuid>"
  }'
```

After you get the URL, open it in your browser, accept the terms, and get the `tos_id`.

## Step 2: Create a Receiver

All receivers on `development` instances will be automatically approved by our KYC.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "tos_id": "<replace_with_your_tos_id>",
    "type": "individual",
    "kyc_type": "standard",
    "email": "email@example.com",
    "tax_id": "12345678",
    "address_line_1": "8 The Green",
    "address_line_2": "#12345",
    "city": "Dover",
    "state_province_region": "DE",
    "country": "US",
    "postal_code": "02050",
    "ip_address": "127.0.0.1",
    "phone_number": "+13022006100",
    "proof_of_address_doc_type": "UTILITY_BILL",
    "proof_of_address_doc_file": "https://example.com/proof-of-address.jpg",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "1998-01-01T00:00:00Z",
    "id_doc_country": "US",
    "id_doc_type": "PASSPORT",
    "id_doc_front_file": "https://example.com/passport-front.jpg",
    "selfie_file": "https://example.com/selfie.png"
  }'
```

## Step 3: Add a Blockchain Wallet

Add an external blockchain wallet where you want to receive stablecoins.

### Secure Method (Recommended)

First, get the message to sign:

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/blockchain-wallets/sign-message \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

Sign the message using wagmi or ethers.js:

```javascript
import { signMessage } from '@wagmi/core'

const message = '<retrieved_from_blindpay_api>'
const signature_tx_hash = await signMessage(wagmiConfig, { message })
```

Then add the wallet with the signature:

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/blockchain-wallets \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "My Wallet",
    "network": "polygon",
    "is_account_abstraction": false,
    "signature_tx_hash": "0x..."
  }'
```

### Direct Method (Account Abstraction Wallets)

For AA wallets, you can add the address directly:

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/blockchain-wallets \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "My Wallet",
    "network": "polygon",
    "is_account_abstraction": true,
    "address": "0x..."
  }'
```

> **Warning**: We don't recommend the direct method because if the funds are sent to the wrong address, the funds will be lost.

## Step 4: Create a Payin Quote

Create a quote to see how much fiat you need to send and how much stablecoin you'll receive.

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payin-quotes \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "blockchain_wallet_id": "bw_000000000000",
    "currency_type": "sender",
    "cover_fees": true,
    "request_amount": 10000,
    "payment_method": "ach",
    "token": "USDB"
  }'
```

> **Note**: On development instances, use `USDB` as the token. In production, use `USDC` or `USDT`.

### Payment Methods

| Method | Country | Example |
|--------|---------|---------|
| `ach` | US | ACH bank transfer |
| `wire` | US | Wire transfer |
| `pix` | Brazil | PIX instant payment |
| `spei` | Mexico | SPEI transfer |
| `transfers` | Argentina | Transfers 3.0 |
| `pse` | Colombia | PSE payment |

## Step 5: Initiate the Payin

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payins/evm \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "payin_quote_id": "pq_000000000000"
  }'
```

The response will include payment instructions:

| Payment Method | Data Provided |
|----------------|---------------|
| ACH/Wire | `memo_code` and `blindpay_bank_details` |
| PIX | `pix_code` (copyable text or QR code) |
| SPEI | `clabe` code |
| Transfers | `cbu` code |
| PSE | Payment link |

## Step 6: Send the Fiat

On development instances, payins are automatically paid **30 seconds after initiation**.

On production, send the fiat using the provided payment instructions. Once BlindPay confirms receipt, stablecoins will be sent to your blockchain wallet.

## Summary

You've initiated your first payin using BlindPay! To initiate more payins, generate a new payin quote and repeat the process.

## Testing Scenarios

| Amount | Result Status |
|--------|---------------|
| Any amount | Completed (default) |
| $666.00 | Failed |
| $777.00 | Refunded |
