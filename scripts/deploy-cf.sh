#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT_DIR}"

echo "1) Checking Cloudflare login..."
npx wrangler whoami

if grep -q "00000000-0000-0000-0000-000000000000" wrangler.jsonc; then
  echo "2) Creating remote D1 database vps-monitor-db..."
  OUT="$(npx wrangler d1 create vps-monitor-db)"
  echo "${OUT}"
  DB_ID="$(echo "${OUT}" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1)"
  if [[ -z "${DB_ID}" ]]; then
    echo "Failed to extract database_id. Please update wrangler.jsonc manually." >&2
    exit 1
  fi
  node -e '
    const fs = require("fs");
    const c = fs.readFileSync("wrangler.jsonc", "utf8");
    fs.writeFileSync("wrangler.jsonc", c.replace("00000000-0000-0000-0000-000000000000", process.argv[1]));
  ' "${DB_ID}"
  echo "Updated wrangler.jsonc with database_id=${DB_ID}"
fi

echo "3) Applying D1 migrations remotely..."
npx wrangler d1 migrations apply vps-monitor-db --remote

echo "4) Ensuring Worker secrets exist (ADMIN_PASSWORD / JWT_SECRET)..."
echo "Tip: if not set yet, run:"
echo "  npx wrangler secret put ADMIN_PASSWORD"
echo "  npx wrangler secret put JWT_SECRET"

echo "5) Building frontend..."
pnpm run build:web

echo "6) Deploying to Cloudflare (vps.ydiws.xyz)..."
npx wrangler deploy

echo "✅ Deployed! Visit https://vps.ydiws.xyz"
