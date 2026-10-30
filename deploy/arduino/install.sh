#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT="${RECALLVAULT_VAULT:-$HOME/RecallVaultVault}"

if ! command -v node >/dev/null; then
  echo 'Node.js 24.15+ is required. Install an official Linux ARM64 build first.' >&2
  exit 1
fi

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 24 || minor < 15) {
  console.error(`Node.js 24.15+ is required; found ${process.version}`);
  process.exit(1);
}
'

mkdir -p "$VAULT"
cd "$ROOT"
npm ci
npm run format
npm run check
node dist/cli.js init --vault "$VAULT"
node dist/cli.js doctor --vault "$VAULT"
printf '\nRecallVault is installed. Vault: %s\n' "$VAULT"
printf 'Codex may launch the MCP remotely via SSH over Tailscale.\n'
