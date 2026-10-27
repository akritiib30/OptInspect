"""Quick check that your computer can talk to Bedrock.  Run:  python check_bedrock.py"""
import os
import sys

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

model = os.environ.get("BEDROCK_MODEL_ID")
region = os.environ.get("AWS_REGION", "us-east-1")
if not model:
    sys.exit("BEDROCK_MODEL_ID is not set. Copy the model id from the Bedrock console (see the guide).")

print(f"Region: {region}\nModel:  {model}")
try:
    client = boto3.client("bedrock-runtime", region_name=region)
    resp = client.converse(modelId=model, messages=[{"role": "user", "content": [
        {"text": "Reply with the single word: OK"}]}], inferenceConfig={"maxTokens": 20})
    print("Reply: ", resp["output"]["message"]["content"][0]["text"].strip())
    print("\nBedrock works.")
except NoCredentialsError:
    print("\nNo AWS keys found. Run:  aws configure")
except ClientError as e:
    code = e.response["Error"]["Code"]
    hints = {
        "AccessDeniedException": "Your user lacks permission, or the model is not enabled for your account.",
        "ResourceNotFoundException": "Wrong model id or wrong region.",
        "ValidationException": "Often the model needs an inference-profile id (starts with us. or eu.). "
                               "Copy the id exactly from the Bedrock console.",
        "ThrottlingException": "Too many requests, wait a minute.",
    }
    print(f"\n{code}: {e.response['Error']['Message']}\nHint: {hints.get(code, 'see the message above')}")
