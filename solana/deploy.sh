#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT SOLANA DEVNET BUILD & DEPLOYMENT SCRIPT
# ==============================================================================
set -e

echo "=================================================="
echo "⚡ BULLIVANT SOLANA BUILD & DEPLOY ENGINE"
echo "=================================================="

# Check for Solana CLI
if ! command -v solana &> /dev/null; then
    echo "⚠️ Solana CLI not detected in PATH. Checking ~/.local/share/solana..."
    if [ -d "$HOME/.local/share/solana/install/active_release/bin" ]; then
        export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
    else
        echo "❌ Please install Solana CLI first:"
        echo "sh -c \"\$(curl -sSfL https://release.anza.xyz/v1.18.26/install || curl -sSfL https://release.solana.com/v1.18.0/install)\""
        exit 1
    fi
fi

# Check for Cargo / Rust
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    else
        echo "❌ Rust/Cargo not found. Please install Rust:"
        echo "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi
fi

echo "✓ Solana CLI: $(solana --version)"
echo "✓ Rustc:      $(rustc --version)"

# 1. Setup Devnet configuration
solana config set --url https://api.devnet.solana.com

# 2. Build Rust Program
cd "$(dirname "$0")/program"
echo "📦 Compiling Solana BPF binary..."
cargo build-sbf

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
echo "🚀 Deploying BPF binary to Solana Devnet..."
solana program deploy target/deploy/hello_world.so --keypair "$DEPLOYER_KEY"

echo "=================================================="
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "=================================================="
