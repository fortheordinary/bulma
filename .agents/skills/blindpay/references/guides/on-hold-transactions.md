# On Hold Transactions

## Overview

On hold transactions are payins or payouts that BlindPay's transaction monitoring system flagged as suspicious.

This is important to prevent fraudulent activities, money laundering, and maintain a healthy relationship with our banking partners.

## How to Handle On Hold Transactions

When a transaction is flagged as suspicious, BlindPay's compliance team will manually review the transaction and check if it's a false positive.

If it's not a false positive, BlindPay will send you an email (or Slack message) with the details of the transaction and a Request for Information (RFI) to provide more information.

### RFI Information Requested

- What is the relationship between the sender and the receiver
- What is the purpose of the transaction
- What is the expected outcome of the transaction
- Any other information that can help us understand the transaction

Once you provide the information, BlindPay's compliance team will review and decide whether to release the transaction.

> **Warning**: If you don't provide the information in the RFI within **24 hours**, the transaction might be refunded to the sender.

## Webhook Integration

You can track on hold transactions via webhooks:

1. You receive a webhook with `on_hold` status
2. Respond to the RFI through BlindPay's communication channels
3. BlindPay team reviews and releases or refunds the transaction
