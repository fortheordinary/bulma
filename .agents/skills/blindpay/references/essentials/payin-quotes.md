# Payin Quotes

## What is a Payin Quote?

A payin quote will show you how much you or your customers need to send in fiat money and how much the receiver is going to receive in stablecoins.

For example, if you want to onramp `1,000 USD` to a receiver with a blockchain wallet on Polygon network, the quote will show that you need to send `1,000 USD` and the receiver will receive approximately `990 USDC` (after fees).

## Fee Payment Options

BlindPay provides two ways of paying for the fees:

### Receiver Pays Fees (Default)

The fees are calculated based on the stablecoin (USDC, USDT) that the receiver is going to receive.

Set `cover_fees` to `false` in the API request.

### Sender Pays Fees

The fees are calculated based on the fiat currency (USD, BRL) that the sender is going to send.

Set `cover_fees` to `true` in the API request.

## Creating a Payin Quote

Before creating a payin quote, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Create a receiver
5. Add a blockchain wallet

> **Important**: We do not accept float values for `request_amount`. If you want to send `$123.45`, fill `12345` (amount in cents).

> **Note**: All examples below use `USDB` which is only supported on development instances. In production, use `USDC` or `USDT`.

### US ACH

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

### US Wire

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
    "payment_method": "wire",
    "token": "USDB"
  }'
```

### Brazil PIX

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payin-quotes \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "blockchain_wallet_id": "bw_000000000000",
    "currency_type": "sender",
    "cover_fees": false,
    "request_amount": 10000,
    "payment_method": "pix",
    "token": "USDB",
    "payer_rules": {
      "pix_allowed_tax_ids": ["14747677786"]
    }
  }'
```

### Mexico SPEI

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payin-quotes \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "blockchain_wallet_id": "bw_000000000000",
    "currency_type": "sender",
    "cover_fees": false,
    "request_amount": 100000,
    "payment_method": "spei",
    "token": "USDB"
  }'
```

### Argentina Transfers 3.0

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payin-quotes \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "blockchain_wallet_id": "bw_000000000000",
    "currency_type": "sender",
    "cover_fees": false,
    "request_amount": 2000000,
    "payment_method": "transfers",
    "token": "USDB",
    "payer_rules": {
      "transfers_allowed_tax_id": "30-27383762-7"
    }
  }'
```

### Colombia PSE

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payin-quotes \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "blockchain_wallet_id": "bw_000000000000",
    "currency_type": "sender",
    "cover_fees": false,
    "request_amount": 20000000,
    "payment_method": "pse",
    "token": "USDB",
    "payer_rules": {
      "pse_full_name": "<payer full name>",
      "pse_document_type": "NIT",
      "pse_document_number": "<payer document number>",
      "pse_email": "<payer email>",
      "pse_phone": "<payer phone number>",
      "pse_bank_code": "<payer bank code>"
    }
  }'
```

## Quote Expiration

Payin quotes are valid for **5 minutes**. After expiration, you need to create a new quote.
