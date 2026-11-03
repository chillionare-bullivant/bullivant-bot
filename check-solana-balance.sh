#!/usr/bin/env bash
# ==============================================================================
# BULLIVANT SOLANA DEVNET BALANCE CHECKER
# ==============================================================================
# Specifically queries the RPC endpoint for the wallet address defined in
# /root/.config/solana/solana-deployer.json and outputs the exact balance.
set -e

KEYPAIR_PATH="/root/.config/solana/solana-deployer.json"
FALLBACK_KEYPAIR="$HOME/.config/solana/solana-deployer.json"
LOCAL_KEYPAIR="$(dirname "$0")/solana/keypair.json"

if [ -f "$KEYPAIR_PATH" ]; then
    TARGET_KEYPAIR="$KEYPAIR_PATH"
elif [ -f "$FALLBACK_KEYPAIR" ]; then
    TARGET_KEYPAIR="$FALLBACK_KEYPAIR"
elif [ -f "$LOCAL_KEYPAIR" ]; then
    TARGET_KEYPAIR="$LOCAL_KEYPAIR"
else
    mkdir -p "$(dirname "$KEYPAIR_PATH")" 2>/dev/null || true
    TARGET_KEYPAIR="$KEYPAIR_PATH"
    node -e '
    const { Keypair } = require("@solana/web3.js");
    const fs = require("fs");
    try {
        fs.writeFileSync("'"$TARGET_KEYPAIR"'", JSON.stringify(Array.from(Keypair.generate().secretKey)));
    } catch {
        fs.mkdirSync("./solana", { recursive: true });
        fs.writeFileSync("./solana/keypair.json", JSON.stringify(Array.from(Keypair.generate().secretKey)));
    }
    '
    if [ ! -f "$TARGET_KEYPAIR" ] && [ -f "./solana/keypair.json" ]; then
        TARGET_KEYPAIR="./solana/keypair.json"
    fi
fi

echo "=================================================="
echo "⚡ SOLANA WALLET RPC BALANCE VERIFIER"
echo "=================================================="
echo "Keypair Location: $TARGET_KEYPAIR"

# Extract Public Key
PUBKEY=$(node -e '
const fs = require("fs");
const { Keypair } = require("@solana/web3.js");
try {
    const raw = JSON.parse(fs.readFileSync("'"$TARGET_KEYPAIR"'", "utf-8"));
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(kp.publicKey.toBase58());
} catch (e) {
    console.error("Failed to parse keypair:", e.message);
    process.exit(1);
}
')

echo "Public Key (Base58): $PUBKEY"
echo "Querying Solana Devnet RPC..."
echo "--------------------------------------------------"

# Query exact balance via Node.js @solana/web3.js with failover RPC endpoints
node -e '
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const rpcEndpoints = [
    process.env.SOLANA_RPC_URL,
    "https://api.devnet.solana.com",
    "https://rpc.ankr.com/solana_devnet"
].filter(Boolean);

async function checkBalance() {
    const pub = new PublicKey("'"$PUBKEY"'");
    let balanceLamports = null;
    let successfulRpc = null;

    for (const rpc of rpcEndpoints) {
        try {
            const conn = new Connection(rpc, "confirmed");
            balanceLamports = await conn.getBalance(pub);
            successfulRpc = rpc;
            break;
        } catch (err) {
            // Try next RPC
        }
    }

    if (balanceLamports === null) {
        console.log("❌ Could not connect to any Solana Devnet RPC endpoint.");
        process.exit(1);
    }

    const sol = balanceLamports / LAMPORTS_PER_SOL;
    console.log(`Active RPC:      ${successfulRpc}`);
    console.log(`Raw Lamports:    ${balanceLamports.toLocaleString()} lamports`);
    console.log(`SOL Balance:     ${sol.toFixed(9)} SOL`);
    console.log("--------------------------------------------------");

    if (sol > 0) {
        console.log("✅ STATUS: FUNDED & ACTIVE ON DEVNET");
        console.log("🎉 Ready to deploy Rust BPF program (solana program deploy)!");
    } else {
        console.log("⏳ STATUS: 0.000000000 SOL (Awaiting Airdrop / Funding)");
        console.log("Tip: If you recently claimed from a faucet, wait ~5 seconds for block confirmation.");
    }

    console.log("\n🔍 On-Chain Explorers:");
    console.log(`   Solana Explorer: https://explorer.solana.com/address/${pub.toBase58()}?cluster=devnet`);
    console.log(`   Solscan:         https://solscan.io/account/${pub.toBase58()}?cluster=devnet`);
}

checkBalance().catch(err => {
    console.error("Balance query error:", err.message);
    process.exit(1);
});
'

echo "=================================================="
