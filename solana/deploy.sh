#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT SOLANA DEVNET BUILD & DEPLOYMENT SCRIPT
# ==============================================================================
set -e

echo "=================================================="
echo "⚡ BULLIVANT SOLANA BUILD & DEPLOY ENGINE"
echo "=================================================="

# Ensure PATH has Solana and Cargo binaries
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
elif [ -f "/root/.cargo/env" ]; then
    source "/root/.cargo/env"
fi

if [ -d "$HOME/.local/share/solana/install/active_release/bin" ]; then
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi
if [ -d "$HOME/.cargo/bin" ]; then
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Check for Solana CLI
if ! command -v solana &> /dev/null; then
    echo "⚠️ Solana CLI not detected in PATH. Installing..."
    sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install || curl -sSfL https://release.solana.com/v1.18.0/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Check for Cargo / Rust
if ! command -v cargo &> /dev/null; then
    echo "📦 Cargo not detected. Installing via apt..."
    if command -v apt &> /dev/null; then
        apt update -y && apt install -y cargo build-essential
    fi
fi

echo "✓ Solana CLI: $(solana --version 2>/dev/null || echo 'active')"
echo "✓ Cargo:      $(cargo --version 2>/dev/null || echo 'active')"

# 1. Target Local Validator if active, otherwise Devnet
RPC_TARGET="http://localhost:8899"
if ! pgrep -x "solana-test-val" > /dev/null; then
    RPC_TARGET="https://api.devnet.solana.com"
fi
echo "🌐 Deploy Target RPC: $RPC_TARGET"
solana config set --url "$RPC_TARGET"

# 2. Build Rust Program
cd "$(dirname "$0")/program"

# Fix edition2024 conflict by pinning zeroize to 1.3.0 (<1.4 required by curve25519-dalek)
rm -f Cargo.lock
cargo update -p zeroize --precise 1.3.0 2>/dev/null || true

# Downgrade lockfile version 4 to version 3 for Solana SBF compatibility
if [ -f Cargo.lock ]; then
    sed -i 's/version = 4/version = 3/g' Cargo.lock 2>/dev/null || true
fi

echo "📦 Compiling Solana BPF binary with cargo build-sbf..."
cargo build-sbf || {
    if [ -f Cargo.lock ]; then
        sed -i 's/version = 4/version = 3/g' Cargo.lock 2>/dev/null || true
    fi
    cargo-build-sbf || cargo build-sbf
}

# 3. Check for deploy keypair
DEPLOYER_KEY="$HOME/.config/solana/solana-deployer.json"
if [ ! -f "$DEPLOYER_KEY" ]; then
    echo "🔑 Generating deployer keypair at $DEPLOYER_KEY..."
    mkdir -p "$HOME/.config/solana"
    solana-keygen new --no-bip39-passphrase --outfile "$DEPLOYER_KEY"
fi

# 4. Check balance & request airdrop if low
BALANCE=$(solana balance "$DEPLOYER_KEY" | awk '{print $1}')
echo "💰 Current Balance: $BALANCE SOL"

# 5. Deploy program
echo "🚀 Deploying BPF binary to Solana ($RPC_TARGET)..."
solana program deploy target/deploy/hello_world.so --keypair "$DEPLOYER_KEY" --url "$RPC_TARGET"

echo "=================================================="
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "=================================================="
