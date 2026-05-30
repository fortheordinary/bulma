# Receivers

## What is a Receiver?

A receiver is an individual or business entity designated to interact with BlindPay.

For compliance and regulatory requirements, **every customer on your platform must be registered as a receiver in BlindPay**. This is a mandatory step to ensure proper transaction tracking and reporting. If any of your customers operate as money transmitters (entities that transfer funds on behalf of others), they are also required to register their end customers as receivers in the system.

You can attach multiple bank accounts and blockchain wallets to a receiver.

## Compliance and KYC

Every receiver is required to go through a KYC process to verify their identity.

### KYC/B Standard

Fields marked with `*` are optional.

| Individual | Business |
|------------|----------|
| First name | Legal name |
| Last name | Tax ID |
| Date of birth | Formation date |
| Email | Email |
| Country | Country |
| Tax ID | Doing business as* |
| Phone number | Website* |
| IP Address | IP Address |
| Address 1 | Address 1 |
| Address 2* | Address 2* |
| City | City |
| State/province/region | State/province/region |
| Postal code | Postal code |
| ID Document - Country | UBOs + Shareholders above 25% |
| ID Document - Type | Company Formation Document |
| ID Document - Front | Proof of Ownership Document |
| ID Document - Back* | Proof of Address - Type* |
| Proof of Address - Type* | Proof of Address - Document* |
| Proof of Address - Document* | |
| Selfie File | |

### KYC Enhanced

All receivers from high risk countries must go through Enhanced KYC.

Everything from KYC/B standard, plus:

| Individual |
|------------|
| Source of Funds Document Type |
| Source of Funds Document File |
| Purpose of Transactions |
| Purpose of Transactions Explanation |

> All individuals on Enhanced KYC will be manually verified by BlindPay compliance team. This process can take up to 3 business days.

## Review Timeline

| Verification Type | Review Timeline |
|-------------------|-----------------|
| KYC Standard | 30 seconds |
| KYC Enhanced | 3 hours to 3 business days |
| KYB Standard | 3 hours to 3 business days |

## KYC Statuses

- **`verifying`**: The receiver's KYC is currently being processed
- **`approved`**: The receiver's KYC has been successfully verified
- **`rejected`**: The receiver's KYC has been rejected

### KYC Warnings

When a receiver's KYC is rejected, BlindPay provides feedback in the `kyc_warnings` or `fraud_warnings` field.

To retry the KYC process after a rejection, you'll need to create a brand new receiver with the corrected information.

## Payout & Payin Limits

| | KYC Standard | KYB Standard | KYC Enhanced |
|-|--------------|--------------|--------------|
| Per transaction | US$ 10,000 | US$ 30,000 | US$ 50,000 |
| Daily | US$ 50,000 | US$ 100,000 | US$ 100,000 |
| Monthly | US$ 100,000 | US$ 250,000 | US$ 500,000 |

> Limits can be increased upon submission of additional documentation using the limit increase API endpoint.

## Creating a Receiver

Before creating a receiver, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Get tos_id from terms of service acceptance

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key and `in_000000000000` with your instance ID.

### Standard KYC (Individual)

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "tos_id": "<replace_with_your_tos_id>",
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
    "phone_number": "+13022006100",
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

### Enhanced KYC (Individual)

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "tos_id": "<replace_with_your_tos_id>",
    "type": "individual",
    "kyc_type": "enhanced",
    "email": "email@example.com",
    "tax_id": "123456788",
    "address_line_1": "8 The Green",
    "address_line_2": "#12345",
    "city": "Dover",
    "state_province_region": "DE",
    "country": "US",
    "postal_code": "02050",
    "ip_address": "127.0.0.1",
    "phone_number": "+13022006100",
    "proof_of_address_doc_type": "UTILITY_BILL",
    "proof_of_address_doc_file": "https://example.com/proof-of-address.jpg",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "1998-01-01T00:00:00Z",
    "id_doc_country": "US",
    "id_doc_type": "PASSPORT",
    "id_doc_front_file": "https://example.com/passport-front.jpg",
    "selfie_file": "https://example.com/selfie.png",
    "source_of_funds_doc_file": "https://example.com/source-of-funds.jpg",
    "source_of_funds_doc_type": "business_income",
    "purpose_of_transactions": "business_transactions",
    "purpose_of_transactions_explanation": "I am using the money for my business expenses."
  }'
```

### Standard KYB (Business)

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "tos_id": "<replace_with_your_tos_id>",
    "type": "business",
    "kyc_type": "standard",
    "email": "test@blindpay.com",
    "tax_id": "123456",
    "address_line_1": "8 The Green",
    "city": "Dover",
    "state_province_region": "DE",
    "country": "US",
    "postal_code": "19901",
    "phone_number": "+13022006336",
    "proof_of_address_doc_type": "UTILITY_BILL",
    "proof_of_address_doc_file": "https://example.com/proof-of-address.png",
    "legal_name": "Test Inc.",
    "alternate_name": "Test",
    "formation_date": "2000-01-01T00:00:00.000Z",
    "website": "https://test.com",
    "owners": [
      {
        "role": "beneficial_controlling",
        "first_name": "John",
        "last_name": "Doe",
        "date_of_birth": "2000-01-01T00:00:00.000Z",
        "tax_id": "GC200075",
        "address_line_1": "5th Avenue",
        "city": "Manhattan",
        "state_province_region": "NY",
        "country": "US",
        "postal_code": "",
        "id_doc_country": "US",
        "id_doc_type": "PASSPORT",
        "id_doc_front_file": "https://example.com/passport.svg",
        "proof_of_address_doc_type": "UTILITY_BILL",
        "proof_of_address_doc_file": "https://example.com/proof-of-address.png"
      }
    ],
    "incorporation_doc_file": "https://example.com/incorporation.png",
    "proof_of_ownership_doc_file": "https://example.com/proof-of-ownership.png"
  }'
```

## Testing Scenarios

By default all receivers created in 'development' instances are automatically approved.

To simulate rejection, use `Fail` as the first name (individuals) or legal name (businesses).
