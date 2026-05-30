# Virtual Accounts

## What is a Virtual Account?

A virtual account is a dedicated US bank account that can be generated for each of your receivers. Each virtual account comes with its own unique **routing number** and **account number**, enabling your customers to send and receive payments throughout the United States banking system.

These accounts function like regular bank accounts but are managed through the BlindPay platform.

> All incoming payments to this virtual account will automatically generate a payin. Transaction fees will be charged on your invoice at the end of each billing cycle.

## KYC Requirements

Virtual account creation is currently **only available for**:

- **US citizens** with Social Security Number (SSN)
- **US companies** with Employer Identification Number (EIN)
- Receivers with Enhanced KYC

> We are working to expand virtual account availability to additional countries in the future.

## Payment Rails Supported

| Type | Country | Estimated Time of Arrival |
|------|---------|---------------------------|
| ACH | US | ~2 business days |
| Domestic Wire | US | ~1 business day |
| International Wire | US | ~5 business days |
| RTP | US | ~5 minutes |

> These accounts are allowed to send and collect third-party payments.

## Generating a Virtual Account

Before generating a virtual account, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Create a receiver with SSN (for US citizens) or EIN (for US companies)
5. Add a blockchain wallet

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key, `in_000000000000` with your instance ID, and `re_000000000000` with your receiver ID.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/virtual-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "token": "USDC",
    "blockchain_wallet_id": "bw_000000000000"
  }'
```
