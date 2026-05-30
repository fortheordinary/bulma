# Partner Fees

## What are Partner Fees?

Partner fees allow you to earn revenue from every transaction processed through BlindPay. You can add these fees on top of each transaction, and BlindPay will automatically collect them from your customers and share them with you at the end of each payin and payout.

## Types of Partner Fees

You can configure two types of fees:

1. **Percentage Fees**: A percentage of the transaction amount
2. **Flat Fees**: A fixed amount per transaction

These fees can be set independently for:

- Payins (fiat to stablecoin)
- Payouts (stablecoin to fiat)

## Configuring Partner Fees

1. Go to the [BlindPay Dashboard](https://app.blindpay.com/)
2. Navigate to `Settings > Partner Fees`
3. Configure your desired fees for both payins and payouts

## Partner Fee Tracking in API Responses

### Partner Fee Amount

Each payin quote and payout quote object includes a `partner_fee_amount` field:

```json
{
  "id": "qu_000000000000",
  "amount": "100.00",
  "partner_fee_amount": "1.00"
}
```

### Partner Fee Tracking Object

You'll also see a `tracking_partner_fee` object with real-time status updates:

```json
{
  "id": "po_000000000000",
  "tracking_partner_fee": {
    "step": "on_hold",
    "transaction_hash": "0x1234567890abcdef...",
    "completed_at": "2024-01-15T14:30:00.000Z"
  }
}
```

This allows you to:

- Monitor the status of your partner fee delivery
- Get the transaction hash when the fee is delivered
- Know exactly when the fee was completed

## Fee Collection and Distribution

- Fees are automatically collected from your customers during each transaction
- Partner fees are delivered to your account when the transaction is completed
- You'll receive a `payout.partnerFee` or `payin.partnerFee` webhook event when fees are delivered
- Track fee delivery status through the `tracking_partner_fee` object in API responses

## Example

If you configure:
- A 1% fee for payins
- A $1 flat fee for payouts

For a $100 payin:
- Your customer pays $101 ($100 + 1% fee)
- You receive $1 in partner fees
- API response shows `partner_fee_amount: "1.00"`

For a $100 payout:
- Your customer pays $101 ($100 + $1 flat fee)
- You receive $1 in partner fees
- API response shows `partner_fee_amount: "1.00"`

## Best Practices

- Consider your business model when setting fees
- Be transparent with your customers about any additional fees
- Monitor your fee earnings through the dashboard
- Use webhooks to track fee deliveries in real-time
- Check the `tracking_partner_fee` object to monitor fee delivery status
