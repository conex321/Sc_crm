#!/usr/bin/env bash
# Push all env vars from .env.local into Vercel production scope.
# Skips: INNGEST_DEV (must be unset in prod), empty values, comments.
# Run: VERCEL_TOKEN=xxx bash scripts/vercel-push-env.sh
set -e

if [ -z "$VERCEL_TOKEN" ]; then
  echo "VERCEL_TOKEN not set"
  exit 1
fi

SKIP="INNGEST_DEV"

while IFS= read -r line || [ -n "$line" ]; do
  # skip blank + comment lines
  [[ -z "${line// }" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue

  name="${line%%=*}"
  value="${line#*=}"

  # trim whitespace from name
  name="$(echo -n "$name" | tr -d '[:space:]')"

  # skip if no value or in skip list
  [ -z "$value" ] && { echo "SKIP empty: $name"; continue; }
  [[ " $SKIP " =~ " $name " ]] && { echo "SKIP forbidden-in-prod: $name"; continue; }

  echo "ADD $name (${#value} chars)"
  # remove if already exists, then add
  npx vercel env rm "$name" production --yes --token="$VERCEL_TOKEN" >/dev/null 2>&1 || true
  printf "%s" "$value" | npx vercel env add "$name" production --token="$VERCEL_TOKEN" >/dev/null 2>&1
done < .env.local

echo "DONE"
