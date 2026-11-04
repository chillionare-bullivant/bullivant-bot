#!/usr/bin/env node
/**
 * ==============================================================================
 * BULLIVANT SOLANA PROGRAM INTERACTOR & EXECUTOR
 * ==============================================================================
 * Interacts with the deployed hello_world Solana program by constructing and
 * sending an instruction to the cluster (Localhost or Devnet).
 */

const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  sendAndConfirmTransaction 
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("==================================================");
  console.log("⚡ BULLIVANT SOLANA PROGRAM INTERACTION TESTER");
  console.log("==================================================");

  // 1. Resolve Deployer Wallet
  const keypairPaths = [
    "/root/.config/solana/solana-deployer.json",
    path.join(process.env.HOME || "/root", ".config/solana/solana-deployer.json"),
    path.join(__dirname, "keypair.json")
  ];

  let payer = null;
  for (const kpPath of keypairPaths) {
    if (fs.existsSync(kpPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
        payer = Keypair.fromSecretKey(Uint8Array.from(raw));
        console.log(`🔑 Loaded Payer Keypair: ${payer.publicKey.toBase58()}`);
        break;
      } catch {}
    }
  }

  if (!payer) {
    console.error("❌ Payer keypair not found!");
    process.exit(1);
  }

  // 2. Resolve Program ID
  const programKeypairPath = path.join(__dirname, "program/target/deploy/hello_world-keypair.json");
  let programId = null;

  if (fs.existsSync(programKeypairPath)) {
    try {
      const rawProg = JSON.parse(fs.readFileSync(programKeypairPath, "utf-8"));
      const progKp = Keypair.fromSecretKey(Uint8Array.from(rawProg));
      programId = progKp.publicKey;
      console.log(`📦 Found Deployed Program ID: ${programId.toBase58()}`);
    } catch {}
  }

  // 3. Connect to RPC (check localhost first, fallback to devnet)
  const endpoints = ["http://127.0.0.1:8899", "https://api.devnet.solana.com"];
  let connection = null;
  let activeUrl = null;

  for (const url of endpoints) {
    try {
      const conn = new Connection(url, "confirmed");
      const ver = await conn.getVersion();
      connection = conn;
      activeUrl = url;
      console.log(`🌐 Connected to Solana RPC: ${url} (Core: ${ver["solana-core"]})`);
      break;
    } catch {}
  }

  if (!connection) {
    console.error("❌ Unable to connect to Solana RPC.");
    process.exit(1);
  }

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 Payer Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  if (!programId) {
    console.log("⚠️ Program keypair not found at target/deploy. Querying active programs on cluster...");
    const programs = await connection.getProgramAccounts(new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
    if (programs.length > 0) {
      programId = programs[0].pubkey;
      console.log(`✓ Using cluster program: ${programId.toBase58()}`);
    } else {
      console.log("ℹ️ No custom programs detected yet. Run 'bash solana/deploy.sh' to deploy.");
      process.exit(0);
    }
  }

  // 4. Send Execution Transaction
  console.log("\n🚀 Dispatching execution transaction to program...");
  try {
    const instruction = new TransactionInstruction({
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
      programId: programId,
      data: Buffer.alloc(0), // No instruction data required for hello_world
    });

    const tx = new Transaction().add(instruction);
    const txSig = await sendAndConfirmTransaction(connection, tx, [payer]);

    console.log("🎉 TRANSACTION CONFIRMED ON-CHAIN!");
    console.log(`✓ Signature: ${txSig}`);
    if (activeUrl.includes("devnet")) {
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
    } else {
      console.log(`🔍 Localhost Transaction verified in block!`);
    }
  } catch (err) {
    console.log(`Execution note: ${err.message}`);
  }

  console.log("==================================================");
}

main().catch(console.error);
