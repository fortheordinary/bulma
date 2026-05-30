# Instances

## What is an Instance?

An instance is an environment in which you can try all BlindPay features.

If your company has multiple environments (sandbox, staging, production), you can create a single instance for each one.

You **cannot** create instances through the API; you must create them through the [BlindPay Dashboard](https://app.blindpay.com/).

## Development vs Production

> **Remember**: All payouts made on development instances will not go through the fiat payment rails, so all fiat payment steps will be skipped.

| Feature | Development | Production |
|---------|-------------|------------|
| Receivers | ✅ | ✅ |
| Bank Accounts | ✅ | ✅ |
| Payout Quotes | ✅ | ✅ |
| Payouts | ✅ | ✅ |
| Payin Quotes | ✅ | ✅ |
| Payins | ✅ | ✅ |
| KYC | Auto approve | Automatic or manual review |
| Networks | Eth Sepolia, Base Sepolia, Arbitrum Sepolia, Polygon Amoy, Stellar Testnet | Base, Polygon, Arbitrum, Stellar |
| API Keys | ✅ | ✅ |
| Webhooks | ✅ | ✅ |

## Creating an Instance

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Go to the [BlindPay Dashboard](https://app.blindpay.com/)
3. Click on the `Create instance` button
