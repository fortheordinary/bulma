# Bank Accounts

## What is a Bank Account?

A bank account represents the recipient information to which BlindPay needs to **send the fiat payment** when a payout is started.

You can add multiple bank accounts for each receiver.

> You are allowed to add **third-party bank accounts**, which means you can create a receiver "John" and add a bank account from "Jack".

## Payment Rails

| Type | Country | Estimated Time of Arrival |
|------|---------|---------------------------|
| international_swift | Global | ~5 business days |
| ach | US | ~2 business days |
| wire | US | ~1 business day |
| rtp | US | Instant |
| pix | Brazil | Instant |
| spei_bitso | Mexico | Instant |
| ach_cop_bitso | Colombia | ~1 business day |
| transfers_bitso | Argentina | Instant |

> High transaction volumes may affect BlindPay's estimated payout delivery times.

## Adding a Bank Account

All data required to create a bank account **should be valid**, even for `development` instances.

Before creating a bank account, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key
4. Create a receiver

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key, `in_000000000000` with your instance ID, and `re_000000000000` with your receiver ID.

### International SWIFT

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "international_swift",
    "name": "Display Name",
    "account_class": "business",
    "swift_code_bic": "BARCCHGGXXX",
    "swift_account_holder_name": "AMICORP SHARED SERVICE CENTER GMBH",
    "swift_account_number_iban": "CH4008735681787160333",
    "swift_beneficiary_address_line_1": "75 BAARERSTRASSE",
    "swift_beneficiary_country": "CN",
    "swift_beneficiary_city": "ZUG",
    "swift_beneficiary_state_province_region": "ZG",
    "swift_beneficiary_postal_code": "8008",
    "swift_bank_name": "BARCLAYS BANK SUISSE SA",
    "swift_bank_address_line_1": "BARCLAYS BANK 18-20 CHEMIN DE GRANGE-CANAL",
    "swift_bank_address_line_2": "PO BOX 3941",
    "swift_bank_country": "CN",
    "swift_bank_city": "GENEVA",
    "swift_bank_state_province_region": "GE",
    "swift_bank_postal_code": "1221",
    "recipient_relationship": "vendor_or_supplier",
    "swift_payment_code": "cn_swift_cgoddr"
  }'
```

### US ACH

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "ach",
    "name": "Display Name",
    "beneficiary_name": "John Doe",
    "routing_number": "121000358",
    "account_number": "3211237578",
    "account_type": "checking",
    "account_class": "individual",
    "address_line_1": "123 Main St",
    "city": "New York",
    "state_province_region": "NY",
    "country": "US",
    "postal_code": "10001",
    "recipient_relationship": "first_party"
  }'
```

### US Wire

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "wire",
    "name": "Display Name",
    "beneficiary_name": "JOHN DOE",
    "routing_number": "026073008",
    "account_number": "8211239565",
    "account_class": "individual",
    "address_line_1": "5 Penn Plaza",
    "city": "NY",
    "state_province_region": "NY",
    "country": "US",
    "postal_code": "10001",
    "recipient_relationship": "first_party"
  }'
```

### US RTP (Real-Time Payments)

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "rtp",
    "name": "Display Name",
    "beneficiary_name": "JOHN DOE",
    "routing_number": "026073008",
    "account_number": "8211239565",
    "account_class": "individual",
    "address_line_1": "5 Penn Plaza",
    "city": "NY",
    "state_province_region": "NY",
    "country": "US",
    "postal_code": "10001",
    "recipient_relationship": "first_party"
  }'
```

### Brazil PIX

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "pix",
    "name": "Display Name",
    "pix_key": "<Replace this>"
  }'
```

### Mexico SPEI

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "spei_bitso",
    "name": "Display Name",
    "beneficiary_name": "<Replace this>",
    "spei_protocol": "<Replace this>",
    "spei_institution_code": "<Replace this>",
    "spei_clabe": "<Replace this>"
  }'
```

### Colombia ACH COP

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "ach_cop_bitso",
    "name": "Display Name",
    "account_type": "checking",
    "ach_cop_beneficiary_first_name": "<Replace this>",
    "ach_cop_beneficiary_last_name": "<Replace this>",
    "ach_cop_document_id": "<Replace this>",
    "ach_cop_document_type": "<Replace this>",
    "ach_cop_email": "<Replace this>",
    "ach_cop_bank_code": "<Replace this>",
    "ach_cop_bank_account": "<Replace this>"
  }'
```

### Argentina Transfers 3.0

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers/re_000000000000/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "transfers_bitso",
    "name": "Display Name",
    "beneficiary_name": "<Replace this>",
    "transfers_type": "<Replace this>",
    "transfers_account": "<Replace this>"
  }'
```
