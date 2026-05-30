# Offramp Wallets

## What is an Offramp Wallet?

An offramp wallet is a blockchain wallet that BlindPay will create for you.

For every USDC or USDT transaction sent to this wallet, BlindPay will automatically convert to fiat and send to your bank account.

BlindPay will **ALWAYS** create a payout automatically when the wallet receives a USDC or USDT transaction.

## Supported Blockchains and Stablecoins

| Chain Name | Stablecoins Supported | Minimum | Additional Fee |
|------------|----------------------|---------|----------------|
| Tron | Only USDT | 200 USDT | 15 USDT |
| Solana | Only USDC | 50 USDC | 0 USDC |

## Fee Calculation Example

Let's say you send **100 USDT** to an offramp wallet connected to an ACH bank account (assuming 1 USDT = $1 USD):

**Step 1**: Convert USDT to USD
- 100 USDT = $100.00 USD

**Step 2**: Deduct fees in this order:
1. **Additional fee**: 15 USDT = $15.00 USD
2. **Percentage fee**: 0.1% of total amount = 0.1% × $100.00 = $0.10
3. **Bank transfer fee**: $0.40 (ACH processing fee)

**Final calculation**:
$100.00 - $15.00 - $0.10 - $0.40 = **$84.50** sent to recipient's bank account.

## Creating an Offramp Wallet

Before creating an offramp wallet, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Create a receiver
5. Add a bank account

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key, `in_000000000000` with your instance ID, `re_000000000000` with your receiver ID, and `ba_000000000000` with your bank account ID.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts/ba_000000000000/offramp-wallets \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "network": "tron"
  }'
```
