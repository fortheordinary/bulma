# Stable to Fiat (Payout Quick Start)

This guide walks you through sending your first payout with BlindPay.

## Prerequisites

Before you start, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Mint USDB on Base Sepolia Testnet (for testing)

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

After you get the URL, open it in your browser, accept the terms, and get the `tos_id`. This `tos_id` is necessary for creating receivers.

## Step 2: Create a Receiver

Run the code below to create a new receiver. All receivers on `development` instances will be automatically approved by our KYC.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "tos_id": "to_fuu6PrnGEHhl",
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
    "phone_number": "+1234567890",
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

## Step 3: Add a Bank Account

In this example we're adding an existing ACH bank account from the US. Replace `beneficiary_name`, `routing_number`, and `account_number` with your own information.

> **Remember**: Replace `re_000000000000` with your receiver ID from the previous step.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "ach",
    "name": "Display Name",
    "beneficiary_name": "<Replace this>",
    "routing_number": "<Replace this>",
    "account_number": "<Replace this>",
    "account_type": "checking",
    "account_class": "individual"
  }'
```

## Step 4: Create a Payout

This example uses JavaScript with ethers.js to create a payout on Base Sepolia Testnet.

### Install Dependencies

```bash
npm init
npm install express ethers
```

### Create index.js

```javascript
import express from 'express'
import { ethers } from 'ethers'

const app = express()

app.get('/', async (req, res) => {
  // Configuration
  const rpcProviderUrl = '<Replace this>' // Get from https://chainlist.org/
  const walletPrivateKey = '<Replace this>' // Wallet with ETH and USDB
  const instanceId = '<Replace this>'
  const blindpayApiKey = '<Replace this>'
  const bankAccountId = '<Replace this>'

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${blindpayApiKey}`
  }

  // Step 1: Create a quote
  const fiftyDollars = 5000 // Amount in cents
  const quoteBody = {
    bank_account_id: bankAccountId,
    currency_type: 'sender',
    cover_fees: false,
    request_amount: fiftyDollars,
    network: 'base_sepolia',
    token: 'USDB' // On development instance, always use USDB
  }

  const createQuote = await fetch(
    `https://api.blindpay.com/v1/instances/${instanceId}/quotes`,
    { headers, method: 'POST', body: JSON.stringify(quoteBody) }
  )
  const quoteResponse = await createQuote.json()

  // Step 2: Approve tokens
  const provider = new ethers.JsonRpcProvider(rpcProviderUrl, quoteResponse.contract.network)
  const yourWallet = new ethers.Wallet(walletPrivateKey, provider)
  const contract = new ethers.Contract(
    quoteResponse.contract.address,
    quoteResponse.contract.abi,
    provider
  )
  const contractSigner = contract.connect(yourWallet)

  await contractSigner.approve(
    quoteResponse.contract.blindpayContractAddress,
    quoteResponse.contract.amount
  )

  // Step 3: Execute payout
  const senderWalletAddress = await yourWallet.getAddress()
  const payoutBody = {
    quote_id: quoteResponse.id,
    sender_wallet_address: senderWalletAddress
  }

  const executePayout = await fetch(
    `https://api.blindpay.com/v1/instances/${instanceId}/payouts/evm`,
    { headers, method: 'POST', body: JSON.stringify(payoutBody) }
  )
  const payoutResponse = await executePayout.json()

  res.send(payoutResponse)
})

app.listen(3000)
console.log('Express started on port 3000')
```

### Run the Code

```bash
node index.js
```

Access [http://localhost:3000](http://localhost:3000) to see the result.

## Summary

You've completed your first payout using BlindPay! To execute more payouts, create a new quote and approve the tokens again.

## Testing Scenarios

| Amount | Result Status |
|--------|---------------|
| Any amount | Completed (default) |
| $666.00 | Failed |
| $777.00 | Refunded |
