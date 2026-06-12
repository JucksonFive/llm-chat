# AWS Bedrock Integration Setup

This guide explains how to set up and use AWS Bedrock as a provider in the LLM Chat application.

## Prerequisites

1. **AWS Account**: You need an active AWS account
2. **AWS CLI**: Install and configure the AWS CLI (recommended)
3. **Bedrock Model Access**: Request access to models in the AWS Bedrock console

## Requesting Model Access

Before using Bedrock models, you must request access in the AWS console:

1. Go to the AWS Bedrock console: https://console.aws.amazon.com/bedrock/
2. Navigate to "Model access" in the left sidebar
3. Click "Manage model access"
4. Select the models you want to use:
   - Anthropic Claude models (Claude 3.5 Sonnet, Claude 3.5 Haiku, etc.)
   - Amazon Nova models (Nova Pro, Nova Lite, Nova Micro)
5. Click "Request model access" and wait for approval (usually instant for most models)

## AWS Credentials Setup

The application uses the standard AWS credential chain. Choose one of these methods:

### Option 1: AWS CLI Profile (Recommended for Local Development)

```bash
# Configure AWS CLI with your credentials
aws configure --profile default

# Or use a named profile
aws configure --profile my-bedrock-profile
```

Set the profile in your `.env` file:
```bash
AWS_PROFILE=my-bedrock-profile
AWS_REGION=us-east-1
```

### Option 2: Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=us-east-1
```

Or add them to your `.env` file:
```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

### Option 3: IAM Role (For Production on EC2/ECS)

If running on AWS infrastructure, attach an IAM role with Bedrock permissions to your instance.

## Required IAM Permissions

Your AWS credentials need the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    }
  ]
}
```

## Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add Bedrock configuration:
   ```bash
   AWS_REGION=eu-west-1  # Or us-east-1, etc.
   AWS_PROFILE=default   # Optional if using default profile
   ```

3. Start the server:
   ```bash
   pnpm dev
   ```

## Using Bedrock in the Application

1. Open the application
2. Create a new agent or edit an existing one
3. Select "AWS Bedrock" as the provider
4. Choose a model from the dropdown:
   - **EU Region Models (eu-west-1, eu-central-1)**:
     - `eu.anthropic.claude-opus-4-8` (Claude Opus 4.8)
     - `eu.anthropic.claude-opus-4-7` (Claude Opus 4.7)
     - `eu.anthropic.claude-sonnet-4-6` (Claude Sonnet 4.6)
     - `eu.anthropic.claude-haiku-4-5-20251001-v1:0` (Claude Haiku 4.5)
   - **US Cross-Region Models**:
     - `us.anthropic.claude-3-5-sonnet-20241022-v2:0` (Claude 3.5 Sonnet)
     - `us.anthropic.claude-3-5-haiku-20241022-v1:0` (Claude 3.5 Haiku)
   - **Single-Region Models**:
     - `anthropic.claude-3-5-sonnet-20240620-v1:0` (Claude 3.5 Sonnet)
     - `anthropic.claude-3-haiku-20240307-v1:0` (Claude 3 Haiku)
   - **Amazon Nova Models**:
     - `amazon.nova-pro-v1:0` (Nova Pro)
     - `amazon.nova-lite-v1:0` (Nova Lite)
     - `amazon.nova-micro-v1:0` (Nova Micro)

Note: You can also enter custom model IDs if you have access to other Bedrock models.

## Available Regions

Bedrock is available in multiple regions. Common regions:
- `eu-west-1` (Europe, Ireland) - Supports Claude 4.x models
- `eu-central-1` (Europe, Frankfurt) - Supports Claude 4.x models
- `us-east-1` (US East, N. Virginia)
- `us-west-2` (US West, Oregon)
- `ap-southeast-1` (Asia Pacific, Singapore)

Check the [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html) for the full list of regions and model availability.

## Testing Your Setup

You can test your AWS credentials and Bedrock access:

```bash
# Test with AWS CLI
aws bedrock list-foundation-models --region us-east-1

# Or test a simple invocation
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","messages":[{"role":"user","content":[{"type":"text","text":"Hello"}]}],"max_tokens":100}' \
  --region us-east-1 \
  output.json
```

## Current Limitations

- **No Tool Support**: The current implementation does not support MCP servers or built-in tools with Bedrock
- **No Image Support**: Image attachments are not supported in the basic Converse API implementation
- **No Memory Extraction**: Automatic memory extraction is disabled for Bedrock conversations

These limitations may be addressed in future updates.

## Troubleshooting

### "AWS credentials not found or invalid"
- Check that your AWS credentials are properly configured
- Verify `AWS_PROFILE` matches a profile in `~/.aws/credentials`
- Ensure environment variables are set correctly

### "Access denied to Bedrock model"
- Request model access in the AWS Bedrock console
- Verify your IAM permissions include `bedrock:InvokeModel`
- Check that you're using the correct region

### "Bedrock model not found"
- Verify the model ID is correct
- Check that the model is available in your selected region
- Ensure you've requested access to the model

### "Invalid AWS region format"
- Region must be in the format `xx-xxxx-#` (e.g., `us-east-1`)
- Check for typos in your `.env` file

## Cost Considerations

AWS Bedrock charges based on:
- Number of input tokens
- Number of output tokens
- Model used

Refer to the [AWS Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) for current rates.

## Further Reading

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/)
