# Terms of Service

## What is the Terms of Service?

BlindPay's Terms of Service is a legal agreement that must be accepted by your customers before creating a receiver. This acceptance is required for regulatory compliance and allows BlindPay to legally provide services such as generating blockchain wallets and creating virtual accounts on behalf of your customers.

The terms can only be accepted by users accessing the BlindPay URL `https://app.blindpay.com` on the client side, so all requests from servers will be ignored.

## Generating Terms of Service URL

Before generating a terms of service URL, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key and `in_000000000000` with your instance ID.

> **Remember**: We only accept `uuid` in the `idempotency_key` field.

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/e/instances/in_000000000000/tos \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "idempotency_key": "<your_uuid>"
  }'
```

The API will return a URL with the following query parameters:

```
https://app.blindpay.com/e/terms-of-service?session_token=eyJ0eXAi...&idempotency_key=5d8b149e-a55d-4b5b-a8f8-7c4fa315f854&redirect_url=
```

| Param | Required | Example |
|-------|----------|---------|
| session_token | yes | eyJ0eXAi... (JWT) |
| idempotency_key | yes | 5d8b149e-a55d-4b5b-a8f8-7c4fa315f854 (UUID) |
| redirect_url | no | https://yourapp.com/ |
| receiver_id | no | re_000000000000 (mandatory for accepting a new TOS version) |

> We strongly recommend adding a `redirect_url` parameter. When users accept the terms of service, they will be automatically redirected back to your application.

## Accepting Terms of Service

After the user accepts the terms of service, they will be redirected to the `redirect_url` with a query parameter `tos_id`.

You need to use this `tos_id` when creating a receiver.

You'll also receive a webhook event `tos.accept` when the terms of service is accepted.

## Accepting a New Version

If BlindPay updates the terms of service, all requests to payout quote and payin quote endpoints will return an error with message `please_accept_terms_of_service`.

If you receive this, generate a new terms of service URL and make sure to set the `receiver_id` parameter on the URL returned.

After the customer accepts the new version, all quotes endpoints won't return the error anymore.
