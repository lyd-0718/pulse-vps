#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist-server"
mkdir -p "${OUT_DIR}"

echo "Building frontend bundle..."
cd "${ROOT_DIR}"
pnpm run build:web

echo "Syncing dist/client into server/webdist..."
rm -rf "${ROOT_DIR}/server/webdist"
mkdir -p "${ROOT_DIR}/server/webdist"
cp -R "${ROOT_DIR}/dist/client/." "${ROOT_DIR}/server/webdist/"
touch "${ROOT_DIR}/server/webdist/.gitkeep"

echo "Building PulseVPS single-binary Go server..."
cd "${ROOT_DIR}/server"
go mod tidy
go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "${OUT_DIR}/pulse-vps-server-linux-amd64" .
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "${OUT_DIR}/pulse-vps-server-darwin-arm64" .

ls -lh "${OUT_DIR}"
