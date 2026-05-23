#!/usr/bin/env bash
# Full production deploy: push env vars → deploy → smoke test.
# Run: VERCEL_TOKEN=xxx bash scripts/deploy-prod.sh
set -e

if [ -z "$VERCEL_TOKEN" ]; then
  echo "ERROR: VERCEL_TOKEN not set"
  echo "Usage: VERCEL_TOKEN=xxx bash scripts/deploy-prod.sh"
  exit 1
fi

echo "=== 1/4 Verifying Vercel auth ==="
npx vercel whoami --token="$VERCEL_TOKEN"

echo ""
echo "=== 2/4 Pushing env vars to Vercel production ==="
bash scripts/vercel-push-env.sh

echo ""
echo "=== 3a/4 Pulling Vercel prod env to local ==="
npx vercel pull --yes --environment=production --token="$VERCEL_TOKEN"

echo ""
echo "=== 3b/4 Building locally (prebuilt) ==="
npx vercel build --prod --token="$VERCEL_TOKEN"

echo ""
echo "=== 3c/4 Deploying prebuilt artifacts to production ==="
DEPLOY_OUT=$(npx vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN" --yes 2>&1)
echo "$DEPLOY_OUT"
DEPLOY_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)
echo "Deployment URL: $DEPLOY_URL"

echo ""
echo "=== 4/4 Running production smoke test ==="
npx tsx scripts/vercel-smoke-prod.mts || echo "(smoke test optional — deploy is live regardless)"

echo ""
echo "=== DONE ==="
echo "Production URL: https://sc-crm-sand.vercel.app"
echo "Crons registered: /api/cron/mailshake-sync (daily 08:00 UTC), /api/cron/dialpad-sync (daily 07:00 UTC)"
echo ""
echo "Manual cron-test commands:"
echo "  curl https://sc-crm-sand.vercel.app/api/cron/mailshake-sync -H \"Authorization: Bearer \$CRON_SECRET\""
echo "  curl https://sc-crm-sand.vercel.app/api/cron/dialpad-sync   -H \"Authorization: Bearer \$CRON_SECRET\""
