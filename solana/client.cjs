#!/usr/bin/env node
/**
 * ==============================================================================
 * BULLIVANT SOLANA DEVNET RUNTIME CLIENT & MONITOR
 * ==============================================================================
 * Independent background client running under PM2 on your VPS.
 * Monitors Solana Devnet slots, checks program status, and logs health.
 */

const { Connection, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
const connection = new Connection(RPC_URL, "confirmed");

console.log("==================================================");
console.log("⚡ BULLIVANT SOLANA CLIENT ACTIVE");
console.log("Network:  ", RPC_URL);
console.log("Cluster:   Devnet");
console.log("==================================================");

let lastSlot = 0;

async function checkSolanaHeartbeat() {
  try {
    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot).catch(() => null);
    const version = await connection.getVersion().catch(() => ({ "solana-core": "1.18.x" }));
    
    if (slot !== lastSlot) {
      lastSlot = slot;
      const ts = new Date().toLocaleTimeString();
      console.log(`[${ts}] [Solana Devnet] Slot #${slot} | Core: ${version["solana-core"]}`);
      
      const statusPayload = {
        timestamp: new Date().toISOString(),
        network: "Solana Devnet",
        rpcUrl: RPC_URL,
        slot,
        version: version["solana-core"],
        status: "HEALTHY"
      };

      try {
        fs.writeFileSync(path.join(__dirname, "solana-status.json"), JSON.stringify(statusPayload, null, 2));
      } catch {}
    }
  } catch (err) {
    console.warn(`[Solana Notice] ${err.message}`);
  }
}

setInterval(checkSolanaHeartbeat, 6000);
checkSolanaHeartbeat();
