# API Keys

## What is an API Key?

An API key is a unique identifier that you can use to authenticate your requests to the BlindPay API.

The API key will authenticate you to a **single instance**, so if you create an API key for instance X, it won't work for instance Y.

## Creating an API Key

You can only create an API key through the BlindPay Instance Dashboard.

Before creating an API key, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance

Then:

1. Go to the [BlindPay Dashboard](https://app.blindpay.com/)
2. Select an instance
3. Click on the `API Keys` tab
4. Create a new API key

## Using the API Key

Pass the API key in the `Authorization` header:

```bash
curl --request GET \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

## Best Practices

- Store API keys securely (environment variables, secrets manager)
- Never commit API keys to version control
- Use different API keys for development and production instances
- Rotate API keys periodically
