#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT SOLANA PROGRAM ID RETRIEVER
# ==============================================================================
set -e

PROGRAM_KEYPAIR="$(dirname "$0")/solana/program/target/deploy/hello_world-keypair.json"

if [ -f "$PROGRAM_KEYPAIR" ]; then
    PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR" 2>/dev/null || node -e '
    const fs = require("fs");
    const { Keypair } = require("@solana/web3.js");
    const secret = JSON.parse(fs.readFileSync("'"$PROGRAM_KEYPAIR"'", "utf-8"));
    console.log(Keypair.fromSecretKey(Uint8Array.from(secret)).publicKey.toBase58());
    ')
    echo "=================================================="
    echo "⚡ YOUR DEPLOYED SOLANA PROGRAM ID:"
    echo "=================================================="
    echo "Program ID: $PROGRAM_ID"
    echo "Binary:     solana/program/target/deploy/hello_world.so"
    echo "Keypair:    solana/program/target/deploy/hello_world-keypair.json"
    echo "=================================================="
    echo "🔍 To test executing this program, run:"
    echo "   npm run solana:interact"
    echo "=================================================="
else
    echo "⚠️ Program binary not yet deployed or keypair not found at:"
    echo "   $PROGRAM_KEYPAIR"
    echo "Listing all programs currently active on your validator:"
    solana program show --programs 2>/dev/null || echo "No active programs found."
fi
