package main

import (
	"fmt"
	"strings"
)

func renderInstallScript(defaultServerURL, downloadBase string) string {
	cleanBase := strings.TrimRight(downloadBase, "/")
	return fmt.Sprintf(`#!/usr/bin/env bash
set -euo pipefail

SERVER="%s"
TOKEN=""
INTERVAL="2s"
PROBE_INTERVAL="20s"
BINARY_URL=""
BIN_PATH="/usr/local/bin/pulse-vps-agent"
SERVICE_NAME="pulse-vps-agent"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)
      SERVER="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --probe-interval)
      PROBE_INTERVAL="$2"
      shift 2
      ;;
    --binary-url)
      BINARY_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "Error: --token is required." >&2
  echo "Usage: curl -fsSL $SERVER/install.sh | sudo bash -s -- --server $SERVER --token <NODE_TOKEN>" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (or via sudo)." >&2
  exit 1
fi

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH_RAW" >&2
    exit 1
    ;;
esac

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
if [[ -z "$BINARY_URL" && -n "%s" ]]; then
  BINARY_URL="%s/vps-agent-${OS}-${ARCH}"
fi

if [[ -n "$BINARY_URL" ]]; then
  echo "Downloading PulseVPS Agent ($OS/$ARCH) from $BINARY_URL ..."
  curl -fsSL "$BINARY_URL" -o "${BIN_PATH}.tmp"
  chmod +x "${BIN_PATH}.tmp"
  mv -f "${BIN_PATH}.tmp" "$BIN_PATH"
elif [[ ! -x "$BIN_PATH" ]]; then
  echo "No binary download URL configured and $BIN_PATH does not exist." >&2
  exit 1
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PulseVPS Lightweight Monitoring Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${BIN_PATH} --server ${SERVER} --token ${TOKEN} --interval ${INTERVAL} --probe-interval ${PROBE_INTERVAL}
Restart=always
RestartSec=5
MemoryMax=48M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
echo "✅ ${SERVICE_NAME} installed and started!"
systemctl --no-pager --full status "${SERVICE_NAME}" || true
`, defaultServerURL, cleanBase, cleanBase)
}
