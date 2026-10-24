// scripts/deploy.js
require("dotenv").config();
const hre = require("hardhat");

async function main() {
  console.log("==================================================");
  console.log("🚀 Starting Deployment to Base Network (Chain ID 8453)...");
  console.log("==================================================");

  // 1. Resolve Active Signer with sendTransaction capability
  let signer;
  const signers = await hre.ethers.getSigners();
  if (signers && signers.length > 0) {
    signer = signers[0];
  } else {
    // Explicitly instantiate signer from environment private key
    const rawKey = process.env.PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY;
    if (!rawKey) {
      throw new Error(
        "❌ No signer found. Please ensure PRIVATE_KEY=0x... is configured in your .env file."
      );
    }
    const cleanKey = rawKey.trim().startsWith("0x") ? rawKey.trim() : "0x" + rawKey.trim();
    signer = new hre.ethers.Wallet(cleanKey, hre.ethers.provider);
  }

  const deployerAddress = await signer.getAddress();
  console.log("Deployer Address (Signer):", deployerAddress);

  // Check ETH balance on Base
  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  const ethBalance = hre.ethers.formatEther(balance);
  console.log(`Base ETH Balance: ${ethBalance} ETH`);

  if (balance === 0n) {
    console.warn("⚠️ Warning: Deployer balance is 0 ETH on Base. Please ensure your wallet has ETH for deployment gas (~0.0001 ETH).");
  }

  // Aave V3 PoolAddressesProvider on Base Mainnet
  const AAVE_V3_BASE_ADDRESSES_PROVIDER = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";
  const OWNER_ADDRESS = process.env.OWNER_ADDRESS || deployerAddress;

  console.log("Aave V3 Addresses Provider:", AAVE_V3_BASE_ADDRESSES_PROVIDER);
  console.log("Contract Owner Address:     ", OWNER_ADDRESS);

  // 2. Attach Signer explicitly to ContractFactory (prevents UNSUPPORTED_OPERATION error)
  console.log("\n📦 Compiling & broadcasting FlashLoanLeverage contract...");
  const FlashLoanLeverage = await hre.ethers.getContractFactory("FlashLoanLeverage", signer);

  const contract = await FlashLoanLeverage.deploy(
    AAVE_V3_BASE_ADDRESSES_PROVIDER,
    OWNER_ADDRESS
  );

  console.log("⏳ Waiting for transaction confirmation on Base...");
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n==================================================");
  console.log("🎉 SUCCESS! FlashLoanLeverage Deployed to Base Mainnet!");
  console.log("Contract Address:", contractAddress);
  console.log("Owner Beneficiary:", OWNER_ADDRESS);
  console.log("BaseScan Explorer: https://basescan.org/address/" + contractAddress);
  console.log("==================================================");
  console.log("\nAdd this to your .env file on VPS:");
  console.log(`FLASH_LOAN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`LEVERAGE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("==================================================");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error.reason || error.message || error);
  process.exitCode = 1;
});
