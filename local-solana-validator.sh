#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT LOCAL SOLANA VALIDATOR & UNLIMITED AIRDROP ENGINE
# ==============================================================================
# Starts an isolated local Solana validator node on your VPS and airdrops
# 100 SOL to your deployer wallet with ZERO rate limits.
set -e

KEYPAIR_PATH="/root/.config/solana/solana-deployer.json"
FALLBACK_KEYPAIR="$HOME/.config/solana/solana-deployer.json"

if [ -f "$KEYPAIR_PATH" ]; then
    TARGET_KEYPAIR="$KEYPAIR_PATH"
elif [ -f "$FALLBACK_KEYPAIR" ]; then
    TARGET_KEYPAIR="$FALLBACK_KEYPAIR"
else
    mkdir -p "$(dirname "$KEYPAIR_PATH")" 2>/dev/null || true
    TARGET_KEYPAIR="$KEYPAIR_PATH"
fi

if [ -d "$HOME/.local/share/solana/install/active_release/bin" ]; then
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

echo "=================================================="
echo "⚡ BULLIVANT LOCAL SOLANA VALIDATOR & 100 SOL AIRDROP"
echo "=================================================="

# Check if solana-test-validator is installed
if ! command -v solana-test-validator &> /dev/null; then
    echo "📦 Installing Solana CLI toolchain..."
    sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install || curl -sSfL https://release.solana.com/v1.18.0/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Configure local network
solana config set --url localhost --keypair "$TARGET_KEYPAIR"

PUBKEY=$(solana-keygen pubkey "$TARGET_KEYPAIR" 2>/dev/null || true)
echo "📍 Target Wallet: $PUBKEY"

# Check if validator is already running
if pgrep -x "solana-test-val" > /dev/null; then
    echo "✓ Local validator is already running!"
else
    echo "🚀 Starting solana-test-validator in the background..."
    nohup solana-test-validator --reset --quiet > /dev/null 2>&1 &
    echo "⏳ Waiting for local validator to produce blocks..."
    sleep 5
fi

# Request 100 SOL airdrop
echo "💰 Requesting 100 SOL airdrop on localhost..."
solana airdrop 100 "$PUBKEY" --url localhost || true

echo "--------------------------------------------------"
echo "✅ Current Balance: $(solana balance "$TARGET_KEYPAIR" --url localhost)"
echo "🎉 Unlimited local testing active! Ready to deploy:"
echo "   cargo build-sbf && solana program deploy target/deploy/hello_world.so"
echo "=================================================="
