# Payout Quotes

## What is a Payout Quote?

A quote will show you how much you or your customers need to send in stablecoins and how much the receiver is going to receive in fiat.

For example, if you want to send `1,000 USDC` to a receiver with a bank account in the United States, the quote will show that you need to send `1,000 USDC` and the receiver will receive approximately `$999` (after fees).

## Fee Payment Options

BlindPay provides two ways of paying for the fees:

### Receiver Pays Fees (Default)

The fees are calculated based on the fiat currency (USD, BRL) that the receiver is going to receive.

Set `cover_fees` to `false` in the API request.

### Sender Pays Fees

The fees are calculated based on the stablecoins (USDC) that the sender is going to send. This is particularly relevant when running payroll.

Set `cover_fees` to `true` in the API request.

## SWIFT Documents

For SWIFT payouts, you must submit the following fields. **The document MUST show a relationship between the originator and the recipient**.

> The originator is the receiver you created, and the recipient is the bank account.

- `transaction_document_type`: Document type
- `transaction_document_id` (optional): Document ID number
- `transaction_document_file`: Document file URL

### Accepted Document Types

- `invoice`: Invoice
- `purchase_order`: Purchase Order
- `delivery_slip`: Delivery Slip
- `contract`: Contract
- `customs_declaration`: Customs Declaration
- `bill_of_lading`: Bill of Lading
- `others`: Others

> For 1st party payouts, you can select "others" and upload a blank document stating: "1st party payout".

## Creating a Quote

Before creating a quote, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Create a receiver
5. Add a bank account

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key, `in_000000000000` with your instance ID, and `ba_000000000000` with your bank account ID.

> **Important**: We do not accept float values for `request_amount`. If you want to send `1.23 USDC`, fill `123` (amount in cents).

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/quotes \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "bank_account_id": "ba_000000000000",
    "currency_type": "sender",
    "cover_fees": false,
    "request_amount": 1000,
    "network": "sepolia",
    "token": "USDC"
  }'
```

### SWIFT Payout Quote Example

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/quotes \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "bank_account_id": "ba_000000000000",
    "currency_type": "sender",
    "cover_fees": false,
    "request_amount": 1000,
    "network": "sepolia",
    "token": "USDC",
    "transaction_document_type": "invoice",
    "transaction_document_id": "1234567890",
    "transaction_document_file": "https://example.com/document.pdf"
  }'
```

## Quote Expiration

Quotes are valid for **5 minutes**. After expiration, you need to create a new quote.
