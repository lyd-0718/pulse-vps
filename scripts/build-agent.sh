#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist-agent"
mkdir -p "${OUT_DIR}"

cd "${ROOT_DIR}/agent"

echo "Tidying Go module..."
go mod tidy

echo "Running Go tests..."
go test ./...

echo "Building PulseVPS Agent binaries..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "${OUT_DIR}/vps-agent-darwin-arm64" .
CGO_ENABLED=0 GOOS=linux  GOARCH=amd64 go build -ldflags="-s -w" -o "${OUT_DIR}/vps-agent-linux-amd64" .
CGO_ENABLED=0 GOOS=linux  GOARCH=arm64 go build -ldflags="-s -w" -o "${OUT_DIR}/vps-agent-linux-arm64" .

ls -lh "${OUT_DIR}"
