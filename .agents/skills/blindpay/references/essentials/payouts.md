# Payouts

## What is a Payout?

A payout is an operation that moves funds from the sender's wallet to the receiver's bank account.

The payout **can only be executed if a quote was created previously**, and **you have 5 minutes to execute the payout before the quote expires**.

## How to Mint USDB (Test Token)

USDB is a fake ERC20 stablecoin powered by BlindPay to simulate payouts on `development` instances.

### EVM Chains

You can mint infinite USDB, but you need ETH in your wallet for gas fees. Get testnet ETH from [https://www.alchemy.com/faucets/base-sepolia](https://www.alchemy.com/faucets/base-sepolia).

Then mint USDB at: `https://app.blindpay.com/instances/<instance_id>/utilities/mint`

### Stellar

You can mint USDB on Stellar Testnet.

**Step 1: Create Asset Trustline (Only required once)**

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/{instance_id}/create-asset-trustline \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "address": "YOUR_ADDRESS"
  }'
```

**Step 2: Sign and Submit the Trustline Transaction**

Sign the returned XDR and submit to Stellar network, or pass the `signedXdr` to the mint endpoint.

**Step 3: Mint USDB Tokens**

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/{instance_id}/mint-usdb-stellar \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "address": "YOUR_WALLET_ADDRESS",
    "amount": "1000000000000000000",
    "signedXdr": "YOUR_SIGNED_XDR"
  }'
```

### Solana

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/{instance_id}/mint-usdb-solana \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "address": "YOUR_WALLET_ADDRESS",
    "amount": "100"
  }'
```

## Token Approval (EVM Chains)

For EVM chains, all stablecoins supported by BlindPay are ERC20 tokens, so you need to call the `approve` method on the token contract to allow BlindPay to move the funds.

The quote response includes all contract details needed:

```javascript
import { ethers } from 'ethers'

// From quote response
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
```

## Creating a Payout on EVM Chains

Before creating a payout, you need to:

1. Create a receiver
2. Add a bank account
3. Generate a quote
4. Approve the tokens

> **Remember**: Replace `qu_000000000000` with the quote ID and `sender_wallet_address` with the wallet that approved the tokens.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/payouts/evm \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "quote_id": "qu_000000000000",
    "sender_wallet_address": "<Replace this>"
  }'
```

## Creating a Payout on Stellar

### Step 1: Authorize the Token

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/{instance_id}/payouts/stellar/authorize \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "quote_id": "qu_000000000000",
    "sender_wallet_address": "<Replace this>"
  }'
```

### Step 2: Sign and Submit Transaction

```javascript
import { TransactionBuilder, Networks, Keypair } from '@stellar/stellar-sdk'

const transaction = TransactionBuilder.fromXDR(transactionHash, Networks.TESTNET)
const signedTransaction = stellarWallet.sign(transaction)
const result = await stellar.submitTransaction(signedTransaction)
```

### Step 3: Create the Payout

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/payouts/stellar \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "quote_id": "qu_000000000000",
    "signed_transaction": "<signed_transaction>",
    "sender_wallet_address": "<Replace this>"
  }'
```

## Creating a Payout on Solana

### Step 1: Prepare Delegation

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/{instance_id}/prepare-delegate-solana \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "owner_address": "YOUR_SOLANA_WALLET_ADDRESS",
    "token_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "50000000"
  }'
```

### Step 2: Sign and Submit Delegation

```javascript
import { Connection, VersionedTransaction } from '@solana/web3.js'

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const transactionBuffer = Buffer.from(serializedTransaction, 'base64')
const transaction = VersionedTransaction.deserialize(transactionBuffer)
const signedTransaction = await window.solana.signTransaction(transaction)
const signature = await connection.sendTransaction(signedTransaction)
```

### Step 3: Create the Payout

Use the same `/payouts/evm` endpoint for Solana:

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/payouts/evm \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "quote_id": "qu_000000000000",
    "sender_wallet_address": "YOUR_SOLANA_WALLET_ADDRESS"
  }'
```

## Testing Scenarios

By default all payouts are automatically completed in 'development' instances.

| Amount | Result Status |
|--------|---------------|
| Any amount | Completed (default) |
| $666.00 | Failed |
| $777.00 | Refunded |
