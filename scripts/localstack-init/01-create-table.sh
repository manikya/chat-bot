#!/bin/bash
awslocal dynamodb create-table \
  --table-name CommerceChat-Main \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null || true

awslocal dynamodb update-time-to-live \
  --table-name CommerceChat-Main \
  --time-to-live-specification Enabled=true,AttributeName=ttl \
  2>/dev/null || true

echo "DynamoDB table CommerceChat-Main ready"
