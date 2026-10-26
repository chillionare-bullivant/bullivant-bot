#!/usr/bin/env node
/**
 * ==============================================================================
 * BULLIVANT RECOVERY PHRASE TO PRIVATE KEY DERIVER
 * ==============================================================================
 * Derives your Ethereum / Base private keys from your 12 or 24-word recovery phrase.
 * Scans addresses on Base Mainnet to identify your active funded wallet (0xD6d6...60a).
 * Optionally writes the matching private key directly into your .env file.
 */

const { ethers } = require("ethers");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const TARGET_ADDRESS = "0xD6d68800CD199D990C7ACCff409bE60c6508660a".toLowerCase();
const BASE_RPC_URL = "https://mainnet.base.org";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("==================================================");
  console.log("🔐 Coinbase Wallet Seed Phrase Key Deriver");
  console.log("==================================================");

  let phrase = process.argv.slice(2).join(" ").trim();

  if (!phrase && process.env.SEED_PHRASE) {
    phrase = process.env.SEED_PHRASE.trim();
  }

  if (!phrase) {
    console.log("\nPlease paste your 12 or 24-word Coinbase Wallet recovery phrase:");
    console.log("(Inputs are processed 100% locally on your machine and never transmitted)\n");
    phrase = await ask("Recovery Phrase > ");
  }

  // Normalize mnemonic phrase
  phrase = phrase.trim().replace(/\s+/g, " ").toLowerCase();
  const wordCount = phrase.split(" ").length;

  if (wordCount !== 12 && wordCount !== 15 && wordCount !== 18 && wordCount !== 21 && wordCount !== 24) {
    console.error(`\n❌ Invalid word count: got ${wordCount} words. Expected 12 or 24 words.`);
    rl.close();
    process.exit(1);
  }

  console.log(`\n⏳ Validating ${wordCount}-word mnemonic and scanning Base Mainnet...`);

  let provider;
  try {
    provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  } catch (err) {
    console.warn("Could not connect to Base RPC, continuing offline...");
  }

  let matchedWallet = null;
  const derivedAccounts = [];

  for (let index = 0; index < 5; index++) {
    const derivationPath = `m/44'/60'/0'/0/${index}`;
    try {
      const wallet = ethers.HDNodeWallet.fromPhrase(phrase, undefined, derivationPath);
      let balanceEth = "0.0000";

      if (provider) {
        try {
          const balWei = await provider.getBalance(wallet.address);
          balanceEth = parseFloat(ethers.formatEther(balWei)).toFixed(5);
        } catch {}
      }

      const isTarget = wallet.address.toLowerCase() === TARGET_ADDRESS;
      if (isTarget) {
        matchedWallet = wallet;
      }

      derivedAccounts.push({
        index,
        path: derivationPath,
        address: wallet.address,
        privateKey: wallet.privateKey,
        balanceEth,
        isTarget,
      });
    } catch (deriveErr) {
      console.error(`Error deriving index ${index}:`, deriveErr.message);
    }
  }

  console.log("\n==================================================");
  console.log("📋 Derived Base Accounts from Recovery Phrase:");
  console.log("==================================================");

  derivedAccounts.forEach((acc) => {
    const star = acc.isTarget ? " ⭐ [YOUR TARGET WALLET]" : "";
    console.log(`\nAccount #${acc.index} (${acc.path})${star}`);
    console.log(`   Address:     ${acc.address}`);
    console.log(`   Private Key: ${acc.privateKey}`);
    console.log(`   Base ETH:    ${acc.balanceEth} ETH`);
  });

  const selectedWallet = matchedWallet || derivedAccounts[0];

  console.log("\n==================================================");
  if (matchedWallet) {
    console.log(`🎉 Found exact match for your target Coinbase Wallet!`);
    console.log(`   Address:     ${matchedWallet.address}`);
    console.log(`   Private Key: ${matchedWallet.privateKey}`);
  } else {
    console.log(`ℹ️ Selected primary account (Index #0):`);
    console.log(`   Address:     ${selectedWallet.address}`);
    console.log(`   Private Key: ${selectedWallet.privateKey}`);
  }
  console.log("==================================================");

  const saveEnv = await ask("\nWould you like to automatically save this PRIVATE_KEY to your .env file? (y/n) > ");

  if (saveEnv.trim().toLowerCase() === "y" || saveEnv.trim().toLowerCase() === "yes") {
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    if (envContent.includes("PRIVATE_KEY=")) {
      envContent = envContent.replace(/PRIVATE_KEY=.*/g, `PRIVATE_KEY="${selectedWallet.privateKey}"`);
    } else {
      envContent += `\nPRIVATE_KEY="${selectedWallet.privateKey}"\n`;
    }

    if (envContent.includes("SIGNER_PRIVATE_KEY=")) {
      envContent = envContent.replace(/SIGNER_PRIVATE_KEY=.*/g, `SIGNER_PRIVATE_KEY="${selectedWallet.privateKey}"`);
    } else {
      envContent += `SIGNER_PRIVATE_KEY="${selectedWallet.privateKey}"\n`;
    }

    if (envContent.includes("OWNER_ADDRESS=")) {
      envContent = envContent.replace(/OWNER_ADDRESS=.*/g, `OWNER_ADDRESS="${selectedWallet.address}"`);
    } else {
      envContent += `OWNER_ADDRESS="${selectedWallet.address}"\n`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log(`\n✅ Successfully updated .env with your private key!`);
    console.log(`👉 You can now run 'bash deploy-contract.sh' to deploy your flash loan contract!`);
  } else {
    console.log("\nSkipped saving to .env. You can manually copy the private key above.");
  }

  rl.close();
}

main().catch((err) => {
  console.error("\n❌ Derivation failed:", err.message);
  rl.close();
  process.exit(1);
});
