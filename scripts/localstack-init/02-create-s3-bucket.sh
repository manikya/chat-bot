#!/bin/bash
BUCKET="${S3_ASSETS_BUCKET:-commercechat-assets}"

awslocal s3 mb "s3://${BUCKET}" 2>/dev/null || true

awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}' 2>/dev/null || true

echo "S3 bucket ${BUCKET} ready"
