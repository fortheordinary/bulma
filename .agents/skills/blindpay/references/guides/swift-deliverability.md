# SWIFT Deliverability

Learn how to increase the chances of your SWIFT transfers being delivered.

## Overview

SWIFT is a global payment system that allows you to send and receive money internationally. BlindPay uses only tier 1 banks to process SWIFT transfers.

## Compliance

For every B2B payment sent through SWIFT, it's mandatory to provide a transaction document that shows the **relationship between the sender and the receiver**.

### Accepted Transaction Documents

- [Invoice](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/invoice-template.pdf)
- [Purchase Order](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/purchase-order-template.pdf)
- [Delivery Slip](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/delivery-slip-template.pdf)
- [Contract](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/contract-template.pdf)
- [Customs Declaration](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/customs-declaration-template.pdf)
- [Bill of Lading](https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/bill-of-lading-template.pdf)
- Others

> **Important**: If the document doesn't show the relationship between the sender and the receiver, the payment will be rejected.

## How to Add a SWIFT Account

1. Access your instance → open **Receivers** from the sidebar menu → open the customer profile
2. Open **Bank Accounts** → select **International Swift**
3. Fill in the SWIFT account details:
   - Use **CAPSLOCK only**
   - No punctuation (no commas, periods, or special characters)
   - ✅ Correct: `JPMORGAN CHASE BANK NA SINGAPORE`
   - ❌ Incorrect: `J.P. Morgan Chase Bank, N.A. or Singapore.`
4. If the SWIFT code has only 8 characters, add XXX at the end:
   - `CHASSGSG` becomes `CHASSGSGXXX`
5. Click **Create**

## Beneficiary Address Requirements

All address elements combined must not exceed **140 characters**.

### Address Structure

| Field | Max Length | Notes |
|-------|------------|-------|
| Address Line 1 | 70 chars (combined with Line 2) | Street name, building number |
| Address Line 2 | (see above) | Office, apartment, floor |
| City | 35 chars | Full city name |
| State/Province Code | 2 chars | ISO code, or repeat country code if N/A |
| Postal Code | 16 chars | Alphanumeric only |
| Country Code | 2 chars | ISO 3166-1 alpha-2 |

### Special Postal Code Rules

| Country | Postal Code |
|---------|-------------|
| Hong Kong | 999077 |
| UAE | 00000 |

### Example: Correctly Formatted Address

```
Addr1: 123 Gran Via Bldg A
Addr2: Suite 405
City: Madrid
State: ES
Postal Code: 28013
Country: ES
```

Full combined output (must be ≤ 140 chars):
`123 Gran Via Bldg A Suite 405 Madrid ES 28013 ES` (59 characters)

### Example: Converting a Long Address

**Original (too long):**
```
Building 12, Zone C, Longhua Science & Technology Industrial Park,
Minzhi Street, Longhua New District, Shenzhen City, Guangdong Province, China 518131
```

**SWIFT-compatible:**
```
Addr1: Bldg 12 Zone C Longhua Sci-Tech Ind Park
Addr2: Minzhi St
City: Shenzhen
State: CN
Postal Code: 518131
Country: CN
```

## Address Submission Checklist

Before submitting an address, verify:

- [ ] Addr1 + Addr2 ≤ 70 characters
- [ ] City ≤ 35 characters
- [ ] State is exactly 2 letters
- [ ] Postal code ≤ 16 alphanumeric characters
- [ ] Country is exactly 2 letters
- [ ] Entire address ≤ 140 characters
- [ ] Address contains no unsupported symbols
