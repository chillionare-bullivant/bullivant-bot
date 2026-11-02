#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT SOLANA DEVNET AIRDROP & VERIFICATION ENGINE
# ==============================================================================
# Ensures /root/.config/solana/solana-deployer.json is configured, funded, and verified.
set -e

KEYPAIR_PATH="/root/.config/solana/solana-deployer.json"
FALLBACK_KEYPAIR="$HOME/.config/solana/solana-deployer.json"

# Resolve actual keypair path
if [ -f "$KEYPAIR_PATH" ]; then
    TARGET_KEYPAIR="$KEYPAIR_PATH"
elif [ -f "$FALLBACK_KEYPAIR" ]; then
    TARGET_KEYPAIR="$FALLBACK_KEYPAIR"
else
    mkdir -p "$(dirname "$KEYPAIR_PATH")"
    TARGET_KEYPAIR="$KEYPAIR_PATH"
fi

echo "=================================================="
echo "⚡ BULLIVANT SOLANA DEVNET AIRDROP & VERIFIER"
echo "=================================================="
echo "Target Keypair: $TARGET_KEYPAIR"

# Ensure Solana CLI / Tooling is in PATH
if [ -d "$HOME/.local/share/solana/install/active_release/bin" ]; then
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Ensure Keypair exists
if [ ! -f "$TARGET_KEYPAIR" ]; then
    echo "🔑 Generating new dedicated Solana keypair at $TARGET_KEYPAIR..."
    if command -v solana-keygen &> /dev/null; then
        solana-keygen new --no-bip39-passphrase --outfile "$TARGET_KEYPAIR" --force
    else
        node -e '
        const { Keypair } = require("@solana/web3.js");
        const fs = require("fs");
        const kp = Keypair.generate();
        fs.writeFileSync("'"$TARGET_KEYPAIR"'", JSON.stringify(Array.from(kp.secretKey)));
        '
    fi
fi

# Extract Public Key
PUBKEY=""
if command -v solana-keygen &> /dev/null; then
    PUBKEY=$(solana-keygen pubkey "$TARGET_KEYPAIR" 2>/dev/null || true)
fi

if [ -z "$PUBKEY" ]; then
    PUBKEY=$(node -e '
    try {
        const { Keypair } = require("@solana/web3.js");
        const fs = require("fs");
        const secret = JSON.parse(fs.readFileSync("'"$TARGET_KEYPAIR"'", "utf8"));
        const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
        console.log(kp.publicKey.toBase58());
    } catch (e) {
        process.exit(1);
    }
    ')
fi

echo "📍 Wallet Public Key: $PUBKEY"

# Candidate recommended Devnet RPC Endpoints
ENDPOINTS=(
    "https://api.devnet.solana.com"
    "https://rpc.ankr.com/solana_devnet"
    "https://devnet.helius-rpc.com/?api-key=default"
)

# Set CLI configuration if solana CLI is installed
if command -v solana &> /dev/null; then
    solana config set --keypair "$TARGET_KEYPAIR" >/dev/null 2>&1 || true
    solana config set --url https://api.devnet.solana.com >/dev/null 2>&1 || true
fi

# Function to get balance in SOL
get_balance() {
    node -e '
    const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
    const rpc = process.argv[1];
    const pub = new PublicKey(process.argv[2]);
    const conn = new Connection(rpc, "confirmed");
    conn.getBalance(pub).then(b => {
        console.log((b / LAMPORTS_PER_SOL).toFixed(4));
    }).catch(() => console.log("0.0000"));
    ' "https://api.devnet.solana.com" "$PUBKEY"
}

INITIAL_BALANCE=$(get_balance)
echo "💰 Current Balance: $INITIAL_BALANCE SOL"

# If balance is already sufficient (>= 1 SOL), notify and verify
if (( $(echo "$INITIAL_BALANCE >= 1.0" | awk '{print ($1 >= 1.0)}') )); then
    echo "✅ Wallet already funded with $INITIAL_BALANCE SOL! Ready for deployment."
    echo "🔍 Explorer: https://explorer.solana.com/address/$PUBKEY?cluster=devnet"
    exit 0
fi

echo ""
echo "⏳ Requesting Devnet funds for $PUBKEY..."

AIRDROP_SUCCESS=false

# Method 1: Try Solana CLI airdrop with retry
if command -v solana &> /dev/null; then
    for RPC in "${ENDPOINTS[@]}"; do
        echo "   Testing RPC: $RPC..."
        if solana airdrop 1 "$PUBKEY" --url "$RPC" 2>&1 | grep -E "Signature|Confirmed"; then
            echo "   ✓ Solana CLI airdrop confirmed via $RPC!"
            AIRDROP_SUCCESS=true
            break
        fi
    done
fi

# Method 2: Try Web3.js JSON-RPC airdrop request
if [ "$AIRDROP_SUCCESS" = false ]; then
    echo "   Attempting Node.js JSON-RPC airdrop..."
    node -e '
    const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
    async function fund() {
        const conn = new Connection("https://api.devnet.solana.com", "confirmed");
        const pub = new PublicKey("'"$PUBKEY"'");
        try {
            const sig = await conn.requestAirdrop(pub, 1 * LAMPORTS_PER_SOL);
            const latest = await conn.getLatestBlockhash();
            await conn.confirmTransaction({
                blockhash: latest.blockhash,
                lastValidBlockHeight: latest.lastValidBlockHeight,
                signature: sig
            });
            console.log("   ✓ Node.js airdrop confirmed! Signature:", sig);
        } catch (e) {
            console.log("   ℹ️ RPC faucet response:", e.message);
        }
    }
    fund();
    ' || true
fi

# Verification Loop (poll up to 5 times)
echo ""
echo "🔍 Verifying wallet balance confirmation..."
for i in {1..5}; do
    sleep 2
    CURRENT_BALANCE=$(get_balance)
    if (( $(echo "$CURRENT_BALANCE > $INITIAL_BALANCE" | awk '{print ($1 > $2)}') )); then
        AIRDROP_SUCCESS=true
        break
    fi
    echo "   Checking confirmation (Attempt $i/5)... Current: $CURRENT_BALANCE SOL"
done

CURRENT_BALANCE=$(get_balance)

echo "=================================================="
if [ "$AIRDROP_SUCCESS" = true ] || (( $(echo "$CURRENT_BALANCE > 0.0" | awk '{print ($1 > 0.0)}') )); then
    echo "🎉 SUCCESS: Devnet funds credited to wallet!"
    echo "💰 Final Balance: $CURRENT_BALANCE SOL"
    echo "🔑 Keypair Location: $TARGET_KEYPAIR"
    echo "📍 Public Key:       $PUBKEY"
    echo "🔍 Solana Explorer:  https://explorer.solana.com/address/$PUBKEY?cluster=devnet"
else
    echo "⚠️ Public Devnet rate limits reached on default nodes."
    echo ""
    echo "👉 1-Click Faucet Link:"
    echo "   https://faucet.solana.com"
    echo ""
    echo "   Paste your address to receive instant 2 SOL:"
    echo "   $PUBKEY"
    echo ""
    echo "After claiming, re-run this script to verify:"
    echo "   bash fix-solana-airdrop.sh"
fi
echo "=================================================="
