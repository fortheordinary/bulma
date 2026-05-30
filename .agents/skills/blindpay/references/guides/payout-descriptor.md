# Payout Descriptor

Payout descriptors determine how the sender's name appears on the recipient's bank statement when they receive payments through BlindPay. The descriptor varies based on the payment method and the receiver's account configuration.

## ACH

For ACH payments, the payout descriptor depends on the receiver's virtual account setup:

| Receiver Configuration | Payout Descriptor |
|------------------------|-------------------|
| No Virtual Account | BlindPay's name |
| With Virtual Account | BlindPay's name |
| With Virtual Account and Named Account enabled | Receiver's name |

### Named Account Configuration

To enable named accounts for a receiver:

1. Specify which receiver (customer) you want to enable named accounts for
2. Allow BlindPay **5 business days** to process and enable this feature

Once enabled, recipients will see the receiver's actual name on their bank statements instead of BlindPay's name.

## Domestic Wire

| Scenario | Payout Descriptor |
|----------|-------------------|
| All wire transfers | Partner bank name |

This descriptor appears for all wire transfers, providing consistency and compliance with banking regulations.

## RTP (Real-Time Payments)

| Scenario | Payout Descriptor |
|----------|-------------------|
| All RTP transfers | BlindPay's name |

## PIX (Brazil)

| Scenario | Payout Descriptor |
|----------|-------------------|
| All PIX transfers | BlindPay's name |

## SPEI (Mexico)

| Scenario | Payout Descriptor |
|----------|-------------------|
| All SPEI transfers | BlindPay's name |

## ACH Colombia

| Scenario | Payout Descriptor |
|----------|-------------------|
| All ACH Colombia transfers | Nvio Pagos |

## Transfers 3.0 (Argentina)

| Scenario | Payout Descriptor |
|----------|-------------------|
| All Transfers 3.0 | Nvio Pagos |
