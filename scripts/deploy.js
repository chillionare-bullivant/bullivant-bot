// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  console.log("==================================================");
  console.log("Starting Deployment to Base Network...");
  console.log("==================================================");

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = deployer ? await deployer.getAddress() : "0xD6d68800CD199D990C7ACCff409bE60c6508660a";
  console.log("Deployer Address:", deployerAddress);

  // Aave V3 PoolAddressesProvider on Base Mainnet
  const AAVE_V3_BASE_ADDRESSES_PROVIDER = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";
  const OWNER_ADDRESS = process.env.OWNER_ADDRESS || "0xD6d68800CD199D990C7ACCff409bE60c6508660a";

  console.log("Aave V3 Addresses Provider:", AAVE_V3_BASE_ADDRESSES_PROVIDER);
  console.log("Contract Owner Address:", OWNER_ADDRESS);

  const FlashLoanLeverage = await hre.ethers.getContractFactory("FlashLoanLeverage");
  const contract = await FlashLoanLeverage.deploy(
    AAVE_V3_BASE_ADDRESSES_PROVIDER,
    OWNER_ADDRESS
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("==================================================");
  console.log("SUCCESS! FlashLoanLeverage Deployed to Base:");
  console.log("Contract Address:", contractAddress);
  console.log("Owner:", OWNER_ADDRESS);
  console.log("Aave V3 Provider:", AAVE_V3_BASE_ADDRESSES_PROVIDER);
  console.log("==================================================");
  console.log("\nAdd this to your .env file:");
  console.log(`LEVERAGE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
