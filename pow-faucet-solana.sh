#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT SOLANA DEVNET PROOF-OF-WORK (PoW) MINING FAUCET
# ==============================================================================
# Automatically mines Devnet SOL via devnet-pow to bypass web faucets, captchas,
# and GitHub age requirements. Credits /root/.config/solana/solana-deployer.json.
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
    node -e '
    const { Keypair } = require("@solana/web3.js");
    const fs = require("fs");
    fs.writeFileSync("'"$TARGET_KEYPAIR"'", JSON.stringify(Array.from(Keypair.generate().secretKey)));
    '
fi

echo "=================================================="
echo "⚡ BULLIVANT SOLANA PROOF-OF-WORK FAUCET MINER"
echo "=================================================="
echo "Target Keypair: $TARGET_KEYPAIR"

# 1. Ensure Cargo and Solana toolchain are in PATH
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi
if [ -d "$HOME/.local/share/solana/install/active_release/bin" ]; then
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# 2. Automatically generate Solana CLI config.yml
mkdir -p "$HOME/.config/solana/cli" "/root/.config/solana/cli" 2>/dev/null || true
cat <<EOF > "$HOME/.config/solana/cli/config.yml"
json_rpc_url: "https://api.devnet.solana.com"
websocket_url: ""
keypair_path: "$TARGET_KEYPAIR"
address_labels:
  "11111111111111111111111111111111": "System Program"
commitment: "confirmed"
EOF
cp -f "$HOME/.config/solana/cli/config.yml" "/root/.config/solana/cli/config.yml" 2>/dev/null || true

# 3. Check / Install Rust if cargo is not found
if ! command -v cargo &> /dev/null; then
    echo "📦 Rust / Cargo not detected. Installing lightweight Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo "✓ Cargo Version: $(cargo --version)"

# 3. Ensure OpenSSL and pkg-config development packages exist on Ubuntu
if ! command -v pkg-config &> /dev/null || [ ! -f /usr/include/openssl/ssl.h ]; then
    echo "📦 Installing required Ubuntu OpenSSL dev headers (pkg-config, libssl-dev)..."
    if command -v apt-get &> /dev/null; then
        apt-get update -y && apt-get install -y pkg-config libssl-dev build-essential
    fi
fi

# 4. Check / Install devnet-pow CLI
if ! command -v devnet-pow &> /dev/null; then
    echo "📦 Installing official devnet-pow faucet miner..."
    cargo install devnet-pow
fi

echo "✓ devnet-pow: Installed"

# 4. Display Wallet Address & Current Balance
bash "$(dirname "$0")/check-solana-balance.sh"

echo "--------------------------------------------------"
echo "⛏️ Starting CPU Proof-of-Work Mining for Devnet SOL..."
echo "No GitHub, No Captcha, No Rate Limits required."
echo "Press Ctrl+C at any time to stop once satisfied."
echo "--------------------------------------------------"

# 5. Run mining with difficulty 3 and reward 0.02 targeting your keypair
devnet-pow mine \
    --keypair-path "$TARGET_KEYPAIR" \
    --url devnet \
    --difficulty 3 \
    --reward 0.02 \
    --no-infer \
    --target-lamports 5000000000 || devnet-pow mine -k "$TARGET_KEYPAIR" -ud -d 3 --reward 0.02 --no-infer -t 5000000000

echo "--------------------------------------------------"
echo "✅ Mining complete! Verifying updated balance..."
bash "$(dirname "$0")/check-solana-balance.sh"
echo "=================================================="
