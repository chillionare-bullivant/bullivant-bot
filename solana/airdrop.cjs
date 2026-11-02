#!/usr/bin/env node
/**
 * ==============================================================================
 * SOLANA DEVNET AIRDROP & WALLET PROVISIONING ENGINE
 * ==============================================================================
 * Connects to Solana Devnet (or Alchemy Solana RPC) and requests free SOL tokens
 * for deploying and testing programs.
 */

const { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
require("dotenv").config();

async function getOrCreateKeypair() {
  const possiblePaths = [
    path.join(os.homedir(), ".config", "solana", "solana-deployer.json"),
    path.join(os.homedir(), ".config", "solana", "id.json"),
    path.join(__dirname, "keypair.json")
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
        const secretKey = Uint8Array.from(raw);
        const kp = Keypair.fromSecretKey(secretKey);
        console.log(`🔑 Loaded existing Solana keypair from: ${p}`);
        return { keypair: kp, filePath: p };
      } catch {}
    }
  }

  // Generate new keypair if none exists
  const newKp = Keypair.generate();
  const saveDir = path.join(os.homedir(), ".config", "solana");
  fs.mkdirSync(saveDir, { recursive: true });
  const savePath = path.join(saveDir, "solana-deployer.json");
  fs.writeFileSync(savePath, JSON.stringify(Array.from(newKp.secretKey)), "utf-8");
  console.log(`✨ Generated new Solana keypair and saved to: ${savePath}`);
  return { keypair: newKp, filePath: savePath };
}

async function runAirdrop() {
  console.log("==================================================");
  console.log("⚡ BULLIVANT SOLANA DEVNET AIRDROP UTILITY");
  console.log("==================================================");

  const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  console.log(`🌐 Target Network: ${rpcUrl}`);

  const connection = new Connection(rpcUrl, "confirmed");
  const { keypair, filePath } = await getOrCreateKeypair();
  const pubkey = keypair.publicKey;

  console.log(`📍 Wallet Address: ${pubkey.toBase58()}`);

  try {
    const initialBalance = await connection.getBalance(pubkey);
    console.log(`💰 Current Balance: ${(initialBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    console.log(`\n⏳ Requesting 1 SOL Devnet Airdrop from Faucet...`);
    const airdropSignature = await connection.requestAirdrop(
      pubkey,
      1 * LAMPORTS_PER_SOL
    );
    console.log(`📜 Airdrop Transaction Signature: ${airdropSignature}`);
    console.log(`⏳ Confirming transaction on Solana Devnet...`);

    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    const newBalance = await connection.getBalance(pubkey);
    console.log(`\n✅ Airdrop Successful!`);
    console.log(`🎉 New Balance: ${(newBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`🔍 View on Solana Explorer:`);
    console.log(`   https://explorer.solana.com/address/${pubkey.toBase58()}?cluster=devnet`);
  } catch (err) {
    console.log(`\n📌 Devnet Faucet Notice: ${err.message}`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`⚡ TO FUND YOUR SOLANA WALLET ON DEVNET:`);
    console.log(`1. Terminal Command (via Solana CLI on VPS):`);
    console.log(`   solana airdrop 2 ${pubkey.toBase58()} --url https://api.devnet.solana.com`);
    console.log(`\n2. Or 1-Click Web Faucet:`);
    console.log(`   https://faucet.solana.com`);
    console.log(`   Paste Address: ${pubkey.toBase58()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }
}

runAirdrop().catch(console.error);
