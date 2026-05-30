# Blockchain Wallets

## What is a Blockchain Wallet for BlindPay?

BlindPay operates solely as a transfer service and does not provide its own digital wallets. All wallet interactions are conducted with **externally owned blockchain wallets**.

To use this feature, you'll need to add one or more wallet addresses where you or your customers wish to receive stablecoin transfers after the payin process is completed.

## Supported Blockchains

| Chain Name | Chain ID | Instance Type |
|------------|----------|---------------|
| Ethereum | 1 | Production |
| Polygon | 137 | Production |
| Base | 8453 | Production |
| Arbitrum | 42161 | Production |
| Stellar | - | Production |
| Solana | - | Production |
| Tron (beta) | - | Production |
| Ethereum Sepolia | 11155111 | Development |
| PoS Amoy | 80002 | Development |
| Base Sepolia | 84532 | Development |
| Arbitrum Sepolia | 421614 | Development |
| Stellar Testnet | - | Development |
| Solana Devnet | - | Development |

## Secure Method (Recommended)

With this method, you can attach a blockchain wallet without asking for the wallet address directly. This involves signing a message to verify ownership.

### Step 1: Get the Message to Sign

```bash
curl https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/blockchain-wallets/sign-message \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

### Step 2: Sign the Message

Use wagmi, ethers.js, or any signing library:

```javascript
import { signMessage } from '@wagmi/core'

const message = '<retrieved_from_blindpay_api>'

const signature_tx_hash = await signMessage(wagmiConfig, {
  message,
})
```

### Step 3: Add the Blockchain Wallet

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/blockchain-wallets \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "John",
    "network": "polygon",
    "is_account_abstraction": false,
    "signature_tx_hash": "0x..."
  }'
```

## Direct Method (Account Abstraction Wallets)

We don't recommend using this method because **if the funds are sent to the wrong address, the funds will be lost.**

On this method you can set the `is_account_abstraction` field to `true` and fill the `address` field with the wallet address.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/blockchain-wallets \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "John",
    "network": "polygon",
    "is_account_abstraction": true,
    "address": "0x..."
  }'
```
