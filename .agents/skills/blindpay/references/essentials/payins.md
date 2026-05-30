# Payins

## What is a Payin?

A payin is an operation that moves funds from the sender's bank account to the receiver's blockchain wallet.

The payin **can only be executed if a payin quote was created previously**, and **you have 5 minutes to initiate the payin before the quote expires**.

> For US payments, receivers with enabled virtual accounts will have their own virtual account details displayed. For receivers without virtual accounts, BlindPay will generate a unique memo code and provide BlindPay's bank account details.

## Development vs Production

On development instances, all payins are automatically paid **30 seconds after initiation**.

On production, the system waits for the actual payment to arrive:

| Payment Method | Currency | Waiting Time | Data to Share |
|----------------|----------|--------------|---------------|
| ACH | USD | 5 business days | `memo_code` (if no virtual account) and `blindpay_bank_details` |
| Wire | USD | 5 business days | `memo_code` (if no virtual account) and `blindpay_bank_details` |
| PIX | BRL | 5 minutes | `pix_code` as copyable text or QR code |
| CLABE | MXN | 5 minutes | `clabe` as copyable text |
| Transfers | ARS | 5 minutes | `cbu` as copyable text |
| PSE | COP | 5 minutes | Payment link |

## Initiating a Payin

Before creating a payin, you need to:

1. Create a receiver
2. Add a blockchain wallet
3. Generate a payin quote

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key, `in_000000000000` with your instance ID, and `pq_000000000000` with the payin quote ID.

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/payins/evm \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "payin_quote_id": "pq_000000000000"
  }'
```

## Blockchain Network Support

BlindPay supports payins on multiple blockchain networks:

- **EVM Chains**: Ethereum, Polygon, Base, Arbitrum (USDC, USDT)
- **Stellar**: Stellar mainnet and testnet (USDC)
- **Solana**: Solana mainnet and devnet (USDC, USDT)

When you create a blockchain wallet with a Solana address, BlindPay will automatically detect the network type and handle the token transfer accordingly once the fiat payment is confirmed.

## Testing Scenarios

By default all payins are automatically completed in 'development' instances.

| Amount | Result Status |
|--------|---------------|
| Any amount | Completed (default) |
| $666.00 | Failed |
| $777.00 | Refunded |
