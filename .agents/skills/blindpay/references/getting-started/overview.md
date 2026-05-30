# Overview

## Introduction

BlindPay is a global payment infrastructure that enables worldwide money transfers using both traditional fiat currencies and stablecoins.

**Key Features:**

- **Universal Wallet Support**: Compatible with all types of blockchain wallets, including Externally Owned Accounts (EOA) and Account Abstraction (AA) wallets
- **Multi-Token Support**: Accepts popular stablecoins including USDC and USDT
- **Multi-Chain Compatibility**: Operates across major networks including Mainnet, Base, Arbitrum, Polygon, Stellar and Tron

> **Important**: BlindPay does not provide wallet services. We operate as a non-custodial payment processor, meaning your funds remain under your control throughout the entire process. In case of any failed transactions, funds are automatically returned to the originating wallet.

## Payout Flow of Funds

Payouts convert stablecoins to fiat and send to bank accounts.

![BlindPay payout flow of funds](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/blindpay-payouts-flow-of-funds.png)

- **Step 1: Token Authorization**: Your blockchain wallet approves BlindPay to access the specified amount of stablecoins using the standard ERC-20 approval mechanism. This gives us permission to transfer only the exact amount needed for your transaction.

- **Step 2: Token Collection & Fiat Conversion**: Once authorized, we collect the approved stablecoins from your wallet and immediately initiate the fiat currency transfer through local banking networks. This includes ACH transfers and wire transfers in the US, Pix payments in Brazil, and other region-specific payment rails.

- **Step 3: Settlement Confirmation**: After receiving confirmation from the receiving bank that the fiat transfer has been successfully completed, we finalize the payout transaction. Your recipient receives their funds in their local currency.

> If we can't settle the fiat transfer or it gets returned, the funds will be returned to the same wallet that started the payment.

## Payin Flow of Funds

Payins convert fiat to stablecoins and send to blockchain wallets.

![BlindPay payin flow of funds](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/blindpay-payins-flow-of-funds.png)

- **Step 1: Fiat Deposit**: Funds are transferred from your traditional bank account to either our designated BlindPay bank account or a unique Virtual Account created specifically for your transaction. Virtual Accounts provide additional security and easier transaction tracking.

- **Step 2: Stablecoin Delivery**: Once we confirm receipt of your fiat deposit, we immediately mint or transfer the equivalent amount of stablecoins to your specified blockchain wallet address. The conversion happens at real-time market rates with transparent fees.
