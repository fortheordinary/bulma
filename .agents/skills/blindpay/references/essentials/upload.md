# Upload

## What is Upload?

Upload allows you to generate file URLs from your customers' KYC documents and pictures.

BlindPay will encrypt them before sharing with our vendors and saving them in our database.

This is extremely useful for being compliant with data protection laws.

## Uploading a File

Before uploading a file, you need to:

1. [Create an account on BlindPay](https://app.blindpay.com/sign-up)
2. Create a development instance
3. Create your API key

> **Remember**: Replace `YOUR_SECRET_TOKEN` with your API key and `in_000000000000` with your instance ID.

```bash
curl 'https://api.blindpay.com/v1/upload?instance_id=in_000000000000' \
  --request POST \
  --header 'Content-Type: multipart/form-data' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --form 'bucket=onboarding' \
  --form 'file=@your_file.pdf'
```

The response will include a `file_url` that you can use when creating a receiver.

## Using Uploaded Files

Use the `file_url` from the upload response to populate document URLs when creating a receiver:

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/receivers \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "id_doc_front_file": "<file_url_from_upload>",
    "selfie_file": "<file_url_from_upload>",
    ...
  }'
```
